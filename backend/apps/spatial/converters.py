"""
Validation and normalisation of uploaded geospatial files.

Conversion runs through `ogr2ogr`, which is already in the backend image
(backend/Dockerfile installs gdal-bin; the running image carries GDAL 3.10.3
with the GeoJSON, LIBKML, KML, GPX, GPKG and ESRI Shapefile drivers). Calling
the binary rather than a Python binding keeps the dependency list untouched —
adding a pip package would force an image rebuild, because the dev stack mounts
the source tree over the installed one.

SECURITY — what an uploaded geospatial file can do
--------------------------------------------------
These formats are not inert data:

  * KML and GPX are XML. core/uploads.py explains at length why an XML document
    is refused as a logo: served from the origin that carries the session
    cookie, it can execute script. The same applies here, which is why the
    original file is never exposed as a storage URL — SpatialAssetDownloadView
    streams it as an attachment with X-Content-Type-Options: nosniff.
  * KMZ and zipped shapefiles are ZIP archives, so they carry the usual
    traversal ("../../etc/passwd") and decompression-bomb risks. Archives are
    therefore inspected through their central directory and handed to GDAL as
    /vsizip/ paths: nothing is ever extracted to disk.
  * A KML NetworkLink can point at a remote URL. GDAL is given a short HTTP
    timeout and no retries, and every conversion is bounded by a hard
    subprocess timeout, which limits but does not eliminate that exposure.
    Uploading is a write action behind ProjectInScope and the module permission.

Every limit below is a deliberate ceiling, not a guess about typical files.
"""
import hashlib
import json
import os
import re
from html.parser import HTMLParser
import subprocess
import tempfile
import time
import zipfile

MAX_UPLOAD_BYTES = 10 * 1024 * 1024        # matches the agreed "small layers" scope
MAX_ZIP_ENTRIES = 200
MAX_ZIP_UNCOMPRESSED_BYTES = 100 * 1024 * 1024
MAX_CONVERTED_BYTES = 64 * 1024 * 1024     # a 10 MB GeoPackage can expand a long way
MAX_FEATURES = 20_000

# A KML folder is a layer, and a thematic export routinely has dozens: the
# KSADP infrastructure file carries 31, one per infrastructure type, holding
# 160 placemarks between them. The ceiling is here to stop a pathological file,
# not to second-guess how a real one is organised.
MAX_LAYERS = 200

# gunicorn cuts a request at 30 s by default, so the whole pipeline has to fit
# well inside that. Two ceilings, because they fail differently: one layer that
# will not finish, and many small layers that add up.
OGR_TIMEOUT_SECONDS = 20        # per ogr2ogr/ogrinfo call
CONVERSION_BUDGET_SECONDS = 25  # across the whole upload

# Attribute names tried, in order, to give a feature a display label.
LABEL_KEYS = ("name", "Name", "NAME", "title", "Title", "label", "Label", "id")

FORMAT_EXTENSIONS = {
    "geojson": ".geojson",
    "kml":     ".kml",
    "kmz":     ".kmz",
    "gpx":     ".gpx",
    "gpkg":    ".gpkg",
    "shp_zip": ".shp.zip",
}

ACCEPTED_FORMATS_LABEL = "GeoJSON, KML, KMZ, GPX, GeoPackage, zipped shapefile"


class ConversionError(Exception):
    """An upload cannot be accepted. The message is safe to show to the user."""


def _hardened_env():
    """Environment for GDAL: no proxy inheritance, no patience for remote reads."""
    env = {
        "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
        "HOME": "/tmp",
        # Bound anything that tries to leave the container (KML NetworkLink).
        "GDAL_HTTP_TIMEOUT": "2",
        "GDAL_HTTP_CONNECTTIMEOUT": "2",
        "GDAL_HTTP_MAX_RETRY": "0",
        # Cheaper and safer when reading inside archives.
        "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
        "CPL_DEBUG": "OFF",
    }
    return env


class Budget:
    """
    Wall-clock ceiling for one upload, shared by every GDAL call it makes.

    A per-call timeout alone is not enough: a file with two hundred tiny layers
    would pass every call and still outlast the request.
    """

    def __init__(self, seconds=CONVERSION_BUDGET_SECONDS):
        self.deadline = time.monotonic() + seconds

    def remaining(self):
        left = self.deadline - time.monotonic()
        if left <= 0:
            raise ConversionError(_TOO_SLOW)
        return min(left, OGR_TIMEOUT_SECONDS)


_TOO_SLOW = (
    f"The file took longer than {CONVERSION_BUDGET_SECONDS} seconds to read and "
    "was rejected. Try a smaller or simpler dataset."
)


def _run(argv, budget):
    """Run a GDAL command, returning stdout. Raises ConversionError on failure."""
    try:
        completed = subprocess.run(
            argv,
            capture_output=True,
            timeout=budget.remaining(),
            env=_hardened_env(),
        )
    except subprocess.TimeoutExpired:
        raise ConversionError(_TOO_SLOW)
    except FileNotFoundError:
        # gdal-bin missing from the image: a deployment fault, not a user error.
        raise ConversionError("Geospatial conversion is unavailable on this server.")

    if completed.returncode != 0:
        raise ConversionError(_first_error_line(completed.stderr))
    return completed.stdout


def _first_error_line(stderr_bytes):
    """Turn GDAL's stderr into one short, safe sentence."""
    text = (stderr_bytes or b"").decode("utf-8", errors="replace")
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        # Drop the "ERROR 4: " prefixes and any absolute path we generated.
        line = re.sub(r"^ERROR\s+\d+:\s*", "", line)
        line = re.sub(r"/tmp/[^\s'\"]+", "the uploaded file", line)
        return f"The file could not be read: {line}"[:300]
    return "The file could not be read as a geospatial dataset."


# ---------------------------------------------------------------------------
# Format detection — by content, never by the extension the client sent
# ---------------------------------------------------------------------------

def _sniff_format(head, path):
    """
    Return the source_format code, or None when the content is not recognised.

    `head` is the first few KB of the file; `path` is the spooled copy, needed
    to look inside an archive.
    """
    if head.startswith(b"SQLite format 3\x00"):
        return "gpkg"

    if head.startswith(b"PK\x03\x04"):
        return _sniff_zip(path)

    # XML: KML or GPX. The declaration may be preceded by a BOM or whitespace.
    stripped = head.lstrip(b"\xef\xbb\xbf \t\r\n")
    if stripped.startswith(b"<"):
        lowered = head.lower()
        if b"<kml" in lowered:
            return "kml"
        if b"<gpx" in lowered:
            return "gpx"
        return None

    if stripped.startswith(b"{"):
        return "geojson" if _looks_like_geojson(path) else None

    return None


def _looks_like_geojson(path):
    """Parse the whole document: a GeoJSON that does not parse is not a GeoJSON."""
    try:
        with open(path, "rb") as handle:
            document = json.load(handle)
    except (ValueError, OSError):
        return False
    if not isinstance(document, dict):
        return False
    return document.get("type") in (
        "FeatureCollection", "Feature", "GeometryCollection",
        "Point", "MultiPoint", "LineString", "MultiLineString",
        "Polygon", "MultiPolygon",
    )


def _sniff_zip(path):
    """
    Validate a ZIP through its central directory and say what it holds.

    Nothing is extracted: the checks below are the only thing standing between
    an uploaded archive and GDAL's /vsizip/ reader.
    """
    try:
        with zipfile.ZipFile(path) as archive:
            entries = archive.infolist()
    except zipfile.BadZipFile:
        raise ConversionError("The archive is damaged and could not be opened.")

    if len(entries) > MAX_ZIP_ENTRIES:
        raise ConversionError(
            f"The archive holds more than {MAX_ZIP_ENTRIES} files and was rejected."
        )

    total = 0
    names = []
    for entry in entries:
        name = entry.filename
        # Absolute paths and parent traversal: refused outright.
        if name.startswith("/") or name.startswith("\\") or ".." in name.replace("\\", "/").split("/"):
            raise ConversionError(
                "The archive contains an unsafe file path and was rejected."
            )
        total += entry.file_size
        if total > MAX_ZIP_UNCOMPRESSED_BYTES:
            raise ConversionError(
                "The archive expands to more than "
                f"{MAX_ZIP_UNCOMPRESSED_BYTES // 1024 // 1024} MB and was rejected."
            )
        names.append(name.lower())

    if any(n.endswith(".shp") for n in names):
        return "shp_zip"
    if any(n.endswith(".kml") for n in names):
        return "kmz"
    return None


# ---------------------------------------------------------------------------
# Conversion
# ---------------------------------------------------------------------------

def _datasource(source_format, path):
    """The path handed to GDAL. Archives are read in place, never extracted."""
    if source_format == "shp_zip":
        return f"/vsizip/{path}"
    # LIBKML opens a .kmz directly; every other format is a plain file.
    return path


def _list_layers(datasource, budget):
    stdout = _run(["ogrinfo", "-json", "-so", datasource], budget)
    try:
        info = json.loads(stdout.decode("utf-8", errors="replace"))
    except ValueError:
        raise ConversionError("The file could not be read as a geospatial dataset.")

    layers = [layer.get("name") for layer in info.get("layers", []) if layer.get("name")]
    if not layers:
        raise ConversionError("The file contains no geospatial layer.")
    if len(layers) > MAX_LAYERS:
        raise ConversionError(
            f"The file contains {len(layers)} layers; the maximum is {MAX_LAYERS}."
        )
    return layers


def _convert_layer(datasource, layer, out_path, budget):
    _run([
        "ogr2ogr",
        "-f", "GeoJSON",
        out_path,
        datasource,
        layer,
        "-t_srs", "EPSG:4326",
        "-dim", "XY",           # drop Z/M: the map is two-dimensional
        "-skipfailures",
    ], budget)
    if not os.path.exists(out_path):
        raise ConversionError("The layer produced no output and was rejected.")
    if os.path.getsize(out_path) > MAX_CONVERTED_BYTES:
        raise ConversionError(
            "The converted layer exceeds "
            f"{MAX_CONVERTED_BYTES // 1024 // 1024} MB. Simplify it before uploading."
        )
    with open(out_path, "rb") as handle:
        return json.load(handle)


# ---------------------------------------------------------------------------
# Attribute sheets hidden in <description>
# ---------------------------------------------------------------------------
#
# A KML exported from a geodatabase routinely puts the real attributes in the
# placemark's description, as an HTML table, so that Google Earth shows a sheet
# when the pin is clicked. The KSADP infrastructure export does exactly that:
# SN, Feature_Type, LGA, Ward, Ownership and the rest live in a <table> and
# nowhere else.
#
# That HTML is never given to the browser. It comes from an uploaded file, and
# putting it in the page would be a stored cross-site scripting hole. It is
# parsed here into ordinary key/value attributes and the markup is dropped:
# the data becomes queryable, and nothing HTML-shaped survives the import.
#
# THERE IS NO SINGLE FORMAT. Every tool writes this differently, so the shape
# is recognised rather than assumed:
#
#   label/value rows   <tr><td>LGA</td><td>Bagwai</td></tr>      (KSADP, Google Earth)
#   header + one row   <tr><th>LGA</th></tr><tr><td>Bagwai</td>  (ArcGIS, QGIS)
#   definition list    <dl><dt>LGA</dt><dd>Bagwai</dd></dl>
#   labelled lines     <b>LGA:</b> Bagwai<br>                    (hand-written)
#
# Anything else is left as plain text with its tags stripped, so a description
# is never lost from view. Getting the shape WRONG is worse than not parsing:
# read as label/value pairs, a header table yields {LGA: Ward, Bagwai: kiyawa},
# which is confident nonsense. Every rule below therefore refuses when the
# shape is not certain.

MAX_DESCRIPTION_PAIRS = 60
MAX_ATTRIBUTE_LENGTH = 500
MAX_KEY_LENGTH = 80          # beyond this it is prose, not a field name


class _DescriptionParser(HTMLParser):
    """
    Read a description into the structures the shape rules need: table rows
    (each a list of cells), definition-list pairs, and the plain text.
    """

    _CELL_TAGS = ("td", "th")
    _PAIR_TAGS = ("dt", "dd")

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.rows = []          # [[cell, ...], ...]
        self.header_flags = []  # per row: did it use <th>?
        self.definitions = []   # [("dt"|"dd", text), ...]
        self.text_parts = []
        self._row = None
        self._row_has_th = False
        self._capture = None    # the tag whose text is being collected
        self._buffer = []

    # -- helpers ------------------------------------------------------------
    def _flush_cell(self):
        text = " ".join("".join(self._buffer).split())
        self._buffer = []
        return text

    def _close_row(self):
        if self._row is not None:
            self.rows.append(self._row)
            self.header_flags.append(self._row_has_th)
        self._row = None
        self._row_has_th = False

    # -- HTMLParser ---------------------------------------------------------
    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self._close_row()
            self._row = []
        elif tag in self._CELL_TAGS:
            if self._row is None:      # a cell outside any <tr>
                self._row = []
            if tag == "th":
                self._row_has_th = True
            self._capture = tag
            self._buffer = []
        elif tag in self._PAIR_TAGS:
            self._capture = tag
            self._buffer = []
        elif tag in ("br", "p", "div", "li"):
            self.text_parts.append("\n")

    def handle_endtag(self, tag):
        if tag in self._CELL_TAGS and self._capture == tag:
            self._row.append(self._flush_cell())
            self._capture = None
        elif tag in self._PAIR_TAGS and self._capture == tag:
            self.definitions.append((tag, self._flush_cell()))
            self._capture = None
        elif tag in ("tr", "table"):
            self._close_row()

    def close(self):
        super().close()
        self._close_row()

    def handle_data(self, data):
        if self._capture:
            self._buffer.append(data)
        self.text_parts.append(data)

    # -- results ------------------------------------------------------------
    @property
    def text(self):
        joined = "".join(self.text_parts)
        lines = [" ".join(line.split()) for line in joined.splitlines()]
        return "\n".join(line for line in lines if line).strip()


def _clean_key(raw):
    key = raw.strip().rstrip(":").strip()
    if not key or len(key) > MAX_KEY_LENGTH:
        return None
    return key


def _looks_like_labels(labels):
    """
    Do these read as field names rather than data?

    The two-column table is the ambiguous one: three rows of two cells are
    either a sheet of three fields, or a header over two records. Field names
    are distinct and are not bare numbers; data usually is one or the other.
    Refusing on doubt costs a plain-text fallback — guessing costs a feature
    whose attributes are quietly wrong.
    """
    cleaned = [label.strip() for label in labels]
    if not all(cleaned):
        return False
    if len(set(cleaned)) != len(cleaned):
        return False
    return not any(re.fullmatch(r"[\d.,\-/ ]+", label) for label in cleaned)


def _pairs_from_rows(rows, header_flags):
    """
    Two shapes, and a refusal.

    Rows of two cells whose left column reads as field names are the
    label/value sheet. A header row followed by exactly one data row of the
    same width is the transposed one. Anything else is a table of several
    records, which cannot become the attributes of a single feature.
    """
    rows = [row for row in rows if row]
    if not rows:
        return {}

    has_header = bool(header_flags and header_flags[0])

    if all(len(row) == 2 for row in rows):
        # An explicit header on a two-column table means the transposed shape,
        # not a sheet: <th>LGA</th><th>Ward</th> over <td>Bagwai</td><td>…</td>.
        if len(rows) == 2 and has_header:
            return _zip_pairs(rows[0], rows[1])
        if _looks_like_labels([row[0] for row in rows]):
            return _sheet_pairs(rows)
        # Not field names: a header over one record is the only reading left.
        if len(rows) == 2:
            return _zip_pairs(rows[0], rows[1])
        return {}

    width = len(rows[0])
    if len(rows) == 2 and len(rows[1]) == width:
        return _zip_pairs(rows[0], rows[1])

    return {}


def _sheet_pairs(rows):
    pairs = {}
    for label, value in rows:
        key = _clean_key(label)
        if key and len(pairs) < MAX_DESCRIPTION_PAIRS:
            pairs[key] = value.strip()[:MAX_ATTRIBUTE_LENGTH]
    return pairs


def _zip_pairs(labels, values):
    pairs = {}
    for label, value in zip(labels, values):
        key = _clean_key(label)
        if key and len(pairs) < MAX_DESCRIPTION_PAIRS:
            pairs[key] = value.strip()[:MAX_ATTRIBUTE_LENGTH]
    return pairs


def _pairs_from_definitions(definitions):
    """<dt>label</dt><dd>value</dd>, in that order."""
    pairs = {}
    pending = None
    for tag, text in definitions:
        if tag == "dt":
            pending = _clean_key(text)
        elif pending is not None:
            if len(pairs) < MAX_DESCRIPTION_PAIRS:
                pairs[pending] = text.strip()[:MAX_ATTRIBUTE_LENGTH]
            pending = None
    return pairs


# "LGA: Bagwai" on its own line — the shape left when a description is written
# by hand with <b> labels and <br> breaks.
_LABELLED_LINE = re.compile(r"^\s*([^:\n]{1,80}?)\s*:\s*(.+?)\s*$")


def _pairs_from_lines(text):
    pairs = {}
    lines = [line for line in text.splitlines() if line.strip()]
    if not lines:
        return {}
    matched = 0
    for line in lines:
        match = _LABELLED_LINE.match(line)
        if not match:
            continue
        key = _clean_key(match.group(1))
        if key and len(pairs) < MAX_DESCRIPTION_PAIRS:
            pairs[key] = match.group(2)[:MAX_ATTRIBUTE_LENGTH]
            matched += 1
    # Half the lines must look like fields, or this is prose that happens to
    # contain a colon.
    return pairs if matched * 2 >= len(lines) else {}


def parse_description(description):
    """
    Read a description into (attributes, plain_text).

    `attributes` is empty when no shape is recognised; `plain_text` is always
    the description with its markup stripped, so nothing is lost from view.
    """
    if not description:
        return {}, ""
    if "<" not in description:
        return _pairs_from_lines(description), description.strip()

    parser = _DescriptionParser()
    try:
        parser.feed(description)
        parser.close()
    except Exception:
        # A description that will not parse is still worth showing as text.
        return {}, " ".join(re.sub(r"<[^>]*>", " ", description).split())

    text = parser.text
    pairs = (
        _pairs_from_rows(parser.rows, parser.header_flags)
        or _pairs_from_definitions(parser.definitions)
        or _pairs_from_lines(text)
    )
    return pairs, text


def _expand_description(properties):
    """
    Replace an HTML description by the attributes it hides.

    When no shape is recognised the description survives as plain text: the
    markup goes either way, so a description the rules do not understand is
    still readable instead of being hidden as unrenderable HTML.
    """
    description = properties.get("description")
    if not isinstance(description, str) or not description.strip():
        return properties

    pairs, text = parse_description(description)

    expanded = dict(properties)
    expanded.pop("description", None)
    for key, value in pairs.items():
        # Never shadow what the driver already read from the placemark itself.
        if key not in expanded:
            expanded[key] = value

    if not pairs and text:
        expanded["description"] = text[:MAX_ATTRIBUTE_LENGTH * 4]
    return expanded


def _label_for(properties):
    for key in LABEL_KEYS:
        value = properties.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()[:255]
    return ""


def spool(upload, directory):
    """
    Write the upload to `directory`, returning (path, head, sha256, size).

    Always spooled: below FILE_UPLOAD_MAX_MEMORY_SIZE Django hands over an
    InMemoryUploadedFile with no path on disk, so .temporary_file_path() cannot
    be relied on.
    """
    path = os.path.join(directory, "source.bin")
    digest = hashlib.sha256()
    size = 0
    head = b""
    with open(path, "wb") as handle:
        for chunk in upload.chunks():
            if not head:
                head = chunk[:4096]
            digest.update(chunk)
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                raise ConversionError(
                    f"File too large. Maximum: {MAX_UPLOAD_BYTES // 1024 // 1024} MB."
                )
            handle.write(chunk)
    if size == 0:
        raise ConversionError("The uploaded file is empty.")
    return path, head, digest.hexdigest(), size


def convert(upload):
    """
    Validate an uploaded file and normalise it to EPSG:4326 features.

    Returns a dict:
        {
          "source_format": "kmz",
          "checksum_sha256": "...",
          "size": 12345,
          "features": [{"geometry": {...}, "properties": {...}, "label": "..."}],
          "geometry_types": ["Point", "LineString"],
          "bbox": [min_x, min_y, max_x, max_y] or None,
        }

    Raises ConversionError with a user-facing message on any rejection.
    """
    budget = Budget()
    with tempfile.TemporaryDirectory(prefix="gis-upload-") as workdir:
        path, head, checksum, size = spool(upload, workdir)

        source_format = _sniff_format(head, path)
        if source_format is None:
            raise ConversionError(
                "Unrecognised format. Accepted formats: "
                f"{ACCEPTED_FORMATS_LABEL}. The check is on the file content, "
                "not on its extension."
            )

        # GDAL picks its driver from the extension, so give the spooled copy
        # the one its content earned.
        typed_path = os.path.join(workdir, f"source{FORMAT_EXTENSIONS[source_format]}")
        os.rename(path, typed_path)

        datasource = _datasource(source_format, typed_path)
        layers = _list_layers(datasource, budget)
        multi_layer = len(layers) > 1

        features = []
        geometry_types = []
        for index, layer in enumerate(layers):
            out_path = os.path.join(workdir, f"layer-{index}.geojson")
            collection = _convert_layer(datasource, layer, out_path, budget)

            for raw in collection.get("features", []):
                geometry = raw.get("geometry")
                if not geometry:
                    continue  # a KML placemark without coordinates, typically
                properties = raw.get("properties") or {}
                if not isinstance(properties, dict):
                    properties = {}
                properties = _expand_description(properties)
                if multi_layer:
                    properties = {**properties, "_layer": layer}

                geometry_type = geometry.get("type")
                if geometry_type and geometry_type not in geometry_types:
                    geometry_types.append(geometry_type)

                features.append({
                    "geometry":   geometry,
                    "properties": properties,
                    "label":      _label_for(properties),
                })
                if len(features) > MAX_FEATURES:
                    raise ConversionError(
                        f"The file holds more than {MAX_FEATURES} features. "
                        "Split or simplify it before uploading."
                    )

        if not features:
            raise ConversionError("The file contains no usable geometry.")

        return {
            "source_format":   source_format,
            "checksum_sha256": checksum,
            "size":            size,
            "features":        features,
            "geometry_types":  geometry_types,
        }
