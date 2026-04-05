#!/bin/sh
set -e

# Si une commande explicite est fournie (celery, python, bash, etc.),
# on l'exécute au lieu de lancer gunicorn.
if [ "$#" -gt 0 ] && [ "$1" != "gunicorn" ]; then
  echo "==> Run custom command: $*"
  exec "$@"
fi

echo "==> Run migrations"
python manage.py migrate --noinput

echo "==> Collect static"
python manage.py collectstatic --noinput

echo "==> Start gunicorn"
exec "$@"