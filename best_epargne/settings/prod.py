"""Production settings — secure defaults, everything secret via env.

CORRECTIFS (audit SEC-09, SEC-22, INFRA-18) :
- DB_SSLMODE par défaut "require" (au lieu de "prefer") (SEC-09)
- En-tête X-Forwarded-Proto déjà configuré (rappel sécu : Traefik le nettoie).
"""
from __future__ import annotations

import os

from .base import *  # noqa: F401,F403

# DEBUG doit rester désactivé en production.
DEBUG = env_bool("DJANGO_DEBUG", False)  # noqa: F405

_default_hosts = "ayo-group.com,www.ayo-group.com"
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", _default_hosts)  # noqa: F405

CSRF_TRUSTED_ORIGINS = env_list(  # noqa: F405
    "DJANGO_CSRF_TRUSTED_ORIGINS",
    "https://ayo-group.com,https://www.ayo-group.com",
)

# Proxy (Traefik) — headers de confiance.
USE_X_FORWARDED_HOST = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# HTTPS & cookies stricts.
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"

# HSTS.
SECURE_HSTS_SECONDS = int(os.getenv("SECURE_HSTS_SECONDS", "31536000"))
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

# Headers de sécurité supplémentaires.
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
X_FRAME_OPTIONS = "DENY"

# CORRECTIF SEC-23 : cache WhiteNoise long.
WHITENOISE_MAX_AGE = int(os.getenv("WHITENOISE_MAX_AGE", "31536000"))
WHITENOISE_KEEP_ONLY_HASHED_FILES = True

# ------------------------------------------------------------
# Database
# ------------------------------------------------------------
_pg_password = os.getenv("POSTGRES_PASSWORD")
if not _pg_password:
    raise RuntimeError(
        "POSTGRES_PASSWORD doit être défini dans l'environnement de production."
    )

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.getenv("POSTGRES_DB"),
        "USER": os.getenv("POSTGRES_USER"),
        "PASSWORD": _pg_password,
        "HOST": os.getenv("DB_HOST", "bestDB"),
        "PORT": os.getenv("DB_PORT", "5432"),
        "CONN_MAX_AGE": int(os.getenv("DB_CONN_MAX_AGE", "60")),
        "OPTIONS": {
            # CORRECTIF SEC-09 : require par défaut.
            "sslmode": os.getenv("DB_SSLMODE", "require"),
        },
    }
}

# Redis / cache
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/1")
CACHES["default"]["LOCATION"] = REDIS_URL  # noqa: F405

# Sessions en cache Redis (plus performant).
SESSION_ENGINE = "django.contrib.sessions.backends.cache"
SESSION_CACHE_ALIAS = "default"

CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://redis:6379/0")
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", CELERY_BROKER_URL)

# Static (whitenoise + manifest).
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"

# Email SMTP (configurable entièrement par env).
EMAIL_BACKEND = os.getenv("EMAIL_BACKEND", "django.core.mail.backends.smtp.EmailBackend")
EMAIL_HOST = os.getenv("EMAIL_HOST", "localhost")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", True)  # noqa: F405
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", "no-reply@ayo-group.com")

ACCOUNT_EMAIL_VERIFICATION = os.getenv("ACCOUNT_EMAIL_VERIFICATION", "mandatory")

# V_OBS.B : on force le format JSON en prod pour Loki/ELK/Datadog
# (surchargeable via env DJANGO_LOG_FORMAT=verbose pour debug ponctuel).
LOGGING["handlers"]["console"]["formatter"] = os.getenv("DJANGO_LOG_FORMAT", "json")  # noqa: F405
