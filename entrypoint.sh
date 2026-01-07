#!/bin/sh
set -e

echo "==> Run migrations"
python manage.py migrate --noinput

echo "==> Collect static"
python manage.py collectstatic --noinput

echo "==> Start gunicorn"
exec gunicorn best_epargne.wsgi:application \
  --bind 0.0.0.0:${APP_PORT:-8000} \
  --workers ${GUNICORN_WORKERS:-3} \
  --timeout ${GUNICORN_TIMEOUT:-120}