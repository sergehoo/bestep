"""certifications/views.py — CORRECTIF V2.A (CERT-01).

Avant : ``views.py`` ne contenait rien d'autre que ``from django.shortcuts
import render``. Conséquence : aucune vue publique de vérification, donc
le ``verification_hash`` du modèle ``IssuedCertificate`` était inutile et
les PDFs émis étaient invérifiables.

Après : trois endpoints publics (anonymous-friendly) :

- ``/certifications/verify/<verification_hash>/`` (HTML) : page humaine
  qui affiche le statut, le titulaire, le cours, la date, le score.
- ``/api/certifications/verify/<verification_hash>/`` (JSON) : endpoint
  machine-friendly, utile pour vérification par employeurs.
- ``/certifications/<verification_hash>/download/`` : sert le PDF signé
  via le storage (MinIO/S3), si le certificat est actif.

Toutes ces vues retournent 404 sur un hash inconnu, **sans révéler si le
hash a déjà existé puis été révoqué** (anti-énumération).
"""
from __future__ import annotations

import logging

from django.http import HttpResponseNotFound, JsonResponse
from django.shortcuts import get_object_or_404, render
from django.views.decorators.http import require_GET
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle

from .models import IssuedCertificate

logger = logging.getLogger(__name__)


def _serialize_certificate(cert: IssuedCertificate) -> dict:
    """Sérialisation publique (limitée — pas d'email, pas de score si révoqué)."""
    payload = {
        "verified": not cert.is_revoked,
        "status": "revoked" if cert.is_revoked else "valid",
        "serial": cert.serial,
        "verification_hash": str(cert.verification_hash),
        "issued_at": cert.issued_at.date().isoformat(),
        "course_title": cert.course.title if cert.course_id else None,
        "holder": {
            "name": (getattr(cert.user, "full_name", "") or "").strip()
            or (cert.user.email.split("@")[0] if cert.user_id else "Apprenant"),
        },
        "score_percent": cert.score_percent if not cert.is_revoked else None,
    }
    if cert.is_revoked:
        payload["revoked_at"] = cert.revoked_at.isoformat() if cert.revoked_at else None
        if cert.revoked_reason:
            payload["revoked_reason"] = cert.revoked_reason
    return payload


@require_GET
def verify_certificate(request, verification_hash):
    """Page HTML publique de vérification (CERT-01)."""
    cert = (
        IssuedCertificate.objects.select_related("course", "user")
        .filter(verification_hash=verification_hash)
        .first()
    )
    if cert is None:
        # Anti-énumération : 404 nu, sans message qui révèle l'existence passée.
        return HttpResponseNotFound("Certificat introuvable.")
    return render(
        request,
        "certifications/verify.html",
        {"certificate": _serialize_certificate(cert), "raw": cert},
    )


@api_view(["GET"])
@permission_classes([AllowAny])
@throttle_classes([AnonRateThrottle])
def verify_certificate_api(request, verification_hash):
    """Endpoint JSON public (CERT-01) — utile pour les employeurs/intégrations."""
    cert = (
        IssuedCertificate.objects.select_related("course", "user")
        .filter(verification_hash=verification_hash)
        .first()
    )
    if cert is None:
        return Response({"verified": False, "detail": "not_found"}, status=404)
    return Response(_serialize_certificate(cert))


@require_GET
def download_certificate(request, verification_hash):
    """Retourne une URL signée pour le PDF.

    Le storage (MinIO/S3) avec ``AWS_QUERYSTRING_AUTH=True`` génère
    automatiquement une URL signée éphémère (TTL = ``AWS_QUERYSTRING_EXPIRE``).
    """
    cert = get_object_or_404(IssuedCertificate, verification_hash=verification_hash)
    if cert.is_revoked or not cert.pdf_file:
        return HttpResponseNotFound("PDF indisponible.")
    return JsonResponse({"url": cert.pdf_file.url})
