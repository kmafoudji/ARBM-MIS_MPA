"""
Tests for the M5 GIS assets registry.

What they pin down: the format check reads the file's content and not its
extension, archives cannot carry a path out of their own tree, the original is
only ever handed back as an attachment, and deletion is a soft delete.
"""
import io
import json
import zipfile

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.spatial.converters import parse_description
from apps.spatial.models import SpatialAsset, SpatialAssetFeature
from tests.factories import ProjectFactory, UserFactory

POINT_GEOJSON = {
    "type": "FeatureCollection",
    "features": [
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [2.35, 48.85]},
            "properties": {"name": "Paris"},
        },
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [-17.44, 14.69]},
            "properties": {"name": "Dakar"},
        },
    ],
}

KML_DOCUMENT = """<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>Site A</name>
      <Point><coordinates>2.35,48.85,0</coordinates></Point>
    </Placemark>
  </Document>
</kml>
"""


@pytest.fixture
def user():
    return UserFactory()


@pytest.fixture
def client(user):
    api = APIClient()
    api.force_authenticate(user=user)
    return api


@pytest.fixture
def project(db):
    return ProjectFactory()


def assets_url(project):
    return f"/api/projects/{project.id}/gis-assets/"


def geojson_upload(name="layer.geojson", document=None):
    payload = json.dumps(document or POINT_GEOJSON).encode()
    return SimpleUploadedFile(name, payload, content_type="application/json")


@pytest.mark.django_db
def test_listing_assets_answers_an_empty_registry(client, project):
    response = client.get(assets_url(project))
    assert response.status_code == 200, response.content
    assert response.data == {"count": 0, "results": []}


@pytest.mark.django_db
def test_a_geojson_upload_is_stored_as_features(client, user, project):
    response = client.post(
        assets_url(project),
        {"file": geojson_upload(), "name": "Intervention points"},
        format="multipart",
    )
    assert response.status_code == 201, response.content

    asset = SpatialAsset.objects.get(pk=response.data["id"])
    assert asset.source_format == "geojson"
    assert asset.feature_count == 2
    assert asset.uploaded_by == user
    assert asset.geometry_types == ["Point"]
    assert SpatialAssetFeature.objects.filter(asset=asset).count() == 2
    assert asset.bbox == pytest.approx([-17.44, 14.69, 2.35, 48.85])
    # The label is read from the source attributes, not invented.
    assert set(
        SpatialAssetFeature.objects.filter(asset=asset).values_list("label", flat=True)
    ) == {"Paris", "Dakar"}


@pytest.mark.django_db
def test_a_kml_upload_is_recognised_by_its_content(client, project):
    # Announced as an octet-stream with a misleading extension: only the bytes
    # decide.
    upload = SimpleUploadedFile(
        "sites.dat", KML_DOCUMENT.encode(), content_type="application/octet-stream",
    )
    response = client.post(assets_url(project), {"file": upload}, format="multipart")
    assert response.status_code == 201, response.content
    assert SpatialAsset.objects.get(pk=response.data["id"]).source_format == "kml"


@pytest.mark.django_db
def test_a_kmz_archive_is_read_without_being_extracted(client, project):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("doc.kml", KML_DOCUMENT)
    upload = SimpleUploadedFile(
        "sites.kmz", buffer.getvalue(), content_type="application/vnd.google-earth.kmz",
    )
    response = client.post(assets_url(project), {"file": upload}, format="multipart")
    assert response.status_code == 201, response.content

    asset = SpatialAsset.objects.get(pk=response.data["id"])
    assert asset.source_format == "kmz"
    assert asset.feature_count == 1


@pytest.mark.django_db
def test_a_kml_organised_in_many_folders_keeps_every_folder(client, project):
    # GDAL maps one KML folder to one layer, and a thematic export routinely
    # has dozens: the KSADP infrastructure file has 31, one per infrastructure
    # type. The folder name is the most useful attribute in such a file, so it
    # is kept on every feature rather than flattened away.
    placemarks = "".join(
        f"<Folder><name>Type {i}</name>"
        f"<Placemark><name>Site {i}</name>"
        f"<Point><coordinates>{2 + i * 0.01},48.85,0</coordinates></Point>"
        f"</Placemark></Folder>"
        for i in range(31)
    )
    document = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>'
        f"{placemarks}</Document></kml>"
    ).encode()

    upload = SimpleUploadedFile(
        "infrastructure.kml", document, content_type="application/vnd.google-earth.kml+xml",
    )
    response = client.post(assets_url(project), {"file": upload}, format="multipart")
    assert response.status_code == 201, response.content

    asset = SpatialAsset.objects.get(pk=response.data["id"])
    assert asset.feature_count == 31

    layers = {
        f.properties.get("_layer")
        for f in SpatialAssetFeature.objects.filter(asset=asset)
    }
    assert layers == {f"Type {i}" for i in range(31)}


@pytest.mark.django_db
def test_an_html_attribute_sheet_becomes_real_attributes(client, project):
    # A KML exported from a geodatabase hides the attributes in the placemark
    # description, as an HTML table, so Google Earth shows a sheet on click.
    # They are extracted into ordinary keys and the markup is dropped: putting
    # uploaded HTML into the page would be a stored XSS hole.
    document = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark>'
        "<name>Kyawa Aggregation Centre</name>"
        "<description><![CDATA[<table>"
        "<tr><td><b>LGA</b></td><td>Bagwai</td></tr>"
        "<tr><td><b>Ownership</b></td><td>KSADP</td></tr>"
        "<tr><td><b>Note</b></td><td>&lt;script&gt;alert(1)&lt;/script&gt;</td></tr>"
        "</table>]]></description>"
        "<Point><coordinates>8.1,11.9,0</coordinates></Point>"
        "</Placemark></Document></kml>"
    ).encode()

    upload = SimpleUploadedFile("sheet.kml", document, content_type="application/octet-stream")
    response = client.post(assets_url(project), {"file": upload}, format="multipart")
    assert response.status_code == 201, response.content

    feature = SpatialAssetFeature.objects.get(asset_id=response.data["id"])
    assert feature.properties["LGA"] == "Bagwai"
    assert feature.properties["Ownership"] == "KSADP"
    assert "description" not in feature.properties
    # The escaped script tag survives as text, which is exactly what it is; the
    # popup escapes it again on the way out.
    assert feature.properties["Note"] == "<script>alert(1)</script>"
    assert not any(
        isinstance(v, str) and "<table" in v for v in feature.properties.values()
    )


class TestDescriptionShapes:
    """
    Every tool writes the placemark description differently. The shape is
    recognised, never assumed — and where it is not certain, nothing is
    invented: confident nonsense is worse than no attributes at all.
    """

    def test_label_and_value_rows_are_read_as_a_sheet(self):
        pairs, _ = parse_description(
            "<table>"
            "<tr><td><b>LGA</b></td><td>Bagwai</td></tr>"
            "<tr><td><b>Ward</b></td><td>kiyawa</td></tr>"
            "</table>"
        )
        assert pairs == {"LGA": "Bagwai", "Ward": "kiyawa"}

    def test_a_header_row_over_a_data_row_is_transposed(self):
        # ArcGIS and QGIS write this shape. Read as label/value pairs it would
        # yield {LGA: Ward, Bagwai: kiyawa} — the failure this rule exists for.
        pairs, _ = parse_description(
            "<table>"
            "<tr><th>LGA</th><th>Ward</th></tr>"
            "<tr><td>Bagwai</td><td>kiyawa</td></tr>"
            "</table>"
        )
        assert pairs == {"LGA": "Bagwai", "Ward": "kiyawa"}

    def test_a_wide_header_table_is_transposed(self):
        pairs, _ = parse_description(
            "<table>"
            "<tr><td>SN</td><td>LGA</td><td>Ward</td></tr>"
            "<tr><td>4</td><td>Bagwai</td><td>kiyawa</td></tr>"
            "</table>"
        )
        assert pairs == {"SN": "4", "LGA": "Bagwai", "Ward": "kiyawa"}

    def test_a_table_of_several_records_yields_no_attributes(self):
        # Three rows of three columns is a table of records, not one feature's
        # sheet. Refusing is the only honest answer.
        pairs, text = parse_description(
            "<table>"
            "<tr><td>SN</td><td>LGA</td><td>Ward</td></tr>"
            "<tr><td>4</td><td>Bagwai</td><td>kiyawa</td></tr>"
            "<tr><td>5</td><td>Bichi</td><td>Badume</td></tr>"
            "</table>"
        )
        assert pairs == {}
        assert "Bagwai" in text          # nothing is lost from view

    def test_two_columns_over_several_records_yields_no_attributes(self):
        # The genuinely ambiguous shape: three rows of two cells. A left column
        # of bare numbers is data, not field names, so nothing is invented.
        pairs, text = parse_description(
            "<table>"
            "<tr><td>SN</td><td>LGA</td></tr>"
            "<tr><td>4</td><td>Bagwai</td></tr>"
            "<tr><td>5</td><td>Bichi</td></tr>"
            "</table>"
        )
        assert pairs == {}
        assert "Bagwai" in text

    def test_a_repeated_left_column_is_not_a_sheet(self):
        pairs, _ = parse_description(
            "<table>"
            "<tr><td>Status</td><td>open</td></tr>"
            "<tr><td>Status</td><td>closed</td></tr>"
            "<tr><td>Status</td><td>open</td></tr>"
            "</table>"
        )
        assert pairs == {}

    def test_a_definition_list_is_read(self):
        pairs, _ = parse_description(
            "<dl><dt>LGA</dt><dd>Bagwai</dd><dt>Ward</dt><dd>kiyawa</dd></dl>"
        )
        assert pairs == {"LGA": "Bagwai", "Ward": "kiyawa"}

    def test_labelled_lines_are_read(self):
        pairs, _ = parse_description(
            "<b>LGA:</b> Bagwai<br/><b>Ward:</b> kiyawa<br/>"
        )
        assert pairs == {"LGA": "Bagwai", "Ward": "kiyawa"}

    def test_prose_with_a_colon_is_not_mistaken_for_fields(self):
        prose = (
            "Visited in March: the access road was impassable.<br/>"
            "The store was closed.<br/>"
            "Follow-up needed before the rains.<br/>"
        )
        pairs, text = parse_description(prose)
        assert pairs == {}
        assert "impassable" in text

    def test_markup_never_survives(self):
        for description in (
            "<table><tr><td>A</td><td><i>b</i></td></tr></table>",
            "<dl><dt>A</dt><dd>b</dd></dl>",
            "<p>free text</p>",
            "<table><tr><td>a</td><td>b</td><td>c</td></tr>"
            "<tr><td>d</td><td>e</td><td>f</td></tr>"
            "<tr><td>g</td><td>h</td><td>i</td></tr></table>",
        ):
            pairs, text = parse_description(description)
            assert "<" not in text
            assert not any("<" in v for v in pairs.values())

    def test_an_empty_or_missing_description_is_harmless(self):
        assert parse_description("") == ({}, "")
        assert parse_description(None) == ({}, "")


@pytest.mark.django_db
def test_an_unrecognised_description_survives_as_readable_text(client, project):
    document = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark>'
        "<name>Field office</name>"
        "<description><![CDATA[<table>"
        "<tr><td>SN</td><td>LGA</td></tr>"
        "<tr><td>4</td><td>Bagwai</td></tr>"
        "<tr><td>5</td><td>Bichi</td></tr>"
        "</table>]]></description>"
        "<Point><coordinates>8.1,11.9,0</coordinates></Point>"
        "</Placemark></Document></kml>"
    ).encode()

    upload = SimpleUploadedFile("odd.kml", document, content_type="application/octet-stream")
    response = client.post(assets_url(project), {"file": upload}, format="multipart")
    assert response.status_code == 201, response.content

    feature = SpatialAssetFeature.objects.get(asset_id=response.data["id"])
    # No invented attributes, but the content is still readable and tag-free.
    assert "SN" not in feature.properties
    assert "Bagwai" in feature.properties["description"]
    assert "<" not in feature.properties["description"]


@pytest.mark.django_db
def test_a_plain_text_description_is_kept_as_it_is(client, project):
    document = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark>'
        "<name>Field office</name>"
        "<description>Visited in March, road access poor.</description>"
        "<Point><coordinates>8.1,11.9,0</coordinates></Point>"
        "</Placemark></Document></kml>"
    ).encode()

    upload = SimpleUploadedFile("note.kml", document, content_type="application/octet-stream")
    response = client.post(assets_url(project), {"file": upload}, format="multipart")
    assert response.status_code == 201, response.content

    feature = SpatialAssetFeature.objects.get(asset_id=response.data["id"])
    assert feature.properties["description"] == "Visited in March, road access poor."


@pytest.mark.django_db
def test_a_file_that_is_not_geospatial_is_refused(client, project):
    upload = SimpleUploadedFile(
        "layer.geojson", b"MZ\x90\x00not a geojson", content_type="application/json",
    )
    response = client.post(assets_url(project), {"file": upload}, format="multipart")
    assert response.status_code == 400
    assert not SpatialAsset.objects.exists()


@pytest.mark.django_db
def test_an_archive_with_a_traversing_path_is_refused(client, project):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("../../etc/passwd", "root:x:0:0")
        archive.writestr("sites.shp", "not really a shapefile")
    upload = SimpleUploadedFile(
        "sites.zip", buffer.getvalue(), content_type="application/zip",
    )
    response = client.post(assets_url(project), {"file": upload}, format="multipart")
    assert response.status_code == 400
    assert "unsafe file path" in response.data["detail"]
    assert not SpatialAsset.objects.exists()


@pytest.mark.django_db
def test_an_oversized_file_is_refused(client, project):
    oversized = b"{" + b" " * (11 * 1024 * 1024)
    upload = SimpleUploadedFile(
        "big.geojson", oversized, content_type="application/json",
    )
    response = client.post(assets_url(project), {"file": upload}, format="multipart")
    assert response.status_code == 400
    assert "too large" in response.data["detail"].lower()
    assert not SpatialAsset.objects.exists()


@pytest.mark.django_db
def test_the_geojson_endpoint_returns_the_stored_features(client, project):
    created = client.post(
        assets_url(project), {"file": geojson_upload()}, format="multipart",
    )
    asset_id = created.data["id"]

    response = client.get(f"{assets_url(project)}{asset_id}/geojson/")
    assert response.status_code == 200, response.content
    assert response.data["type"] == "FeatureCollection"
    assert len(response.data["features"]) == 2
    assert response.data["features"][0]["geometry"]["type"] == "Point"


@pytest.mark.django_db
def test_the_original_is_served_as_an_attachment(client, project):
    created = client.post(
        assets_url(project),
        {"file": geojson_upload(name="sites.geojson")},
        format="multipart",
    )
    asset_id = created.data["id"]

    response = client.get(f"{assets_url(project)}{asset_id}/download/")
    assert response.status_code == 200
    # KML and GPX are XML: the browser must never render one from this origin.
    assert response["Content-Type"] == "application/octet-stream"
    assert response["X-Content-Type-Options"] == "nosniff"
    assert "attachment" in response["Content-Disposition"]
    assert b"".join(response.streaming_content) == json.dumps(POINT_GEOJSON).encode()


@pytest.mark.django_db
def test_deleting_an_asset_deactivates_it_without_losing_the_row(client, project):
    created = client.post(
        assets_url(project), {"file": geojson_upload()}, format="multipart",
    )
    asset_id = created.data["id"]

    response = client.delete(f"{assets_url(project)}{asset_id}/")
    assert response.status_code == 204

    asset = SpatialAsset.objects.get(pk=asset_id)
    assert asset.is_active is False
    assert client.get(assets_url(project)).data["count"] == 0


@pytest.mark.django_db
def test_the_layer_colour_must_be_a_hex_triplet(client, project):
    created = client.post(
        assets_url(project), {"file": geojson_upload()}, format="multipart",
    )
    asset_id = created.data["id"]

    refused = client.patch(
        f"{assets_url(project)}{asset_id}/",
        {"layer_color": "red; drop table"}, format="json",
    )
    assert refused.status_code == 400

    accepted = client.patch(
        f"{assets_url(project)}{asset_id}/", {"layer_color": "#0089C5"}, format="json",
    )
    assert accepted.status_code == 200, accepted.content
    assert SpatialAsset.objects.get(pk=asset_id).layer_color == "#0089C5"
