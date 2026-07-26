"""
load_gadm_geometries.py — Chargement GADM depuis UC Davis
Crée les zones Admin 1/2 ET charge leurs géométries en une passe.
Usage : docker compose exec backend python scripts/load_gadm_geometries.py
"""
import os, sys, json, time, urllib.request

sys.path.insert(0, "/app")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")
import django
django.setup()

from django.db import connection, transaction
from django.contrib.gis.geos import GEOSGeometry
from apps.reference.models import Country, GadmArea

GADM_URL = "https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_{iso3}_{level}.json"
PAUSE = 1

def fetch(url):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "ARBM-MIS/1.0"})
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read().decode())
    except Exception as e:
        print(f"    ✗ {e}")
        return None

def load_country(country, level):
    url = GADM_URL.format(iso3=country.iso3, level=level)
    print(f"  L{level} — {url[:65]}...")
    data = fetch(url)
    if not data or not data.get("features"):
        print(f"  L{level} — ✗ no data")
        return 0

    created = updated = 0
    with transaction.atomic():
        for feat in data["features"]:
            props = feat.get("properties", {})
            geom_data = feat.get("geometry")
            if not geom_data:
                continue

            uid  = props.get("GID_2") or props.get("GID_1") or ""
            name = props.get("NAME_2") or props.get("NAME_1") or props.get("VARNAME_1") or ""
            name_alt = props.get("VARNAME_2") or props.get("VARNAME_1") or ""

            # Parent pour Admin 2
            parent = None
            if level == 2:
                parent_uid = props.get("GID_1", "")
                if parent_uid:
                    parent = GadmArea.objects.filter(
                        gadm_uid=parent_uid, country=country, level=1
                    ).first()

            try:
                geos = GEOSGeometry(json.dumps(geom_data), srid=4326)
                if geos.geom_type == "Polygon":
                    from django.contrib.gis.geos import MultiPolygon
                    geos = MultiPolygon(geos)
            except Exception as e:
                continue

            obj, was_created = GadmArea.objects.update_or_create(
                gadm_uid=uid,
                defaults={
                    "country":  country,
                    "level":    level,
                    "name":     name[:200],
                    "name_alt": name_alt[:200],
                    "parent":   parent,
                    "geometry": geos,
                }
            )
            if was_created:
                created += 1
            else:
                updated += 1

    print(f"  L{level} — ✓ {created} créés, {updated} mis à jour")
    return created + updated


def run():
    countries = Country.objects.filter(iso3__isnull=False).exclude(iso3="").order_by("name")
    print(f"\n{'='*60}")
    print(f"Loading GADM for {countries.count()} countries")
    print(f"{'='*60}\n")

    total = 0
    for country in countries:
        print(f"\n[{country.name}] iso3={country.iso3}")
        for level in [1, 2]:
            n = load_country(country, level)
            total += n
            time.sleep(PAUSE)

    print(f"\n{'='*60}")
    print(f"Done — {total} zones loaded")
    filled = GadmArea.objects.filter(geometry__isnull=False).count()
    total_zones = GadmArea.objects.count()
    print(f"Coverage: {filled}/{total_zones} zones with geometry")
    print(f"{'='*60}\n")

if __name__ == "__main__":
    run()
