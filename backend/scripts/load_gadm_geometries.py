"""
load_gadm_geometries.py — Chargement des géométries GADM depuis gadm.org API
Usage : python manage.py runscript load_gadm_geometries
       OU : docker compose exec backend python scripts/load_gadm_geometries.py

Pour chaque pays en base avec des zones GADM :
  1. Télécharge le GeoJSON GADM niveau 1 depuis gadm.org
  2. Télécharge le GeoJSON GADM niveau 2
  3. Matche par gadm_uid et met à jour geometry dans gadm_area

Requiert : requests, django.contrib.gis (PostGIS)
"""
import os
import sys
import time
import json

# Setup Django
sys.path.insert(0, "/app")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")

import django
django.setup()

from django.db import connection
from django.contrib.gis.geos import GEOSGeometry

GADM_API = "https://gadm.org/json/gadm41_{iso3}_{level}.json"
PAUSE     = 2  # secondes entre requêtes (politesse)


def load_country(iso3, country_id, level):
    """Télécharge le GeoJSON GADM et met à jour les géométries en base."""
    import urllib.request, urllib.error

    url = GADM_API.format(iso3=iso3, level=level)
    print(f"  Fetching L{level}: {url}")

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "ARBM-MIS/1.0"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        print(f"  HTTP {e.code} — skipping L{level}")
        return 0
    except Exception as e:
        print(f"  Error: {e} — skipping")
        return 0

    features = data.get("features", [])
    updated  = 0

    with connection.cursor() as cur:
        for feat in features:
            props  = feat.get("properties", {})
            geom   = feat.get("geometry")
            if not geom:
                continue

            # gadm_uid : ex. "SEN.1_1" pour L1, "SEN.1.1_1" pour L2
            uid = (
                props.get("GID_2") or
                props.get("GID_1") or
                props.get("UID") or ""
            )
            if not uid:
                continue

            try:
                geos = GEOSGeometry(json.dumps(geom), srid=4326)
            except Exception as e:
                print(f"    Invalid geom for {uid}: {e}")
                continue

            # Mettre à jour par gadm_uid ET country_id ET level
            cur.execute(
                """
                UPDATE gadm_area
                   SET geometry = ST_GeomFromText(%s, 4326)
                 WHERE gadm_uid = %s
                   AND country_id = %s
                   AND level = %s
                """,
                [geos.wkt, uid, country_id, level]
            )
            updated += cur.rowcount

    return updated


def run():
    with connection.cursor() as cur:
        cur.execute("""
            SELECT c.iso3, c.id, c.name
            FROM country c
            WHERE c.id IN (SELECT DISTINCT country_id FROM gadm_area)
            ORDER BY c.name
        """)
        countries = cur.fetchall()

    print(f"\n{'='*60}")
    print(f"Loading GADM geometries for {len(countries)} countries")
    print(f"{'='*60}\n")

    total_updated = 0
    failed = []

    for iso3, country_id, name in countries:
        print(f"\n[{name}] iso3={iso3}")

        for level in [1, 2]:
            # Vérifier si des zones de ce niveau existent
            with connection.cursor() as cur:
                cur.execute(
                    "SELECT COUNT(*) FROM gadm_area WHERE country_id=%s AND level=%s",
                    [country_id, level]
                )
                count = cur.fetchone()[0]
            if count == 0:
                continue

            n = load_country(iso3, country_id, level)
            print(f"    L{level}: {n}/{count} zones updated")
            total_updated += n
            time.sleep(PAUSE)

    # Résumé
    print(f"\n{'='*60}")
    print(f"Done — {total_updated} geometries loaded")
    with connection.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM gadm_area WHERE geometry IS NOT NULL")
        filled = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM gadm_area")
        total  = cur.fetchone()[0]
    print(f"Coverage: {filled}/{total} zones with geometry")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    run()
