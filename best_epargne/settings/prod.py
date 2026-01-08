# rhpartnersafric/settings/prod.py
from .base import *
import os

DEBUG = True

# Domaine(s) du site en prod
# ALLOWED_HOSTS = os.environ.get("ALLOWED_HOSTS", "").split(",")
ALLOWED_HOSTS = [
    "ayo-group.com",
    "www.ayo-group.com",
]
CSRF_TRUSTED_ORIGINS = [
    "https://ayo-group.com",
    "https://www.ayo-group.com",
]
USE_X_FORWARDED_HOST = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

SECURE_SSL_REDIRECT = True

SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"

SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_BROWSER_XSS_FILTER = True
X_FRAME_OPTIONS = "DENY"

# DB Postgres (à adapter à ton infra)
# DATABASES = {
#   "default": {
#     "ENGINE": "django.db.backends.postgresql",
#     "NAME": os.getenv("POSTGRES_DB"),
#     "USER": os.getenv("POSTGRES_USER"),
#     "PASSWORD": os.getenv("POSTGRES_PASSWORD"),
#     "HOST": os.getenv("POSTGRES_HOST", "bestDB"),  # ✅ IMPORTANT
#     "PORT": os.getenv("POSTGRES_PORT", "5432"),
#   }
# }
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',  # Correct engine for GIS support
        'NAME': os.environ.get('POSTGRES_DB'),
        'USER': os.environ.get('POSTGRES_USER'),
        'PASSWORD': os.environ.get('POSTGRES_PASSWORD'),
        'HOST': os.environ.get('DB_HOST'),
        'PORT': os.environ.get('DB_PORT'),
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