"""
load_gadm_geometries.py — Chargement des géométries GADM
Sources alternatives (gadm.org bloque les requêtes directes) :
  1. geodata.ucdavis.edu (miroir officiel GADM)
  2. github.com/wmgeolab/geoBoundaries
  3. Fallback: Natural Earth pour les pays

Usage : docker compose exec backend python scripts/load_gadm_geometries.py
"""
import os, sys, json, time, urllib.request, urllib.error

sys.path.insert(0, "/app")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")
import django
django.setup()

from django.db import connection
from django.contrib.gis.geos import GEOSGeometry

PAUSE = 1

# Sources par ordre de préférence
SOURCES = [
    # Miroir officiel GADM / UC Davis
    "https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_{iso3}_{level}.json",
    # GitHub GADM releases
    "https://github.com/gadm/gadm/releases/download/gadm4.1/gadm41_{iso3}_{level}.json",
    # geoBoundaries (Open admin boundaries)
    "https://www.geoboundaries.org/api/current/gbOpen/{iso3}/ADM{level}/",
]

def fetch_url(url, timeout=120):
    """Tente de télécharger une URL, retourne le contenu ou None."""
    headers = {
        "User-Agent": "Mozilla/5.0 ARBM-MIS/1.0 (academic use)",
        "Accept": "application/json",
    }
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"    ✗ {url[:60]}... → {type(e).__name__}: {e}")
        return None

def fetch_geoboundaries(iso3, level):
    """Fetch via geoBoundaries API (renvoie une URL de téléchargement)."""
    meta_url = f"https://www.geoboundaries.org/api/current/gbOpen/{iso3}/ADM{level}/"
    meta = fetch_url(meta_url)
    if not meta:
        return None
    dl_url = meta.get("gjDownloadURL") or meta.get("downloadURL")
    if not dl_url:
        return None
    print(f"    → geoBoundaries DL: {dl_url[:70]}...")
    return fetch_url(dl_url)

def load_features(features, country_id, level, iso3):
    """Insère les géométries en base."""
    updated = 0
    with connection.cursor() as cur:
        for feat in features:
            props = feat.get("properties", {})
            geom  = feat.get("geometry")
            if not geom:
                continue

            # Essayer différentes clés d'UID selon la source
            uid = (
                props.get("GID_2") or props.get("GID_1") or
                props.get("shapeName") or props.get("shapeID") or
                props.get("NAME_2") or props.get("NAME_1") or ""
            )

            # Matcher aussi par nom si pas d'UID
            name = (
                props.get("NAME_2") or props.get("NAME_1") or
                props.get("shapeName") or props.get("name") or ""
            )

            try:
                geos = GEOSGeometry(json.dumps(geom), srid=4326)
            except Exception as e:
                continue

            # Essai 1 : match par gadm_uid
            if uid:
                cur.execute(
                    "UPDATE gadm_area SET geometry=ST_GeomFromText(%s,4326) "
                    "WHERE gadm_uid=%s AND country_id=%s AND level=%s",
                    [geos.wkt, uid, country_id, level]
                )
                if cur.rowcount > 0:
                    updated += cur.rowcount
                    continue

            # Essai 2 : match par nom normalisé
            if name:
                normalized = name.replace(" ", "").replace("-", "").replace("'","").lower()
                cur.execute(
                    "UPDATE gadm_area SET geometry=ST_GeomFromText(%s,4326) "
                    "WHERE country_id=%s AND level=%s "
                    "AND LOWER(REPLACE(REPLACE(REPLACE(name,' ',''),'-',''),'''','')) = %s",
                    [geos.wkt, country_id, level, normalized]
                )
                updated += cur.rowcount

    return updated

def run():
    with connection.cursor() as cur:
        cur.execute("""
            SELECT c.iso3, c.iso2, c.id, c.name
            FROM country c
            WHERE c.id IN (SELECT DISTINCT country_id FROM gadm_area)
            ORDER BY c.name
        """)
        countries = cur.fetchall()

    print(f"\n{'='*60}")
    print(f"Loading GADM geometries for {len(countries)} countries")
    print(f"{'='*60}\n")

    total_updated = 0

    for iso3, iso2, country_id, name in countries:
        print(f"\n[{name}] iso3={iso3}")

        for level in [1, 2]:
            with connection.cursor() as cur:
                cur.execute(
                    "SELECT COUNT(*) FROM gadm_area WHERE country_id=%s AND level=%s",
                    [country_id, level]
                )
                expected = cur.fetchone()[0]
            if expected == 0:
                continue

            data = None

            # Source 1 : UC Davis
            url1 = f"https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_{iso3}_{level}.json"
            print(f"  L{level} — trying UC Davis...")
            data = fetch_url(url1)

            # Source 2 : geoBoundaries
            if not data or not data.get("features"):
                print(f"  L{level} — trying geoBoundaries...")
                data = fetch_geoboundaries(iso3, level)

            # Source 3 : GitHub GADM archive
            if not data or not data.get("features"):
                url3 = f"https://raw.githubusercontent.com/wmgeolab/geoBoundaries/main/releaseData/gbOpen/{iso3}/ADM{level}/geoBoundaries-{iso3}-ADM{level}.geojson"
                print(f"  L{level} — trying GitHub geoBoundaries...")
                data = fetch_url(url3)

            if not data or not data.get("features"):
                print(f"  L{level} — ✗ all sources failed, skipping")
                time.sleep(PAUSE)
                continue

            features = data.get("features", [])
            n = load_features(features, country_id, level, iso3)
            print(f"  L{level} — ✓ {n}/{expected} zones updated")
            total_updated += n
            time.sleep(PAUSE)

    # Résumé
    print(f"\n{'='*60}")
    print(f"Done — {total_updated} geometries loaded")
    with connection.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM gadm_area WHERE geometry IS NOT NULL")
        filled = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM gadm_area")
        total = cur.fetchone()[0]
    print(f"Coverage: {filled}/{total} zones with geometry")
    print(f"{'='*60}\n")

if __name__ == "__main__":
    run()
