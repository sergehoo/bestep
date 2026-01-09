# best_epargne/settings/prod.py
from .base import *
import os

# DEBUG = os.getenv("DJANGO_DEBUG", "0") == "1"
DEBUG = True

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
X_FRAME_OPTIONS = "DENY"

# ✅ DB (docker: host=bestDB)
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.getenv("POSTGRES_DB", "best_epargne"),
        "USER": os.getenv("POSTGRES_USER", "best_epargne"),
        "PASSWORD": os.getenv("POSTGRES_PASSWORD", "best_epargne_pwd"),
        "HOST": os.getenv("DB_HOST", "bestDB"),
        "PORT": os.getenv("DB_PORT", "5432"),
    }
}

# ✅ URL media générée par Django
# Doit donner: https://minio.ayo-group.com/bestepargne/...
# if AWS_S3_CUSTOM_DOMAIN:
#     MEDIA_URL = f"https://{AWS_S3_CUSTOM_DOMAIN}/{AWS_STORAGE_BUCKET_NAME}/"
#
# else:
#     # fallback (pas recommandé en prod)
#     MEDIA_URL = f"{AWS_S3_ENDPOINT_URL}/{AWS_STORAGE_BUCKET_NAME}/"


# Redis / cache
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/1")
CACHES["default"]["LOCATION"] = REDIS_URL

CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://redis:6379/0")
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", CELERY_BROKER_URL)

# Static
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"
