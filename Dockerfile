# syntax=docker/dockerfile:1.6

############################################
# Builder: wheels + deps build
############################################
FROM python:3.11-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Dépendances système nécessaires pour compiler certains wheels (psycopg/crypto, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    libpq-dev \
    curl \
  && rm -rf /var/lib/apt/lists/*

# Installer les dépendances Python sous forme de wheels
# (supporte requirements.txt / requirements/prod.txt / pyproject.toml si besoin)
COPY requirements.txt /app/requirements.txt
RUN pip wheel --wheel-dir /wheels -r /app/requirements.txt


############################################
# Runtime: image finale légère
############################################
FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Dépendances runtime (libpq pour PostgreSQL, curl pour healthcheck éventuel)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
  && rm -rf /var/lib/apt/lists/*

# Utilisateur non-root
RUN useradd -m -u 10001 appuser

WORKDIR /app

# Installer wheels construits
COPY --from=builder /wheels /wheels
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --no-index --find-links=/wheels -r /app/requirements.txt \
 && rm -rf /wheels

# Copier le code projet
COPY . /app

# Permissions (staticfiles/media)
RUN mkdir -p /app/staticfiles /app/media \
 && chown -R appuser:appuser /app

USER appuser

# Port Gunicorn (doit correspondre au docker-compose)
EXPOSE 8000

# Variables utiles (peuvent être surchargées par docker-compose/.env)
ENV APP_PORT=8000 \
    GUNICORN_WORKERS=3 \
    GUNICORN_TIMEOUT=120

# Optionnel : healthcheck simple (nécessite que ton app expose /health/ ou /)
# HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD curl -fsS http://127.0.0.1:${APP_PORT}/ || exit 1

# Démarrage: migrations + collectstatic + gunicorn
# (si tu préfères, remplace par un entrypoint.sh)
CMD sh -c "\
  python manage.py migrate --noinput && \
  python manage.py collectstatic --noinput && \
  gunicorn best_epargne.wsgi:application \
    --bind 0.0.0.0:${APP_PORT} \
    --workers ${GUNICORN_WORKERS} \
    --timeout ${GUNICORN_TIMEOUT} \
"