# best_epargne/settings/prod.py
"""Production settings — secure defaults, everything secret via env."""

from .base import *  # noqa: F401,F403
import os

# DEBUG doit rester désactivé en production. La valeur peut être surchargée
# par l'env pour les besoins très ponctuels de diagnostic, mais jamais par défaut.
DEBUG = env_bool("DJANGO_DEBUG", False)

# ALLOWED_HOSTS : piloté par l'env, avec un fallback sûr pointant sur le domaine
# réel de production. Si les deux sont vides, Django refusera de démarrer.
_default_hosts = "ayo-group.com,www.ayo-group.com"
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", _default_hosts)

CSRF_TRUSTED_ORIGINS = env_list(
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

# Header de sécurité supplémentaires.
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
X_FRAME_OPTIONS = "DENY"

# ------------------------------------------------------------
# Base de données (PostgreSQL Docker: hôte = bestDB)
# Les mots de passe ne sont jamais commités : ils proviennent uniquement
# de variables d'environnement fournies au runtime (docker-compose, vault…).
# ------------------------------------------------------------
_pg_password = os.getenv("POSTGRES_PASSWORD")
if not _pg_password:
    raise RuntimeError(
        "POSTGRES_PASSWORD doit être défini dans l'environnement de production."
    )

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.getenv("POSTGRES_DB", "best_epargne"),
        "USER": os.getenv("POSTGRES_USER", "best_epargne"),
        "PASSWORD": _pg_password,
        "HOST": os.getenv("DB_HOST", "bestDB"),
        "PORT": os.getenv("DB_PORT", "5432"),
        "CONN_MAX_AGE": int(os.getenv("DB_CONN_MAX_AGE", "60")),
        "OPTIONS": {
            "sslmode": os.getenv("DB_SSLMODE", "prefer"),
        },
    }
}

# Redis / cache
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/1")
CACHES["default"]["LOCATION"] = REDIS_URL

# Utiliser le cache Redis comme backend de session en prod (plus performant).
SESSION_ENGINE = "django.contrib.sessions.backends.cache"
SESSION_CACHE_ALIAS = "default"

CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://redis:6379/0")
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", CELERY_BROKER_URL)

# Static (whitenoise + manifest).
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"

# Email SMTP (configurable entièrement par env).
EMAIL_BACKEND = os.getenv(
    "EMAIL_BACKEND", "django.core.mail.backends.smtp.EmailBackend"
)
EMAIL_HOST = os.getenv("EMAIL_HOST", "localhost")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", True)
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", "no-reply@ayo-group.com")

# Email allauth — en prod on force la vérification.
ACCOUNT_EMAIL_VERIFICATION = os.getenv("ACCOUNT_EMAIL_VERIFICATION", "mandatory")
