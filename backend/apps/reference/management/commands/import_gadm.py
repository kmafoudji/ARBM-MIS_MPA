"""
Importe les découpages GADM Admin 1 et Admin 2 pour les pays du portefeuille LLF2.

Source : GADM v4.1 — https://geodata.ucdavis.edu/gadm/gadm4.1/json/
Format : GeoJSON par pays, un fichier par niveau.

Idempotent : utilise gadm_uid comme clé d'upsert.
La géométrie est optionnelle (--geom pour l'importer).

Note : --geom ne change pas le volume téléchargé (~31 Mo pour les 57 pays aux
deux niveaux), seulement ce qui est stocké. Le coût de --geom est le parsing
GEOS et l'écriture PostGIS, pas le réseau.

Usage :
    python manage.py import_gadm                    # Admin 1 + 2, sans géométrie
    python manage.py import_gadm --geom             # avec géométrie (plus lent)
    python manage.py import_gadm --countries SEN NGA # sous-ensemble de pays
    python manage.py import_gadm --level 1           # Admin 1 seulement
"""

import json
import urllib.request
import urllib.error
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

GADM_BASE = "https://geodata.ucdavis.edu/gadm/gadm4.1/json"

# Pays du portefeuille LLF2 — doit refléter reference.Country (57 pays).
# À resynchroniser à chaque évolution du portefeuille, sinon on télécharge des
# pays absents de la base et on ignore ceux qui viennent d'être ajoutés :
#   python manage.py shell -c "from apps.reference.models import Country; \
#     print(sorted(Country.objects.filter(is_active=True).values_list('iso3', flat=True)))"
PORTFOLIO_ISO3 = [
    "AFG","ALB","ARE","AZE","BEN","BFA","BGD","BHR",
    "BRN","CIV","CMR","COM","DJI","DZA","EGY","GAB",
    "GIN","GMB","GNB","GUY","IDN","IRN","IRQ","JOR",
    "KAZ","KGZ","KWT","LBN","LBY","MAR","MDV","MLI",
    "MOZ","MRT","MYS","NER","NGA","OMN","PAK","PSE",
    "QAT","SAU","SDN","SEN","SLE","SOM","SUR","SYR",
    "TCD","TGO","TJK","TKM","TUN","TUR","UGA","UZB",
    "YEM",
]

# Pays sans découpage GADM v4.1 disponible, vérifié le 2026-08-07.
# Le 404 est géré proprement, ces entrées documentent juste l'attendu.
GADM_GAPS_EXPECTED = {
    "MDV": "aucun niveau",           # ni Admin 1 ni Admin 2
    "BHR": "pas d'Admin 2",
    "COM": "pas d'Admin 2",
    "KWT": "pas d'Admin 2",
    "LBY": "pas d'Admin 2",
    "QAT": "pas d'Admin 2",
}


def fetch_geojson(url, stdout):
    """Télécharge un GeoJSON depuis l'URL GADM.

    Retourne un tuple (statut, données) :
        ("ok", dict)      téléchargement et parsing réussis
        ("absent", None)  404 : le pays n'a pas ce niveau administratif
        ("echec", str)    erreur réseau/serveur, message d'explication

    Aucun cas ne lève d'exception : sur 57 pays × 2 niveaux, un timeout isolé
    ne doit pas faire perdre l'import des autres pays. Les échecs sont
    récapitulés en fin de run et le rattrapage se fait avec --countries.
    """
    stdout.write(f"  ↓ {url}")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "ARBM-MES/1.0"})
        with urllib.request.urlopen(req, timeout=120) as resp:
            return "ok", json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return "absent", None
        return "echec", f"HTTP {e.code}"
    except Exception as e:
        return "echec", f"{type(e).__name__} : {e}"


def geom_from_feature(feature):
    """Convertit la géométrie GeoJSON en WKT pour Django/GEOS."""
    try:
        from django.contrib.gis.geos import GEOSGeometry
        geom_json = json.dumps(feature["geometry"])
        geom = GEOSGeometry(geom_json, srid=4326)
        # S'assurer que c'est un MultiPolygon
        if geom.geom_type == "Polygon":
            from django.contrib.gis.geos import MultiPolygon
            geom = MultiPolygon(geom, srid=4326)
        return geom
    except Exception:
        return None


class Command(BaseCommand):
    help = "Importe les zones GADM Admin 1/2 pour les pays du portefeuille LLF2."

    def add_arguments(self, parser):
        parser.add_argument(
            "--countries", nargs="+", default=None,
            help="Codes ISO3 à importer (défaut : les 57 pays du portefeuille).",
        )
        parser.add_argument(
            "--level", type=int, choices=[1, 2], default=None,
            help="Niveau à importer (1 ou 2). Défaut : les deux.",
        )
        parser.add_argument(
            "--geom", action="store_true", default=False,
            help="Importer les géométries (lent). Défaut : noms uniquement.",
        )

    def handle(self, *args, **options):
        from apps.reference.models import Country, GadmArea

        countries_arg = options["countries"]
        iso3_list = [c.upper() for c in countries_arg] if countries_arg else PORTFOLIO_ISO3
        levels = [options["level"]] if options["level"] else [1, 2]
        import_geom = options["geom"]

        # Charger le mapping iso3 → Country
        country_map = {c.iso3: c for c in Country.objects.filter(iso3__in=iso3_list)}
        missing = set(iso3_list) - set(country_map.keys())
        if missing:
            self.stdout.write(self.style.WARNING(
                f"Pays non trouvés en base (seed_reference_data d'abord ?) : {', '.join(sorted(missing))}"
            ))
        if not country_map:
            raise CommandError(
                "Aucun des pays demandés n'existe en base : rien à importer. "
                "Charger reference.Country avant de lancer import_gadm."
            )

        total_created = 0
        total_updated = 0
        absent = []
        failures = []

        for iso3 in iso3_list:
            country = country_map.get(iso3)
            if not country:
                continue

            self.stdout.write(f"\n{'─' * 50}")
            self.stdout.write(f"  {country.flag} {iso3} — {country.name}")

            for level in levels:
                # URL GADM : gadm41_SEN_1.json
                url = f"{GADM_BASE}/gadm41_{iso3}_{level}.json"
                status, payload = fetch_geojson(url, self.stdout)
                if status == "absent":
                    note = GADM_GAPS_EXPECTED.get(iso3, "")
                    suffix = f" — attendu ({note})" if note else " — inattendu, à vérifier"
                    self.stdout.write(self.style.WARNING(
                        f"    L{level} : absent de GADM{suffix}"
                    ))
                    absent.append(f"{iso3} L{level}")
                    continue
                if status == "echec":
                    self.stdout.write(self.style.ERROR(
                        f"    L{level} : échec du téléchargement ({payload}) — ignoré"
                    ))
                    failures.append(f"{iso3} L{level} ({payload})")
                    continue

                geojson = payload
                features = geojson.get("features", [])
                self.stdout.write(f"    L{level} : {len(features)} zones")

                created = updated = 0

                with transaction.atomic():
                    # Charger les parents Admin 1 si on importe Admin 2
                    parent_map = {}
                    if level == 2:
                        parent_map = {
                            a.gadm_uid: a
                            for a in GadmArea.objects.filter(country=country, level=1)
                        }

                    for feat in features:
                        props = feat.get("properties", {})

                        # Construire le gadm_uid depuis GID_1 ou GID_2
                        gid_key = f"GID_{level}"
                        gadm_uid = props.get(gid_key, "").strip()
                        if not gadm_uid:
                            continue

                        name = (
                            props.get(f"NAME_{level}", "")
                            or props.get("VARNAME_1", "")
                            or gadm_uid
                        ).strip()
                        name_alt = props.get(f"VARNAME_{level}", "").strip()

                        # Parent Admin 1 pour les zones Admin 2
                        parent = None
                        if level == 2:
                            gid1 = props.get("GID_1", "").strip()
                            parent = parent_map.get(gid1)

                        geom = geom_from_feature(feat) if import_geom else None

                        defaults = {
                            "name": name[:200],
                            "name_alt": name_alt[:200],
                            "level": level,
                            "country": country,
                            "parent": parent,
                        }
                        if import_geom:
                            defaults["geometry"] = geom

                        obj, was_created = GadmArea.objects.update_or_create(
                            gadm_uid=gadm_uid,
                            defaults=defaults,
                        )

                        if was_created:
                            created += 1
                        else:
                            updated += 1

                self.stdout.write(
                    f"    L{level} : {self.style.SUCCESS(str(created))} créées, "
                    f"{updated} mises à jour"
                )
                total_created += created
                total_updated += updated

        self.stdout.write(f"\n{'═' * 50}")
        self.stdout.write(self.style.SUCCESS(
            f"Import terminé : {total_created} zones créées, {total_updated} mises à jour."
        ))
        if absent:
            self.stdout.write(self.style.WARNING(
                f"Absents de GADM ({len(absent)}) : {', '.join(absent)}"
            ))
        if failures:
            self.stdout.write(self.style.ERROR(
                f"Échecs de téléchargement ({len(failures)}) : {', '.join(failures)}"
            ))
            self.stdout.write(self.style.ERROR(
                "Rattrapage : relancer avec --countries sur les pays concernés "
                "(l'import est idempotent via gadm_uid)."
            ))
        if not import_geom:
            self.stdout.write(self.style.WARNING(
                "Géométries non importées. Relancer avec --geom pour les cartes."
            ))
