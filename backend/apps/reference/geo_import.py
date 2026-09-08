"""
Shared helpers for the GeoJSON import commands (import_gadm, import_natural_earth).

Downloads never raise: a single timeout must not lose the rest of a multi-file
import. Each command decides how to report the failures it collects.
"""

import json
import urllib.error
import urllib.request

USER_AGENT = "ARBM-MES/1.0"
TIMEOUT = 120


def fetch_geojson(url, stdout):
    """Download and parse a GeoJSON document.

    Returns a tuple (status, payload):
        ("ok", dict)      downloaded and parsed
        ("absent", None)  HTTP 404
        ("echec", str)    network/server error, human-readable reason

    The "echec" status keeps its historical (French) name because import_gadm
    and its callers match on it.
    """
    stdout.write(f"  ↓ {url}")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return "ok", json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return "absent", None
        return "echec", f"HTTP {e.code}"
    except Exception as e:
        return "echec", f"{type(e).__name__} : {e}"


def load_geojson_file(path):
    """Parse a local GeoJSON file (offline runs and tests)."""
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def geom_from_feature(feature):
    """GeoJSON feature → GEOS MultiPolygon (SRID 4326), or None if unusable."""
    try:
        from django.contrib.gis.geos import GEOSGeometry, MultiPolygon
        geom = GEOSGeometry(json.dumps(feature["geometry"]), srid=4326)
        if geom.geom_type == "Polygon":
            geom = MultiPolygon(geom, srid=4326)
        if geom.geom_type != "MultiPolygon":
            return None
        return geom
    except Exception:
        return None


def point_from_feature(feature):
    """GeoJSON feature → GEOS Point (SRID 4326), or None if unusable."""
    try:
        from django.contrib.gis.geos import GEOSGeometry
        geom = GEOSGeometry(json.dumps(feature["geometry"]), srid=4326)
        if geom.geom_type == "MultiPoint" and len(geom) == 1:
            geom = geom[0]
            geom.srid = 4326
        if geom.geom_type != "Point":
            return None
        return geom
    except Exception:
        return None
