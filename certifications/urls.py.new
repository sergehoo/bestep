"""certifications/urls.py — CORRECTIF V2.A (CERT-01).

Avant : ``urlpatterns = []`` ; ``verification_hash`` inexploité.

Après :
- ``GET /verify/<verification_hash>/`` → page HTML publique.
- ``GET /<verification_hash>/download/`` → URL PDF signée.

L'endpoint API JSON est branché à part dans ``best_epargne/apis/api_urls.py``
(ou exposé via ce fichier — au choix).
"""
from __future__ import annotations

from django.urls import path

from .views import download_certificate, verify_certificate, verify_certificate_api

app_name = "certifications"

urlpatterns = [
    path("verify/<uuid:verification_hash>/", verify_certificate, name="verify"),
    path("api/verify/<uuid:verification_hash>/", verify_certificate_api, name="verify_api"),
    path("<uuid:verification_hash>/download/", download_certificate, name="download"),
]
