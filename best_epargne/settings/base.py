"""
Django settings for best_epargne project — base settings.

CORRECTIFS P1.G (audit SEC-04..SEC-08, SEC-17..SEC-22, SEC-31, COMPTE-08) :

1. **django-axes** branché : protection brute-force (SEC-05).
2. **django-celery-beat** branché : tâches planifiées DB (SEC-07).
3. **django-csp** branché : Content Security Policy (SEC-08).
4. **Argon2 + min_length=12** : politique de mots de passe renforcée (SEC-19).
5. **AWS_QUERYSTRING_AUTH=True par défaut** : médias privés MinIO accessibles
   via URLs signées (SEC-04).
6. **AWS_S3_VERIFY séparé de MINIO_SECURE** : cohérence TLS (SEC-15).
7. **Allauth** : ACCOUNT_CONFIRM_EMAIL_ON_GET=False (SEC-17),
   ACCOUNT_EMAIL_VERIFICATION="mandatory" par défaut (SEC-18).
8. **DRF throttle** : scopes dédiés (login, signup, media-upload, quiz-submit,
   reviews_write, etc.) (SEC-31, API-51).
9. **2FA OTP** : packages branchés dans INSTALLED_APPS + MIDDLEWARE (SEC-06).
10. **decouple → os.getenv** : standardisation source de vérité (SEC-38).
"""
import os
from pathlib import Path

# ------------------------------------------------------------
# Helpers
# ------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent.parent.parent


# ------------------------------------------------------------
# Auto-load .env (DEV convenience).
#
# En PROD, les env vars viennent de docker-compose / Vault / K8s secrets
# et ce bloc ne fait rien (pas de fichier .env dans l'image grâce à .dockerignore).
# En DEV, on lit le .env à la racine du projet pour éviter de devoir
# `export` à chaque shell.
# ------------------------------------------------------------
_ENV_FILE = BASE_DIR / ".env"
_SETTINGS_MODULE = os.getenv("DJANGO_SETTINGS_MODULE", "")
if _SETTINGS_MODULE.endswith(".dev") and _ENV_FILE.exists():
    try:
        # decouple est déjà dans requirements.txt, utiliser sa lecture .env.
        from decouple import Config as _DecoupleConfig
        from decouple import RepositoryEnv as _RepoEnv
        _env_cfg = _DecoupleConfig(_RepoEnv(str(_ENV_FILE)))
        for _k, _v in _env_cfg.repository.data.items():
            # setdefault → un env var déjà posé (docker, shell) gagne sur .env.
            os.environ.setdefault(_k, _v)
    except ImportError:
        # Fallback : parseur minimaliste (KEY=value, # commentaires, lignes vides).
        for _line in _ENV_FILE.read_text(encoding="utf-8").splitlines():
            _line = _line.strip()
            if not _line or _line.startswith("#") or "=" not in _line:
                continue
            _k, _, _v = _line.partition("=")
            os.environ.setdefault(_k.strip(), _v.strip().strip('"').strip("'"))


def env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def env_list(name: str, default: str = "") -> list[str]:
    raw = os.getenv(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


# ------------------------------------------------------------
# Sécurité — SECRET_KEY / DEBUG / ALLOWED_HOSTS (env-driven)
# ------------------------------------------------------------
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "")
DEBUG = env_bool("DJANGO_DEBUG", False)

if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = "django-insecure-dev-only-do-not-use-in-production"
    else:
        raise RuntimeError(
            "DJANGO_SECRET_KEY is not set. Refusing to start in non-DEBUG mode."
        )

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")


# ------------------------------------------------------------
# Applications
# ------------------------------------------------------------
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework.authtoken",
    "corsheaders",
    "storages",
    "django.contrib.sites",
    "django.contrib.humanize",
    "tinymce",
    # Allauth
    "allauth",
    "allauth.account",
    "allauth.socialaccount",
    # CORRECTIF SEC-05 : protection brute-force.
    "axes",
    # CORRECTIF SEC-07 : Celery scheduler database-backed.
    "django_celery_beat",
    # CORRECTIF SEC-06 : 2FA (à activer côté URLs/admin selon la roadmap).
    "django_otp",
    "django_otp.plugins.otp_totp",
    "django_otp.plugins.otp_static",
    "two_factor",
    # CORRECTIF SEC-08 : CSP.
    "csp",
    # V_OBS.A : documentation OpenAPI auto-générée.
    "drf_spectacular",
    "drf_spectacular_sidecar",
    # Module transverse (permissions, cache, templatetags a11y).
    "core",
    # V_FIN.B : notifications transverse (label notifications_app).
    "notifications.apps.NotificationsConfig",
    # Apps métier
    "compte",
    "organizations",
    "assessments",
    "catalog",
    "certifications",
    "commerce",
    "enrollments",
    "reviews",
    "formations",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    # V_OBS.B : request-id en premier pour couvrir tout le pipeline.
    "core.logging.RequestIdMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    # CORRECTIF SEC-06 : Django-OTP doit suivre AuthenticationMiddleware.
    "django_otp.middleware.OTPMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    # CORRECTIF SEC-08 : CSP middleware.
    "csp.middleware.CSPMiddleware",
    "allauth.account.middleware.AccountMiddleware",
    "compte.middleware.OnboardingRequiredMiddleware",
    # CORRECTIF SEC-05 : Axes DOIT être en DERNIER.
    "axes.middleware.AxesMiddleware",
]

# CORS — allow-list driven by env, default to no cross-origin access.
CORS_ALLOWED_ORIGINS = env_list("DJANGO_CORS_ALLOWED_ORIGINS", "")
CORS_ALLOW_CREDENTIALS = env_bool("DJANGO_CORS_ALLOW_CREDENTIALS", False)

ROOT_URLCONF = "best_epargne.urls"

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
                "compte.context_processors.workspaces",
                "compte.context_processors.sidebar_badges",
            ],
        },
    },
]

WSGI_APPLICATION = "best_epargne.wsgi.application"

AUTH_USER_MODEL = "compte.User"


# ------------------------------------------------------------
# DRF
# ------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
        "rest_framework.authentication.TokenAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
        "rest_framework.throttling.ScopedRateThrottle",
    ],
    # CORRECTIF SEC-31 / API-51 : scopes dédiés.
    "DEFAULT_THROTTLE_RATES": {
        "anon": os.getenv("DRF_ANON_THROTTLE", "30/min"),
        "user": os.getenv("DRF_USER_THROTTLE", "1000/min"),
        "login": "5/min",
        "signup": "5/h",
        "reset_password": "3/h",
        "media_upload": "30/min",
        "quiz_submit": "5/min",
        "reviews_read": "120/min",
        "reviews_write": "5/min",
        "enrollments_read": "120/min",
        "progress_write": "60/min",
        # V5.D / SEC-33 : signed URL court ; on permet 60/min par user pour
        # gérer skip / seek sans bloquer un visionnage normal.
        "media_stream": "60/min",
    },
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": int(os.getenv("DRF_PAGE_SIZE", "25")),
    # V_OBS.A : génération auto du schéma OpenAPI.
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
}


# ------------------------------------------------------------
# drf-spectacular (OpenAPI 3.0) — V_OBS.A
# ------------------------------------------------------------
SPECTACULAR_SETTINGS = {
    "TITLE": "Best Épargne — API",
    "DESCRIPTION": (
        "API REST de la plateforme e-learning Best Épargne.\n\n"
        "Espaces multi-rôles : Apprenant / Formateur / Organisation / Admin plateforme.\n"
        "Auth : Session ou Token DRF. Throttling par scope (cf. settings)."
    ),
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "SWAGGER_UI_DIST": "SIDECAR",
    "SWAGGER_UI_FAVICON_HREF": "SIDECAR",
    "REDOC_DIST": "SIDECAR",
    "COMPONENT_SPLIT_REQUEST": True,
    "SCHEMA_PATH_PREFIX": r"/api/",
    "SECURITY": [{"SessionAuth": []}, {"TokenAuth": []}],
    "POSTPROCESSING_HOOKS": [
        "drf_spectacular.hooks.postprocess_schema_enums",
    ],
    "TAGS": [
        {"name": "auth", "description": "Authentification, sessions, 2FA."},
        {"name": "catalog", "description": "Cours publics / catalogue."},
        {"name": "instructor", "description": "Espace formateur : cours, médias, quiz."},
        {"name": "learner", "description": "Espace apprenant : enrollments, progression, quiz."},
        {"name": "organizations", "description": "Espace organisation : membres, invitations, licences."},
        {"name": "commerce", "description": "Checkout, webhooks PSP, paiements."},
        {"name": "certifications", "description": "Émission + vérification publique."},
        {"name": "reviews", "description": "Avis cours (sanitisés)."},
        {"name": "media", "description": "Uploads MinIO, signed URLs."},
        {"name": "admin", "description": "Admin plateforme métier."},
        {"name": "health", "description": "Healthz / readyz."},
    ],
}


# ------------------------------------------------------------
# AUTHENTICATION BACKENDS — Axes EN PREMIER
# ------------------------------------------------------------
AUTHENTICATION_BACKENDS = (
    # CORRECTIF SEC-05 : Axes en premier pour brute-force protection.
    "axes.backends.AxesStandaloneBackend",
    "django.contrib.auth.backends.ModelBackend",
    "allauth.account.auth_backends.AuthenticationBackend",
)


# ------------------------------------------------------------
# Password validators + Argon2 (SEC-19)
# ------------------------------------------------------------
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 12},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# CORRECTIF SEC-19 : Argon2 par défaut (argon2-cffi déjà installé).
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
    "django.contrib.auth.hashers.BCryptSHA256PasswordHasher",
    "django.contrib.auth.hashers.ScryptPasswordHasher",
]


# ------------------------------------------------------------
# Axes — brute-force protection (SEC-05)
# ------------------------------------------------------------
AXES_ENABLED = env_bool("AXES_ENABLED", True)
AXES_FAILURE_LIMIT = int(os.getenv("AXES_FAILURE_LIMIT", "8"))
AXES_COOLOFF_TIME = float(os.getenv("AXES_COOLOFF_TIME", "1"))  # heures
AXES_LOCKOUT_PARAMETERS = ["ip_address", "username"]
AXES_RESET_ON_SUCCESS = True
AXES_LOCKOUT_TEMPLATE = "account/locked.html"
AXES_VERBOSE = True


# ------------------------------------------------------------
# I18N / TZ / Misc
# ------------------------------------------------------------
SITE_ID = 1
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
LANGUAGE_CODE = "fr-fr"
TIME_ZONE = "Africa/Abidjan"
USE_I18N = True
USE_TZ = True


# ------------------------------------------------------------
# Static & Media (MinIO/S3)
# ------------------------------------------------------------
STATIC_URL = "/static/"
STATIC_ROOT = os.path.join(BASE_DIR, "staticfiles")
STATICFILES_DIRS = [os.path.join(BASE_DIR, "static")]
MEDIA_ROOT = os.path.join(BASE_DIR, "media")


# ------------------------------------------------------------
# Cache Redis
# ------------------------------------------------------------
CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": os.environ.get("REDIS_URL", "redis://127.0.0.1:6379/1"),
        "OPTIONS": {
            "CLIENT_CLASS": "django_redis.client.DefaultClient",
        },
    }
}


# ------------------------------------------------------------
# Allauth (auth email-only + sécurisé)
# ------------------------------------------------------------
ACCOUNT_LOGIN_METHODS = {"email"}
ACCOUNT_SIGNUP_FIELDS = ["email*", "first_name", "last_name", "password1*", "password2*"]
ACCOUNT_USER_MODEL_USERNAME_FIELD = None
ACCOUNT_USER_MODEL_EMAIL_FIELD = "email"
ACCOUNT_UNIQUE_EMAIL = True

# CORRECTIF SEC-18 : mandatory par défaut (en dev, surchargé à 'none').
ACCOUNT_EMAIL_VERIFICATION = os.getenv("ACCOUNT_EMAIL_VERIFICATION", "mandatory")
# CORRECTIF SEC-17 : refuser le GET sur le lien de confirmation
# (sinon pré-fetchers anti-malware/Outlook consomment automatiquement).
ACCOUNT_CONFIRM_EMAIL_ON_GET = False
ACCOUNT_LOGIN_ON_EMAIL_CONFIRMATION = True

ACCOUNT_RATE_LIMITS = {
    "login_failed": "5/5m",
    "signup": "10/h",
    "reset_password": "5/h",
}

ACCOUNT_ADAPTER = "compte.adapters.AccountAdapter"

LOGIN_REDIRECT_URL = "/"
LOGOUT_REDIRECT_URL = "/account/login/"

ACCOUNT_FORMS = {
    "signup": "compte.forms.CustomSignupForm",
}


# ------------------------------------------------------------
# Celery + Redis + Beat (SEC-07, INFRA-10)
# ------------------------------------------------------------
CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", "redis://127.0.0.1:6379/0")
CELERY_RESULT_BACKEND = os.environ.get("CELERY_RESULT_BACKEND", CELERY_BROKER_URL)
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = TIME_ZONE
CELERY_RESULT_EXTENDED = True

# CORRECTIF SEC-07 : scheduler database-backed (django-celery-beat).
CELERY_BEAT_SCHEDULER = "django_celery_beat.schedulers:DatabaseScheduler"

# CORRECTIF INFRA-10 : production-grade Celery.
CELERY_TASK_ACKS_LATE = True
CELERY_TASK_REJECT_ON_WORKER_LOST = True
CELERY_WORKER_PREFETCH_MULTIPLIER = 1
CELERY_TASK_TIME_LIMIT = int(os.getenv("CELERY_TASK_TIME_LIMIT", "600"))
CELERY_TASK_SOFT_TIME_LIMIT = int(os.getenv("CELERY_TASK_SOFT_TIME_LIMIT", "540"))
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True
CELERY_TASK_ROUTES = {
    "formations.tasks.process_media_asset": {"queue": "media"},
    "formations.tasks.cleanup_stale_multipart_uploads": {"queue": "media"},
    "commerce.tasks.*": {"queue": "default"},
    "compte.tasks.*": {"queue": "email"},
}


# ------------------------------------------------------------
# MinIO / S3
# ------------------------------------------------------------
MINIO_ROOT_USER = os.getenv("MINIO_ROOT_USER", "")
MINIO_ROOT_PASSWORD = os.getenv("MINIO_ROOT_PASSWORD", "")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "bestepargne")
MINIO_REGION = os.getenv("MINIO_REGION", "us-east-1")

MINIO_INTERNAL_ENDPOINT = os.getenv("MINIO_INTERNAL_ENDPOINT", "http://bestminio:9000")
MINIO_PUBLIC_ENDPOINT = os.getenv("MINIO_PUBLIC_ENDPOINT", "https://minio.ayo-group.com")
MINIO_PUBLIC_DOMAIN = (
    os.getenv("MINIO_PUBLIC_DOMAIN", "minio.ayo-group.com")
    .replace("https://", "")
    .replace("http://", "")
)
MINIO_SECURE = env_bool("MINIO_SECURE", False)
MINIO_UPLOAD_PREFIX = os.getenv("MINIO_UPLOAD_PREFIX", "instructors")

AWS_ACCESS_KEY_ID = MINIO_ROOT_USER
AWS_SECRET_ACCESS_KEY = MINIO_ROOT_PASSWORD
AWS_STORAGE_BUCKET_NAME = MINIO_BUCKET
AWS_S3_REGION_NAME = MINIO_REGION
AWS_S3_ENDPOINT_URL = MINIO_INTERNAL_ENDPOINT
AWS_S3_CUSTOM_DOMAIN = f"{MINIO_PUBLIC_DOMAIN}/{AWS_STORAGE_BUCKET_NAME}"
AWS_S3_URL_PROTOCOL = "https:"
# CORRECTIF SEC-15 : USE_SSL et VERIFY séparés.
AWS_S3_USE_SSL = env_bool("MINIO_SECURE", False)
AWS_S3_VERIFY = env_bool("MINIO_VERIFY_TLS", AWS_S3_USE_SSL)
AWS_S3_ADDRESSING_STYLE = "path"
AWS_S3_SIGNATURE_VERSION = "s3v4"
AWS_DEFAULT_ACL = None

# CORRECTIF SEC-04 (CRITIQUE) : signer les URLs PAR DÉFAUT (bucket privé).
AWS_QUERYSTRING_AUTH = env_bool("MINIO_QUERYSTRING_AUTH", True)
AWS_QUERYSTRING_EXPIRE = int(os.getenv("MINIO_PRESIGN_EXPIRE", "3600"))

DEFAULT_FILE_STORAGE = "storages.backends.s3boto3.S3Boto3Storage"
MEDIA_URL = f"https://{AWS_S3_CUSTOM_DOMAIN}/"


# ------------------------------------------------------------
# TinyMCE
# ------------------------------------------------------------
TINYMCE_DEFAULT_CONFIG = {
    "height": 500,
    "menubar": "file edit view insert format tools table help",
    "plugins": (
        "advlist autolink lists link image charmap preview anchor "
        "searchreplace visualblocks code fullscreen "
        "insertdatetime media table help wordcount directionality"
    ),
    "toolbar": (
        "undo redo | blocks | "
        "bold italic underline | forecolor backcolor | "
        "alignleft aligncenter alignright alignjustify | "
        "bullist numlist indent outdent | "
        "link image media table | "
        "code fullscreen preview"
    ),
    "block_formats": "Paragraphe=p; Titre 1=h1; Titre 2=h2; Titre 3=h3; Citation=blockquote",
    "image_caption": True,
    "image_title": True,
    "quickbars_selection_toolbar": "bold italic | quicklink h2 h3 blockquote",
    "quickbars_insert_toolbar": "image media table",
    "language": "fr_FR",
    "branding": False,
}


# ------------------------------------------------------------
# Sessions & CSRF
# ------------------------------------------------------------
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
# CORRECTIF SEC-16 : CSRF cookie peut rester accessible JS via <meta>,
# mais en pratique il est plus sûr de lire via {% csrf_token %} dans le template.
# On garde False par compat existante ; cf. roadmap pour passer à True.
CSRF_COOKIE_HTTPONLY = env_bool("CSRF_COOKIE_HTTPONLY", False)
CSRF_COOKIE_SAMESITE = "Lax"

SESSION_COOKIE_SECURE = env_bool("SESSION_COOKIE_SECURE", False)
CSRF_COOKIE_SECURE = env_bool("CSRF_COOKIE_SECURE", False)


# ------------------------------------------------------------
# CSP (SEC-08) — verrouillage de base, élargissez via env
# ------------------------------------------------------------
CSP_ALLOW_UNSAFE_INLINE = env_bool("CSP_ALLOW_UNSAFE_INLINE", False)
# Migration vers cdn.csp.min.js terminée — toutes les expressions Alpine avec
# opérateurs (===, ?:, &&, !) ont été remplacées par des appels de méthodes.
# 'unsafe-eval' n'est plus requis.
CSP_ALLOW_UNSAFE_EVAL = env_bool("CSP_ALLOW_UNSAFE_EVAL", False)
CSP_DEFAULT_SRC = ("'self'",)
CSP_SCRIPT_SRC = ("'self'", "https://cdn.tiny.cloud", "https://cdn.jsdelivr.net")
CSP_STYLE_SRC = ("'self'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com")
if CSP_ALLOW_UNSAFE_INLINE:
    CSP_SCRIPT_SRC = (*CSP_SCRIPT_SRC, "'unsafe-inline'")
    CSP_STYLE_SRC = (*CSP_STYLE_SRC, "'unsafe-inline'")
if CSP_ALLOW_UNSAFE_EVAL:
    CSP_SCRIPT_SRC = (*CSP_SCRIPT_SRC, "'unsafe-eval'")
CSP_FONT_SRC = ("'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com", "data:")
CSP_IMG_SRC = ("'self'", "data:", "https:", f"https://{MINIO_PUBLIC_DOMAIN}")
CSP_FRAME_SRC = ("'self'", "https://www.youtube.com", "https://player.vimeo.com")
CSP_MEDIA_SRC = ("'self'", f"https://{MINIO_PUBLIC_DOMAIN}")
CSP_CONNECT_SRC = ("'self'", f"https://{MINIO_PUBLIC_DOMAIN}")
CSP_FRAME_ANCESTORS = ("'none'",)
CSP_BASE_URI = ("'self'",)
CSP_FORM_ACTION = ("'self'",)


# ------------------------------------------------------------
# Commerce
# ------------------------------------------------------------
COMMERCE_CHECKOUT_PROVIDER = os.getenv("COMMERCE_CHECKOUT_PROVIDER", "").strip().lower()
COMMERCE_CHECKOUT_SESSION_FACTORY = os.getenv(
    "COMMERCE_CHECKOUT_SESSION_FACTORY",
    "",
).strip()
_company_seat_price = os.getenv("COMMERCE_COMPANY_SEAT_PRICE", "").strip()
COMMERCE_COMPANY_SEAT_PRICE = _company_seat_price or None


# ------------------------------------------------------------
# Logging
# ------------------------------------------------------------
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "filters": {
        # V_OBS.B : injecte request_id dans chaque LogRecord pendant une requête.
        "request_id": {"()": "core.logging.RequestIdFilter"},
    },
    "formatters": {
        # Format texte lisible — utilisé en dev.
        "verbose": {
            "format": "[{asctime}] {levelname} {name} req={request_id} {message}",
            "style": "{",
        },
        # V_OBS.B : format JSON pour ingestion Loki/ELK/Datadog en prod.
        "json": {"()": "core.logging.JsonFormatter"},
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": os.getenv("DJANGO_LOG_FORMAT", "verbose"),  # `json` en prod, `verbose` en dev
            "filters": ["request_id"],
        },
    },
    "root": {
        "handlers": ["console"],
        "level": os.getenv("DJANGO_LOG_LEVEL", "INFO"),
    },
    "loggers": {
        "django.security": {"handlers": ["console"], "level": "WARNING", "propagate": False},
        "django.request": {"handlers": ["console"], "level": "WARNING", "propagate": False},
        "axes": {"handlers": ["console"], "level": "WARNING", "propagate": False},
        "celery": {"handlers": ["console"], "level": "INFO", "propagate": False},
        # Catalog / enrollments / commerce / certifications : niveau dédié si besoin.
        "best_epargne": {"handlers": ["console"], "level": "INFO", "propagate": False},
        "core": {"handlers": ["console"], "level": "INFO", "propagate": False},
    },
}


# ------------------------------------------------------------
# Sentry (optional)
# ------------------------------------------------------------
SENTRY_DSN = os.getenv("SENTRY_DSN", "")
if SENTRY_DSN:
    try:
        import sentry_sdk
        from sentry_sdk.integrations.celery import CeleryIntegration
        from sentry_sdk.integrations.django import DjangoIntegration

        def _scrub_pii(event, hint):
            """CORRECTIF SEC-22 : retire les clés sensibles avant envoi Sentry."""
            try:
                req = event.get("request", {})
                if "data" in req and isinstance(req["data"], dict):
                    for k in list(req["data"].keys()):
                        if k.lower() in {
                            "password", "password1", "password2",
                            "token", "secret", "authorization",
                            "x-csrftoken", "csrf_token",
                        }:
                            req["data"][k] = "[Filtered]"
            except Exception:
                pass
            return event

        sentry_sdk.init(
            dsn=SENTRY_DSN,
            integrations=[DjangoIntegration(), CeleryIntegration()],
            send_default_pii=False,
            traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.0")),
            environment=os.getenv("SENTRY_ENVIRONMENT", "dev" if DEBUG else "prod"),
            before_send=_scrub_pii,
        )
    except ImportError:
        pass
