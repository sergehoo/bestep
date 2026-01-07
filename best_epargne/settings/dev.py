# settings/dev.py

from .base import *

import os

ALLOWED_HOSTS = ['*']

GDAL_LIBRARY_PATH = os.getenv('GDAL_LIBRARY_PATH', '/opt/homebrew/opt/gdal/lib/libgdal.dylib')
GEOS_LIBRARY_PATH = os.getenv('GEOS_LIBRARY_PATH', '/opt/homebrew/opt/geos/lib/libgeos_c.dylib')

DEBUG = True

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

LOGIN_URL = "/login/"
LOGIN_REDIRECT_URL = "/"
LOGOUT_REDIRECT_URL = "/"

# Redis dev (si tu lances `redis` en local ou via docker)
REDIS_URL = os.environ.get("REDIS_URL", "redis://127.0.0.1:6379/1")
CACHES["default"]["LOCATION"] = REDIS_URL

CELERY_BROKER_URL = os.environ.get(
    "CELERY_BROKER_URL",
    "redis://127.0.0.1:6379/0",
)
CELERY_RESULT_BACKEND = os.environ.get(
    "CELERY_RESULT_BACKEND",
    CELERY_BROKER_URL,
)