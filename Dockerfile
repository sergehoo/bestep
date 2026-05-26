# syntax=docker/dockerfile:1.6
#
# CORRECTIFS (audit INFRA-05, INFRA-06, INFRA-14, INFRA-19, INFRA-20).
#
# - INFRA-14 : ENV DJANGO_SETTINGS_MODULE figé à 'prod'.
# - INFRA-06 : gunicorn en gthread + max-requests + workers proportionnels.
# - INFRA-19 : à terme, scinder requirements.txt (prod) et requirements-dev.txt.
#   En attendant, on garde un seul requirements.txt mais on documente la dette.
# - INFRA-05 : pour pin par digest, remplacer "python:3.11-slim" par "python:3.11.10-slim-bookworm@sha256:<digest>".
#   Aujourd'hui on reste sur le tag stable.
#

############################################
# Builder: wheels + deps build
############################################
FROM python:3.11-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential gcc libpq-dev curl \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt
RUN pip wheel --wheel-dir /wheels -r /app/requirements.txt


############################################
# Runtime
############################################
FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    # CORRECTIF INFRA-14 : settings prod figé dans l'image.
    DJANGO_SETTINGS_MODULE=best_epargne.settings.prod

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 curl ffmpeg \
 && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 10001 appuser
WORKDIR /app

COPY --from=builder /wheels /wheels
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --no-index --find-links=/wheels -r /app/requirements.txt \
 && rm -rf /wheels

COPY . /app

RUN mkdir -p /app/staticfiles /app/media \
 && chmod +x /app/entrypoint.sh \
 && chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

ENV APP_PORT=8000 \
    GUNICORN_WORKERS=3 \
    GUNICORN_THREADS=4 \
    GUNICORN_TIMEOUT=60 \
    GUNICORN_GRACEFUL_TIMEOUT=30 \
    GUNICORN_MAX_REQUESTS=1000 \
    GUNICORN_MAX_REQUESTS_JITTER=100

ENTRYPOINT ["/app/entrypoint.sh"]
# CORRECTIF INFRA-06 : gthread + max-requests pour stabilité long-running.
CMD ["sh","-c","gunicorn best_epargne.wsgi:application \
    --bind 0.0.0.0:${APP_PORT:-8000} \
    --workers ${GUNICORN_WORKERS:-3} \
    --worker-class gthread \
    --threads ${GUNICORN_THREADS:-4} \
    --timeout ${GUNICORN_TIMEOUT:-60} \
    --graceful-timeout ${GUNICORN_GRACEFUL_TIMEOUT:-30} \
    --max-requests ${GUNICORN_MAX_REQUESTS:-1000} \
    --max-requests-jitter ${GUNICORN_MAX_REQUESTS_JITTER:-100} \
    --access-logfile - --error-logfile -"]
