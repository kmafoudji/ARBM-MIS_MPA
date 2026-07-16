"""Settings pour le developpement local (Docker Compose sur Ubuntu)."""
from .base import *  # noqa: F401,F403

DEBUG = env("DJANGO_DEBUG", default=True)  # noqa: F405

INSTALLED_APPS += [  # noqa: F405
    "django.contrib.admindocs",
]
