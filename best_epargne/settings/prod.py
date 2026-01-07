# rhpartnersafric/settings/prod.py
from .base import *
import os

DEBUG = False

# Domaine(s) du site en prod
ALLOWED_HOSTS = os.environ.get("ALLOWED_HOSTS", "").split(",")

# SECRET_KEY obligatoire via env en prod
SECRET_KEY = os.environ["DJANGO_SECRET_KEY"]

# DB Postgres (à adapter à ton infra)
DATABASES = {
  "default": {
    "ENGINE": "django.db.backends.postgresql",
    "NAME": os.getenv("POSTGRES_DB", "best_epargne"),
    "USER": os.getenv("POSTGRES_USER", "postgres"),
    "PASSWORD": os.getenv("POSTGRES_PASSWORD", "postgres"),
    "HOST": os.getenv("POSTGRES_HOST", "best_epargne_postgres"),  # ✅ IMPORTANT
    "PORT": os.getenv("POSTGRES_PORT", "5432"),
  }
}

# Redis en prod (souvent un container/host "redis")
REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/1")
CACHES["default"]["LOCATION"] = REDIS_URL

CELERY_BROKER_URL = os.environ.get(
    "CELERY_BROKER_URL",
    "redis://redis:6379/0",
)
CELERY_RESULT_BACKEND = os.environ.get(
    "CELERY_RESULT_BACKEND",
    CELERY_BROKER_URL,
)

# WhiteNoise: storage optimisé avec manifest
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"

# Cookies plus stricts (tu pourras renforcer encore plus plus tard)
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True