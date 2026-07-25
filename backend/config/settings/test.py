"""Settings pour les tests automatisés."""
from .base import *  # noqa

DEBUG = False
SECRET_KEY = "test-secret-key-not-for-production"

# Base de données de test — utilise la même PostgreSQL/PostGIS
# Django crée automatiquement une base test_<nom> et la détruit après
DATABASES["default"]["TEST"] = {"NAME": "test_arbm_mes"}

# Pas de cache Redis en test
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
    }
}

# Stockage local pour les tests (pas Azure) — syntaxe Django 5.x
STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
    },
}

# Celery synchrone en test
CELERY_TASK_ALWAYS_EAGER = True

# Authentification en test — force_authenticate fonctionne avec n'importe quel backend
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
        "rest_framework.authentication.BasicAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
}
