#!/usr/bin/env python
"""Utilitaire en ligne de commande Django pour Sentinelle (aRBM-MIS)."""
import os
import sys


def main():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Impossible d'importer Django. Est-il installe et "
            "disponible sur votre PYTHONPATH ? Avez-vous active "
            "un environnement virtuel ?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
