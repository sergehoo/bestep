"""ASGI config — CORRECTIF SEC-02."""
import os

from django.core.asgi import get_asgi_application

# CORRECTIF SEC-02 : prod par défaut.
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "best_epargne.settings.prod")

application = get_asgi_application()
