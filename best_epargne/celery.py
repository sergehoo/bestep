import os
from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "best_epargne.settings")

app = Celery("best_epargne")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()