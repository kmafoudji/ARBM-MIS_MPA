"""
Commande de gestion Django pour charger les indicateurs du catalogue LLF2.

Usage :
  python manage.py seed_indicators                          # Agriculture (defaut)
  python manage.py seed_indicators --sector health          # quand disponible
  python manage.py seed_indicators --dry-run                # affiche sans inserer
  python manage.py seed_indicators --update                 # met a jour les existants

Le fichier JSON source est dans apps/results/fixtures/indicators_{sector}.json.
Format attendu : liste d'objets avec les champs du modele Indicator +
  "sector": nom du secteur (chaine, ex. "Agriculture")
  "related_sdgs": liste d'entiers (numeros d'ODD)
"""
import json
import os
from pathlib import Path

from django.core.management.base import BaseCommand

from apps.reference.models import Sdg, Sector
from apps.results.models import Indicator


class Command(BaseCommand):
    help = "Charge les indicateurs du catalogue LLF2 depuis un fichier JSON."

    def add_arguments(self, parser):
        parser.add_argument(
            "--sector", default="agriculture",
            help="Secteur a charger (agriculture/health/infra). Defaut : agriculture"
        )
        parser.add_argument(
            "--dry-run", action="store_true",
            help="Affiche ce qui serait insere sans rien ecrire en base."
        )
        parser.add_argument(
            "--update", action="store_true",
            help="Met a jour les indicateurs existants (par defaut : ignore les doublons)."
        )

    def handle(self, *args, **options):
        sector_name = options["sector"].capitalize()
        dry_run = options["dry_run"]
        update = options["update"]

        fixture_path = (
            Path(__file__).parent.parent.parent / "fixtures"
            / f"indicators_{options['sector'].lower()}.json"
        )
        if not fixture_path.exists():
            self.stderr.write(self.style.ERROR(
                f"Fixture introuvable : {fixture_path}\n"
                f"Generez-la via le script parse_indicators.py ou placez le fichier JSON ici."
            ))
            return

        with open(fixture_path, encoding="utf-8") as f:
            data = json.load(f)

        # Charger les references une seule fois pour eviter N+1
        try:
            sector_obj = Sector.objects.get(name__icontains=sector_name)
        except Sector.DoesNotExist:
            self.stderr.write(self.style.ERROR(
                f"Secteur '{sector_name}' introuvable dans la base de reference. "
                f"Secteurs disponibles : {list(Sector.objects.values_list('name', flat=True))}"
            ))
            return
        except Sector.MultipleObjectsReturned:
            sector_obj = Sector.objects.filter(name__icontains=sector_name).first()

        sdg_map = {s.number: s for s in Sdg.objects.all()}

        created_count = updated_count = skipped_count = error_count = 0

        for row in data:
            code = row.get("code", "").strip()
            if not code:
                self.stderr.write(f"  [SKIP] Ligne sans code : {row.get('name', '')[:40]}")
                skipped_count += 1
                continue

            defaults = {
                "sector": sector_obj,
                "subsector": row.get("subsector", ""),
                "name": row.get("name", ""),
                "indicator_type": row.get("indicator_type", "output"),
                "direction": row.get("direction", "increase"),
                "definition": row.get("definition", ""),
                "unit": row.get("unit", ""),
                "numerator": row.get("numerator", ""),
                "denominator": row.get("denominator", ""),
                "calculation_method": row.get("calculation_method", ""),
                "formula": row.get("formula", ""),
                # "disaggregation" field removed in migration 0012
                "data_source": row.get("data_source", ""),
                "collection_method": row.get("collection_method", ""),
                "reporting_frequency": row.get("reporting_frequency", ""),
                "means_of_verification": row.get("means_of_verification", ""),
                "responsible": row.get("responsible", ""),
                "assumptions": row.get("assumptions", ""),
                "limitations": row.get("limitations", ""),
                "is_active": True,
            }

            existing = Indicator.objects.filter(code=code).first()

            if existing and not update:
                skipped_count += 1
                continue

            if dry_run:
                action = "UPDATE" if existing else "CREATE"
                self.stdout.write(f"  [{action}] {code} — {defaults['name'][:50]}")
                created_count += 1
                continue

            try:
                if existing and update:
                    for k, v in defaults.items():
                        setattr(existing, k, v)
                    existing.save()
                    ind = existing
                    updated_count += 1
                else:
                    ind = Indicator.objects.create(code=code, **defaults)
                    created_count += 1

                # ODD lies
                sdg_numbers = row.get("related_sdgs", [])
                sdg_objs = [sdg_map[n] for n in sdg_numbers if n in sdg_map]
                if sdg_objs:
                    ind.related_sdgs.set(sdg_objs)

            except Exception as exc:
                self.stderr.write(self.style.ERROR(f"  [ERREUR] {code} : {exc}"))
                error_count += 1

        mode = "(dry-run) " if dry_run else ""
        self.stdout.write(self.style.SUCCESS(
            f"\n{mode}Secteur {sector_name} : "
            f"{created_count} crees, {updated_count} mis a jour, "
            f"{skipped_count} ignores, {error_count} erreurs."
        ))
