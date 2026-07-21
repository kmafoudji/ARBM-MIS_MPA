"""Settings pour la production (Azure Container Apps)."""
from .base import *  # noqa: F401,F403
from .base import env

DEBUG = False

SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True

# --- Stockage des fichiers televerses ---
# Le systeme de fichiers d'Azure Container Apps est EPHEMERE : un fichier
# ecrit dans MEDIA_ROOT disparait au prochain redemarrage du conteneur. Les
# medias doivent donc imperativement passer par Blob Storage.
#
# API STORAGES de Django >= 4.2 (DEFAULT_FILE_STORAGE est deprecie).
# Le code applicatif n'a pas connaissance de ce reglage : il ecrit via
# default_storage, qui resout ici vers Azure.
STORAGES = {
    "default": {
        "BACKEND": "storages.backends.azure_storage.AzureStorage",
        "OPTIONS": {
            "account_name": env("AZURE_STORAGE_ACCOUNT_NAME"),
            "account_key": env("AZURE_STORAGE_ACCOUNT_KEY"),
            "azure_container": env("AZURE_STORAGE_CONTAINER", default="arbm-mis-media"),
            # Les medias sont servis depuis une origine distincte de celle qui
            # porte le cookie de session : un fichier televerse ne peut pas
            # executer de script dans le contexte de l'application.
            "overwrite_files": False,
        },
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}
