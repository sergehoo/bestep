"""enrollments/lesson_media_views.py — Endpoint signed URL court (V5.D / SEC-33).

CORRECTIF audit SEC-33 (Critique) :

Avant : le player frontend exposait ``<video :src="lesson.video_url">``
avec une URL MinIO complète (potentiellement signée 1h ou pire publique).
Conséquence : un user qui ouvre les DevTools peut copier l'URL et la
télécharger trivialement → piratage des cours payants.

Après : un endpoint signed URL **court (60s)** qui retourne une URL
valide juste le temps de démarrer la lecture. Le DRM HLS reste à
brancher selon le PSP médias (Cloudflare Stream, Mux, etc.), mais la
fenêtre d'attaque passe de plusieurs heures à 60 secondes.

Vérifications :
1. user authentifié,
2. lesson rattachée à un cours **PUBLISHED**,
3. soit lesson.is_preview (autorisé sans enrollment, mais cours non
   ``company_only`` exigé),
4. soit user a un Enrollment actif sur le cours.
"""
from __future__ import annotations

import logging
from typing import Optional

from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_GET
from rest_framework.decorators import (
    api_view,
    permission_classes,
    throttle_classes,
)
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from catalog.models import Course, Lesson, MediaAsset

from .models import Enrollment

logger = logging.getLogger(__name__)


SIGNED_URL_TTL_SECONDS = 60   # SEC-33 : fenêtre courte.


def _generate_signed_url(asset: MediaAsset, *, ttl: int = SIGNED_URL_TTL_SECONDS) -> str:
    """Génère une URL S3/MinIO signée éphémère via storages.

    Sécurité : on signe pour le ``optimized_object_key`` quand dispo
    (lecture web optimisée), sinon ``object_key`` de base.
    """
    from formations.storage import s3_public_client

    object_key = asset.optimized_object_key or asset.object_key
    if not object_key:
        raise NotFound("Média non disponible.")

    client = s3_public_client()
    return client.generate_presigned_url(
        "get_object",
        Params={
            "Bucket": settings.MINIO_BUCKET,
            "Key": object_key,
            # CORRECTIF SEC-33 : on force le ResponseContentDisposition pour
            # éviter qu'un client puisse forcer un Content-Disposition
            # attachment trompeur via param. Reste à brancher le DRM/HLS.
            "ResponseContentDisposition": "inline",
        },
        ExpiresIn=ttl,
    )


def _resolve_lesson_for_user(user, lesson_id: int) -> tuple[Lesson, Course, Optional[Enrollment]]:
    """Sécurité : retourne (lesson, course, enrollment_or_none) ou lève.

    Règles :
    - cours doit être PUBLISHED,
    - si lesson.is_preview ET pas company_only → public (enrollment None),
    - sinon → exiger Enrollment actif.
    """
    lesson = get_object_or_404(
        Lesson.objects.select_related("section__course", "media_asset"),
        pk=lesson_id,
    )
    course = lesson.section.course
    if course.status != Course.Status.PUBLISHED:
        raise NotFound()

    # Preview public uniquement si cours non interne.
    if lesson.is_preview and not course.company_only:
        return lesson, course, None

    if not user or not user.is_authenticated:
        raise PermissionDenied("Authentification requise.")

    enrollment = (
        Enrollment.objects.filter(user=user, course=course)
        .exclude(status=Enrollment.Status.CANCELED)
        .first()
    )
    if enrollment is None:
        raise NotFound()
    return lesson, course, enrollment


@api_view(["GET"])
@permission_classes([IsAuthenticated])
@throttle_classes([ScopedRateThrottle])
@never_cache
def lesson_signed_stream(request, lesson_id: int):
    """GET /api/learner/lessons/<id>/stream/ → {url, expires_in}.

    Throttle scope ``media_stream`` (configuré côté settings : 60/min).
    """
    # Spécifique à cette vue (pas global pour pouvoir override le throttle).
    request._request_throttle_scope = "media_stream"
    lesson, course, _ = _resolve_lesson_for_user(request.user, lesson_id)

    if not lesson.media_asset_id:
        # Fallback : URL externe (YouTube/Vimeo) — pas signée, mais on ne
        # peut pas la protéger (iframe). On renvoie l'URL directement.
        if lesson.video_url:
            return Response({
                "kind": "external",
                "url": lesson.video_url,
                "expires_in": 0,
            })
        raise NotFound("Aucun média rattaché à cette leçon.")

    try:
        url = _generate_signed_url(lesson.media_asset)
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "lesson.stream.signed_url_failed",
            extra={"lesson_id": lesson_id, "exc": str(exc)},
        )
        raise NotFound("Lecture vidéo temporairement indisponible.")

    return Response({
        "kind": "mp4",
        "url": url,
        "expires_in": SIGNED_URL_TTL_SECONDS,
        "content_type": lesson.media_asset.content_type,
        "title": lesson.title,
        "duration_sec": lesson.duration_sec or lesson.media_asset.duration_seconds or 0,
    })


# Throttle scope custom — à ajouter dans DEFAULT_THROTTLE_RATES.
lesson_signed_stream.throttle_scope = "media_stream"
