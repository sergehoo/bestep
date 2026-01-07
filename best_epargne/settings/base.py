# rhpartnersafric/settings/base.py
from pathlib import Path
import os

from django.core.cache.backends.redis import RedisCache

BASE_DIR = Path(__file__).resolve().parent.parent.parent

# ------------------
# Sécurité / général
# ------------------
SECRET_KEY = os.environ.get(
    "DJANGO_SECRET_KEY",
    "django-insecure-0*6#s%xhhr7&oy+!g+t&_uade+oeoszzru-)%c@2n#@_cq4umv"  # à surcharger en prod
)

DEBUG = False  # surchargé dans dev.py
ALLOWED_HOSTS = []  # surchargé dans dev/prod

# -----------
# Applications
# -----------
INSTALLED_APPS = [
    # Django de base
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # WhiteNoise (désactive le staticfiles dev server de Django)
    "whitenoise.runserver_nostatic",
    # Apps projet
    "website",
    # REST API
    "rest_framework",
    "rest_framework.authtoken",
    # Celery monitoring / scheduling
    "django_celery_beat",
    "django_celery_results",
]

# ----------
# Middleware
# ----------
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    # WhiteNoise pour servir les fichiers statiques
    "whitenoise.middleware.WhiteNoiseMiddleware",

    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "rhpartnersafric.urls"

# ----------
# Templates
# ----------
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
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

WSGI_APPLICATION = "rhpartnersafric.wsgi.application"

# --------------
# Base database
# (surchargée dans dev/prod)
# --------------
if os.getenv("DB_ENGINE") == "postgres":
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.getenv("DB_NAME"),
            "USER": os.getenv("DB_USER"),
            "PASSWORD": os.getenv("DB_PASSWORD"),
            "HOST": os.getenv("DB_HOST"),
            "PORT": os.getenv("DB_PORT"),
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / os.getenv("DB_NAME", "db.sqlite3"),
        }
    }

# ---------------------
# Validation mots de passe
# ---------------------
AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

# ----------------
# Internationalisation
# ----------------
LANGUAGE_CODE = "fr-fr"  # tu peux passer en FR directement
TIME_ZONE = "Africa/Abidjan"
USE_I18N = True
USE_TZ = True

# ------------------------
# Statics & media / WhiteNoise
# ------------------------
STATIC_URL = "/static/"
STATIC_ROOT = os.path.join(BASE_DIR, "staticfiles")  # dossier cible de collectstatic

# (facultatif) si tu as un dossier /static dans le code source pour tes assets non collectés
STATICFILES_DIRS = [os.path.join(BASE_DIR, "static")]
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"
MEDIA_URL = "/media/"
MEDIA_ROOT = os.path.join(BASE_DIR, "media")

# -------------
# Cache Redis
# -------------
CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": os.environ.get("REDIS_URL", "redis://127.0.0.1:6379/1"),
        "OPTIONS": {
            "CLIENT_CLASS": "django_redis.client.DefaultClient",
        },
    }
}

# -------------
# Celery + Redis
# -------------
CELERY_BROKER_URL = os.environ.get(
    "CELERY_BROKER_URL",
    "redis://127.0.0.1:6379/0",
)
CELERY_RESULT_BACKEND = os.environ.get(
    "CELERY_RESULT_BACKEND",
    CELERY_BROKER_URL,
)

CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = TIME_ZONE

# Pour django_celery_results
CELERY_RESULT_EXTENDED = True

# -------------
# REST Framework
# -------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
        "rest_framework.authentication.BasicAuthentication",
        # plus tard: Token / JWT
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.AllowAny",
    ],
}

# -----------------
# ID auto par défaut
# -----------------
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
