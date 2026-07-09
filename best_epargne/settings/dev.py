
from __future__ import annotations

import os

from .base import *  # noqa: F403


if not os.getenv("DJANGO_ALLOWED_HOSTS"):
    ALLOWED_HOSTS = ["*"]

# En dev on force DEBUG à True.
DEBUG = True

# Surcharge possible en dev (non strict).
ACCOUNT_EMAIL_VERIFICATION = os.getenv("ACCOUNT_EMAIL_VERIFICATION", "none")

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.getenv("DB_NAME", "best_epargne"),
        "USER": os.getenv("DB_USER", "best_epargne2"),
        "PASSWORD": os.getenv("DB_PASSWORD", ""),
        "HOST": os.getenv("DB_HOST", "127.0.0.1"),
        "PORT": os.getenv("DB_PORT", "5432"),
        "CONN_MAX_AGE": int(os.getenv("DB_CONN_MAX_AGE", "60")),
    }
}

LOGIN_URL = "/account/login/"
LOGIN_REDIRECT_URL = "/"
LOGOUT_REDIRECT_URL = "/"

REDIS_URL = os.environ.get("REDIS_URL", "redis://127.0.0.1:6379/1")
CACHES["default"]["LOCATION"] = REDIS_URL  # noqa: F405

CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", "redis://127.0.0.1:6379/0")
CELERY_RESULT_BACKEND = os.environ.get("CELERY_RESULT_BACKEND", CELERY_BROKER_URL)

# Email : console en dev.
EMAIL_BACKEND = os.getenv(
    "EMAIL_BACKEND",
    "django.core.mail.backends.console.EmailBackend",
)

# CSP dev : migration cdn.csp.min.js terminée — 'unsafe-eval' retiré.
CSP_SCRIPT_SRC = ("'self'", "https://cdn.tiny.cloud", "https://cdn.jsdelivr.net")
CSP_STYLE_SRC = ("'self'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com")

# R8 fix — CORS dev pour Vite (5173, 5174 fallback, etc.)
# En dev on autorise tout http://localhost:<port> et http://127.0.0.1:<port>.
# En prod : DJANGO_CORS_ALLOWED_ORIGINS reste la source unique (strict).
CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^http://localhost:\d+$",
    r"^http://127\.0\.0\.1:\d+$",
]
# Optionnel : autoriser les cookies cross-site (utile si tu passes en cookie auth).
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
]
