"""enrollments/signals.py — Recomputation automatique de la progression.

CORRECTIF P2/P3 (audit ENROLL-05) : un signal ``post_save`` sur LessonProgress
recompute l'Enrollment parent. À brancher dans ``enrollments/apps.py.ready``.
"""
from __future__ import annotations

import logging

from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .models import LessonProgress

logger = logging.getLogger(__name__)


@receiver([post_save, post_delete], sender=LessonProgress)
def _recompute_enrollment_progress(sender, instance: LessonProgress, **kwargs):
    """Recompute la progression de l'Enrollment parent à chaque write/delete.

    Important : on importe le service à l'intérieur du handler pour éviter
    les imports circulaires au démarrage Django.
    """
    try:
        from .services import recompute_enrollment_progress
        recompute_enrollment_progress(instance.enrollment_id)
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "enrollments.signal.recompute.failed",
            extra={"enrollment_id": instance.enrollment_id, "exc": str(exc)},
        )
