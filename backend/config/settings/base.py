"""
Settings de base pour ARBM-MES (Adaptive Results-Based Management/Monitoring and Evaluation System).
Communs a tous les environnements (local, docker, production Azure).
Les valeurs sensibles/variables viennent des variables d'environnement (.env),
jamais codees en dur ici (principe "configure, don't code").
"""
from pathlib import Path
import environ

BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env(
    DEBUG=(bool, False),
)
environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("DJANGO_SECRET_KEY", default="changeme-in-env-file")

ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.gis",
    # Third-party
    "rest_framework",
    "corsheaders",
    # ARBM-MES apps
    "apps.identity",
    "apps.reference",
    "apps.project",
    "apps.authentication",
]

AUTH_USER_MODEL = "identity.AppUser"

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.contrib.gis.db.backends.postgis",
        "NAME": env("POSTGRES_DB", default="arbm_mes"),
        "USER": env("POSTGRES_USER", default="arbm_mes"),
        "PASSWORD": env("POSTGRES_PASSWORD", default="arbm_mes"),
        "HOST": env("POSTGRES_HOST", default="db"),
        "PORT": env("POSTGRES_PORT", default="5432"),
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "fr-fr"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# --- Fichiers televerses (logos, PAD, pieces jointes) ---
# En local : ecrits sur le disque, servis par Django quand DEBUG=True.
# En production : bascules vers Azure Blob Storage via le backend de stockage
# (voir settings/production.py). Le code applicatif ne change pas — il passe
# toujours par default_storage, jamais par des chemins en dur.
#
# Azure Container Apps a un systeme de fichiers EPHEMERE : MEDIA_ROOT n'est
# viable qu'en developpement. Sans Blob Storage, toute production perdrait
# ses fichiers a chaque redemarrage de conteneur.
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# Taille maximale acceptee pour un televersement (5 Mo). Au-dela, Django
# rejette la requete avant meme d'atteindre la vue.
DATA_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
}

# Redis / Celery
REDIS_URL = env("REDIS_URL", default="redis://redis:6379/0")
CELERY_BROKER_URL = REDIS_URL
CELERY_RESULT_BACKEND = REDIS_URL

# CORS - a restreindre en production a l'URL du frontend
CORS_ALLOWED_ORIGINS = env.list(
    "CORS_ALLOWED_ORIGINS", default=["http://localhost:5173"]
)

# CSRF - origines autorisees a soumettre des requetes non-safe (POST/PUT/DELETE).
# Necessaire des que le frontend est appele via un nom d'hote/port different
# de celui du backend (ex. tunnel SSH localhost:5173 -> proxy -> backend:8000).
CSRF_TRUSTED_ORIGINS = env.list(
    "CSRF_TRUSTED_ORIGINS",
    default=["http://localhost:5173", "http://localhost:8000"],
)

# URL du frontend — utilisee pour rediriger l'utilisateur ici apres une
# connexion Entra ID reussie (voir apps.authentication.views.callback_view).
FRONTEND_URL = env("FRONTEND_URL", default="http://localhost:5173")

# --- Microsoft Entra ID (Azure AD) ---
# Ces valeurs viennent de l'App Registration cree dans le tenant
# Microsoft Entra ID de MillenniumPromise. Voir .env.example.
ENTRA_TENANT_ID = env("ENTRA_TENANT_ID", default="")
ENTRA_CLIENT_ID = env("ENTRA_CLIENT_ID", default="")
ENTRA_CLIENT_SECRET = env("ENTRA_CLIENT_SECRET", default="")
ENTRA_REDIRECT_URI = env(
    "ENTRA_REDIRECT_URI", default="http://localhost:8000/auth/callback"
)
ENTRA_AUTHORITY = f"https://login.microsoftonline.com/{ENTRA_TENANT_ID}"
ENTRA_SCOPES = ["User.Read"]

# Blob Storage (Azure) - utilise en production, S3-compatible en local si besoin
AZURE_STORAGE_ACCOUNT_NAME = env("AZURE_STORAGE_ACCOUNT_NAME", default="")
AZURE_STORAGE_ACCOUNT_KEY = env("AZURE_STORAGE_ACCOUNT_KEY", default="")
AZURE_STORAGE_CONTAINER = env("AZURE_STORAGE_CONTAINER", default="arbm-mes-media")
