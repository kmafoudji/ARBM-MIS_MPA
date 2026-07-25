#!/usr/bin/env python3
"""
ARBM-MES — Suppression TOTALE de tous les projets et données associées
=======================================================================
⚠️  OPÉRATION IRRÉVERSIBLE — supprime l'intégralité du contenu projet.

Le CASCADE Django nettoie automatiquement toutes les tables liées :
  - FinancingSource / ComponentAllocation
  - ImplementingPartner
  - ToCFrame / ToCNode / IndicatorAssignment / IndicatorBaseline / IndicatorTarget
  - ProjectGeographicScope / GADMZone
  - ReportingPeriod
  - StageTransition (audit trail)
  - ProjectWorkspace
  - (tout autre FK pointant vers Project)

Usage :
  python delete_all_projects.py [--dry-run] [--force]

Options :
  --dry-run   Affiche ce qui serait supprimé sans exécuter
  --force     Supprime sans confirmation interactive
"""

import os
import sys
import django
import argparse

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
django.setup()

from django.db import transaction
from config.models import Project  # ajuster si nécessaire

SEPARATOR = "─" * 60


def main():
    parser = argparse.ArgumentParser(description="Suppression totale des projets ARBM-MES")
    parser.add_argument("--dry-run", action="store_true", help="Simulation sans suppression réelle")
    parser.add_argument("--force",   action="store_true", help="Pas de confirmation interactive")
    args = parser.parse_args()

    print(SEPARATOR)
    print("  ARBM-MES — Suppression TOTALE de tous les projets")
    if args.dry_run:
        print("  MODE : DRY-RUN (aucune donnée ne sera supprimée)")
    print(SEPARATOR)

    qs = Project.objects.all().order_by("project_code")
    total = qs.count()

    if total == 0:
        print("\n  Aucun projet en base. Rien à supprimer.")
        sys.exit(0)

    print(f"\n  {total} projet(s) trouvé(s) :\n")
    for p in qs:
        print(f"  • {p.project_code or '(no code)':12s}  {p.acronym or '':12s}  {p.name[:55]}")

    if args.dry_run:
        print(f"\n  [DRY-RUN] {total} projet(s) auraient été supprimés.")
        print(f"\n{SEPARATOR}")
        print("  DRY-RUN terminé. Aucune donnée modifiée.")
        print(SEPARATOR)
        sys.exit(0)

    if not args.force:
        print(f"\n{SEPARATOR}")
        print("  ⚠️  ATTENTION : cette opération est IRRÉVERSIBLE.")
        print(f"  {total} projet(s) et TOUTES leurs données seront supprimés.")
        print(SEPARATOR)
        confirm = input("\n  Taper 'SUPPRIMER TOUT' pour confirmer : ").strip()
        if confirm != "SUPPRIMER TOUT":
            print("\n  Annulé.")
            sys.exit(0)

    print(f"\nSuppression en cours...\n")
    try:
        with transaction.atomic():
            deleted, breakdown = Project.objects.all().delete()
        print(f"  ✅ {deleted} enregistrement(s) supprimé(s) au total.")
        print("\n  Détail par table :")
        for model_label, count in sorted(breakdown.items()):
            print(f"    {count:>6}  {model_label}")
        print(f"\n{SEPARATOR}")
        print("  ✅ Suppression terminée avec succès.")
        print(SEPARATOR)
    except Exception as e:
        print(f"\n  ❌ Erreur : {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
