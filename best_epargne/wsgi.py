"""WSGI config — CORRECTIF SEC-02."""
import os

from django.core.wsgi import get_wsgi_application

# CORRECTIF SEC-02 : prod par défaut (au lieu de 'best_epargne.settings').
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "best_epargne.settings.prod")

application = get_wsgi_application()
