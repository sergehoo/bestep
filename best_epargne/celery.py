import os

from celery import Celery

# On pointe explicitement vers le package settings. Si le déploiement définit
# DJANGO_SETTINGS_MODULE (docker-compose le fait), on respecte sa valeur.
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "best_epargne.settings.dev")

app = Celery("best_epargne")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()


@app.task(bind=True, ignore_result=True)
def debug_task(self):  # pragma: no cover - utilitaire de diagnostic
    print(f"Request: {self.request!r}")