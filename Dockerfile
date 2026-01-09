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
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 curl \
  && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 10001 appuser
WORKDIR /app

COPY --from=builder /wheels /wheels
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --no-index --find-links=/wheels -r /app/requirements.txt \
 && rm -rf /wheels

COPY . /app

# Prépare dossiers + droits
RUN mkdir -p /app/staticfiles /app/media \
 && chmod +x /app/entrypoint.sh \
 && chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

ENV APP_PORT=8000 \
    GUNICORN_WORKERS=3 \
    GUNICORN_TIMEOUT=120

ENTRYPOINT ["/app/entrypoint.sh"]

CMD ["gunicorn", "best_epargne.wsgi:application", "--bind", "0.0.0.0:8000"]