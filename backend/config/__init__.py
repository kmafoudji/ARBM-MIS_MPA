# Rend l'app Celery disponible dès l'import du package config,
# ce qui garantit que les décorateurs @shared_task fonctionnent
# dans toutes les apps Django sans import circulaire.
from .celery import app as celery_app  # noqa: F401

__all__ = ["celery_app"]
