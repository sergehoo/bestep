# settings/dev.py
"""
Settings de développement.

NOTE: Aucun secret n'est commité. Fournir DB_PASSWORD, DJANGO_SECRET_KEY, etc.
via un fichier .env local (non versionné).
"""

from .base import *  # noqa: F401,F403

import os
from decouple import config
# En dev, on autorise tous les hôtes uniquement si DJANGO_ALLOWED_HOSTS
# n'est pas défini — sinon on respecte la valeur passée dans l'env.
if not os.getenv("DJANGO_ALLOWED_HOSTS"):
    ALLOWED_HOSTS = ["*"]

GDAL_LIBRARY_PATH = os.getenv("GDAL_LIBRARY_PATH", "/opt/homebrew/opt/gdal/lib/libgdal.dylib")
GEOS_LIBRARY_PATH = os.getenv("GEOS_LIBRARY_PATH", "/opt/homebrew/opt/geos/lib/libgeos_c.dylib")

# En dev on force DEBUG à True pour avoir les tracebacks et le reload.
DEBUG = True

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": config("DB_NAME"),
        "USER": config("DB_USER"),
        # Les mots de passe ne sont JAMAIS dans le code source.
        "PASSWORD": config("DB_PASSWORD"),
        "HOST": config("DB_HOST"),
        "PORT": config("DB_PORT"),
        "CONN_MAX_AGE": int(config("DB_CONN_MAX_AGE", "60")),
    }
}

LOGIN_URL = "/account/login/"
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

# Email: en dev on affiche les mails dans la console plutôt que d'envoyer.
EMAIL_BACKEND = os.getenv(
    "EMAIL_BACKEND",
    "django.core.mail.backends.console.EmailBackend",
)
