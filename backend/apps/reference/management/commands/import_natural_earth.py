"""
Import the Natural Earth basemap layers served by Martin.

Source: Natural Earth vector, pinned release tag, GeoJSON exports from
https://github.com/nvkelso/natural-earth-vector (public domain).

Datasets (all SRID 4326):
    countries-50m  ne_50m_admin_0_countries  → ne_country (scale=50), low zoom
    countries-10m  ne_10m_admin_0_countries  → ne_country (scale=10), zoom ≥ 5
    places         ne_10m_populated_places   → ne_place
    lakes          ne_10m_lakes              → ne_lake

Idempotent: upsert on (scale, adm0_a3) for countries and on ne_id otherwise.
A failed download does not stop the other datasets, but the command exits
with an error if any failure remains, so a partial import is never mistaken
for a complete one.

Usage:
    python manage.py import_natural_earth                      # everything
    python manage.py import_natural_earth --datasets places    # one dataset
    python manage.py import_natural_earth --dry-run            # download + count only
    python manage.py import_natural_earth --datasets lakes --file /tmp/lakes.geojson
"""

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.reference.geo_import import (
    fetch_geojson,
    geom_from_feature,
    load_geojson_file,
    point_from_feature,
)

NE_TAG = "v5.1.2"
NE_BASE = f"https://raw.githubusercontent.com/nvkelso/natural-earth-vector/{NE_TAG}/geojson"

DATASETS = {
    "countries-50m": "ne_50m_admin_0_countries",
    "countries-10m": "ne_10m_admin_0_countries",
    "places": "ne_10m_populated_places",
    "lakes": "ne_10m_lakes",
}


def _text(props, key, limit):
    value = props.get(key)
    if value is None or value == -99 or value == "-99":
        return ""
    return str(value).strip()[:limit]


def _num(props, key, default=0):
    value = props.get(key)
    if value is None or value == -99:
        return default
    try:
        return float(value) if isinstance(default, float) else int(value)
    except (TypeError, ValueError):
        return default


def _upsert_country(feature, scale):
    from apps.reference.models import NaturalEarthCountry

    props = feature.get("properties", {})
    adm0_a3 = _text(props, "ADM0_A3", 3)
    geom = geom_from_feature(feature)
    if not adm0_a3 or geom is None:
        return None
    _, created = NaturalEarthCountry.objects.update_or_create(
        scale=scale,
        adm0_a3=adm0_a3,
        defaults={
            "iso_a3": _text(props, "ISO_A3", 3),
            "name": _text(props, "NAME", 100) or adm0_a3,
            "name_long": _text(props, "NAME_LONG", 150),
            "label_x": props.get("LABEL_X"),
            "label_y": props.get("LABEL_Y"),
            "scalerank": _num(props, "scalerank", 0),
            "min_zoom": _num(props, "MIN_ZOOM", 0.0),
            "geometry": geom,
        },
    )
    return created


def _upsert_place(feature):
    from apps.reference.models import NaturalEarthPlace

    props = feature.get("properties", {})
    ne_id = props.get("NE_ID")
    geom = point_from_feature(feature)
    if ne_id is None or geom is None:
        return None
    featurecla = _text(props, "FEATURECLA", 50)
    _, created = NaturalEarthPlace.objects.update_or_create(
        ne_id=int(ne_id),
        defaults={
            "name": _text(props, "NAME", 100),
            "adm0_a3": _text(props, "ADM0_A3", 3),
            "featurecla": featurecla,
            "is_capital": featurecla.startswith("Admin-0 capital"),
            "scalerank": _num(props, "SCALERANK", 0),
            "min_zoom": _num(props, "MIN_ZOOM", 0.0),
            "pop_max": _num(props, "POP_MAX", 0),
            "geometry": geom,
        },
    )
    return created


def _upsert_lake(feature):
    from apps.reference.models import NaturalEarthLake

    props = feature.get("properties", {})
    ne_id = props.get("ne_id")
    geom = geom_from_feature(feature)
    if ne_id is None or geom is None:
        return None
    _, created = NaturalEarthLake.objects.update_or_create(
        ne_id=int(ne_id),
        defaults={
            "name": _text(props, "name", 100),
            "scalerank": _num(props, "scalerank", 0),
            "min_zoom": _num(props, "min_zoom", 0.0),
            "geometry": geom,
        },
    )
    return created


LOADERS = {
    "countries-50m": lambda f: _upsert_country(f, 50),
    "countries-10m": lambda f: _upsert_country(f, 10),
    "places": _upsert_place,
    "lakes": _upsert_lake,
}


class Command(BaseCommand):
    help = "Import the Natural Earth basemap layers (countries, places, lakes) for Martin."

    def add_arguments(self, parser):
        parser.add_argument(
            "--datasets", nargs="+", choices=sorted(DATASETS), default=None,
            help="Datasets to import (default: all).",
        )
        parser.add_argument(
            "--dry-run", action="store_true", default=False,
            help="Download and parse, report feature counts, write nothing.",
        )
        parser.add_argument(
            "--file", default=None,
            help="Load this local GeoJSON instead of downloading (requires exactly one --datasets).",
        )

    def handle(self, *args, **options):
        names = options["datasets"] or list(DATASETS)
        dry_run = options["dry_run"]
        local_file = options["file"]
        if local_file and len(names) != 1:
            raise CommandError("--file needs exactly one --datasets entry.")

        total_created = total_updated = total_skipped = 0
        failures = []

        for name in names:
            self.stdout.write(f"\n{'─' * 50}")
            self.stdout.write(f"  {name} ({DATASETS[name]})")

            if local_file:
                try:
                    payload = load_geojson_file(local_file)
                except Exception as e:
                    failures.append(f"{name} ({type(e).__name__}: {e})")
                    self.stdout.write(self.style.ERROR(f"    cannot read {local_file}: {e}"))
                    continue
            else:
                status, payload = fetch_geojson(f"{NE_BASE}/{DATASETS[name]}.geojson", self.stdout)
                if status != "ok":
                    reason = "HTTP 404" if status == "absent" else payload
                    failures.append(f"{name} ({reason})")
                    self.stdout.write(self.style.ERROR(f"    download failed ({reason}) — skipped"))
                    continue

            features = payload.get("features", [])
            self.stdout.write(f"    {len(features)} features")
            if dry_run:
                continue

            created = updated = skipped = 0
            loader = LOADERS[name]
            with transaction.atomic():
                for feature in features:
                    result = loader(feature)
                    if result is None:
                        skipped += 1
                    elif result:
                        created += 1
                    else:
                        updated += 1

            self.stdout.write(
                f"    {self.style.SUCCESS(str(created))} created, {updated} updated, {skipped} skipped"
            )
            total_created += created
            total_updated += updated
            total_skipped += skipped

        self.stdout.write(f"\n{'═' * 50}")
        if dry_run:
            recap = "Dry run: nothing written."
        else:
            recap = (
                f"Import finished: {total_created} created, {total_updated} updated, "
                f"{total_skipped} skipped."
            )
        self.stdout.write(self.style.WARNING(recap) if failures else self.style.SUCCESS(recap))
        if failures:
            self.stdout.write(self.style.ERROR(
                f"Failures ({len(failures)}): {', '.join(failures)}"
            ))
            raise CommandError(
                f"Import incomplete: {len(failures)} dataset(s) failed. "
                "Re-run with --datasets on those (the import is idempotent)."
            )
