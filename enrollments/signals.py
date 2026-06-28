"""enrollments/signals.py — Recomputation progression + invalidation dashboards V4.A.

Combine V1 (ENROLL-05 : recompute Enrollment.progress_percent depuis
LessonProgress) et V4.A (invalider les caches dashboards quand un
Enrollment ou un LessonProgress change).
"""
from __future__ import annotations

import logging

from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .models import Enrollment, LessonProgress

logger = logging.getLogger(__name__)


@receiver([post_save, post_delete], sender=LessonProgress)
def _recompute_enrollment_progress(sender, instance: LessonProgress, **kwargs):
    """V1 : recompute la progression de l'Enrollment parent."""
    try:
        from .services import recompute_enrollment_progress
        recompute_enrollment_progress(instance.enrollment_id)
    except Exception as exc:
        logger.warning(
            "enrollments.signal.recompute.failed",
            extra={"enrollment_id": instance.enrollment_id, "exc": str(exc)},
        )


@receiver([post_save, post_delete], sender=Enrollment)
def _invalidate_dashboards_on_enrollment(sender, instance: Enrollment, **kwargs):
    """V4.A : invalide les caches dashboards quand un Enrollment change."""
    try:
        from core.cache import (
            invalidate_instructor_dashboard,
            invalidate_org_dashboard,
            invalidate_platform_dashboard,
        )
        if instance.company_id:
            invalidate_org_dashboard(instance.company_id)
        if instance.course_id:
            from catalog.models import Course
            inst_id = Course.objects.filter(pk=instance.course_id).values_list(
                "instructor_id", flat=True
            ).first()
            if inst_id:
                invalidate_instructor_dashboard(inst_id)
        invalidate_platform_dashboard()
    except Exception as exc:
        logger.warning("enrollments.dashboard.invalidate.failed", extra={"exc": str(exc)})
