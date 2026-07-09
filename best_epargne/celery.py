
from __future__ import annotations

import os

from celery import Celery

# CORRECTIF SEC-03 : prod par défaut.
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "best_epargne.settings.prod")

app = Celery("best_epargne")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()


@app.task(bind=True, ignore_result=True)
def debug_task(self):  # pragma: no cover - utilitaire de diagnostic
    print(f"Request: {self.request!r}")
