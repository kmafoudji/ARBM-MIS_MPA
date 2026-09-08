"""import_natural_earth: local-file loading, idempotency, dry-run."""

import json

import pytest
from django.core.management import call_command

from apps.reference.models import NaturalEarthCountry, NaturalEarthLake, NaturalEarthPlace

SQUARE = [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]


def _write(tmp_path, name, features):
    path = tmp_path / f"{name}.geojson"
    path.write_text(json.dumps({"type": "FeatureCollection", "features": features}))
    return str(path)


def _country(adm0, name, label=(0.5, 0.5)):
    return {
        "type": "Feature",
        "properties": {
            "ADM0_A3": adm0, "ISO_A3": "-99", "NAME": name, "NAME_LONG": name,
            "LABEL_X": label[0], "LABEL_Y": label[1], "scalerank": 1, "MIN_ZOOM": 0,
        },
        "geometry": {"type": "Polygon", "coordinates": SQUARE},
    }


@pytest.mark.django_db
def test_countries_upsert_is_idempotent(tmp_path):
    path = _write(tmp_path, "c", [_country("SEN", "Senegal"), _country("MLI", "Mali")])

    call_command("import_natural_earth", "--datasets", "countries-50m", "--file", path)
    assert NaturalEarthCountry.objects.filter(scale=50).count() == 2
    sen = NaturalEarthCountry.objects.get(scale=50, adm0_a3="SEN")
    assert sen.iso_a3 == ""  # -99 normalised
    assert sen.geometry.geom_type == "MultiPolygon"

    call_command("import_natural_earth", "--datasets", "countries-50m", "--file", path)
    assert NaturalEarthCountry.objects.filter(scale=50).count() == 2

    # The same ADM0_A3 at another scale is a separate row.
    call_command("import_natural_earth", "--datasets", "countries-10m", "--file", path)
    assert NaturalEarthCountry.objects.count() == 4


@pytest.mark.django_db
def test_places_and_lakes(tmp_path):
    places = _write(tmp_path, "p", [{
        "type": "Feature",
        "properties": {"NE_ID": 1159127243, "NAME": "Dakar", "ADM0_A3": "SEN",
                       "FEATURECLA": "Admin-0 capital", "SCALERANK": 1, "MIN_ZOOM": 3, "POP_MAX": 2476400},
        "geometry": {"type": "Point", "coordinates": [-17.47, 14.72]},
    }])
    lakes = _write(tmp_path, "l", [{
        "type": "Feature",
        "properties": {"ne_id": 1159106815, "name": "Lake Guiers", "scalerank": 4, "min_zoom": 5},
        "geometry": {"type": "MultiPolygon", "coordinates": [SQUARE]},
    }])
    call_command("import_natural_earth", "--datasets", "places", "--file", places)
    call_command("import_natural_earth", "--datasets", "lakes", "--file", lakes)
    assert NaturalEarthPlace.objects.get(ne_id=1159127243).is_capital is True
    assert NaturalEarthLake.objects.get(ne_id=1159106815).name == "Lake Guiers"


@pytest.mark.django_db
def test_dry_run_writes_nothing(tmp_path):
    path = _write(tmp_path, "c", [_country("SEN", "Senegal")])
    call_command("import_natural_earth", "--datasets", "countries-50m", "--file", path, "--dry-run")
    assert NaturalEarthCountry.objects.count() == 0


@pytest.mark.django_db
def test_label_view_exists(tmp_path):
    from django.db import connection
    path = _write(tmp_path, "c", [_country("SEN", "Senegal", label=(-14.5, 14.5))])
    call_command("import_natural_earth", "--datasets", "countries-50m", "--file", path)
    with connection.cursor() as cur:
        cur.execute("SELECT name, ST_X(geometry) FROM ne_country_label")
        assert cur.fetchall() == [("Senegal", -14.5)]
