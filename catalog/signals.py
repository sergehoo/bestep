"""catalog/signals.py — Invalidation cache dashboards V4.A.

Ces signaux invalident les KPIs cached quand un Course change d'état
(publication, archivage, suppression). Côté Lesson, on n'invalide pas
le dashboard car la granularité est trop fine ; l'auto-expiration TTL
60s suffit.
"""
from __future__ import annotations

import logging

from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .models import Course

logger = logging.getLogger(__name__)


@receiver([post_save, post_delete], sender=Course)
def _invalidate_dashboards_on_course_change(sender, instance: Course, **kwargs):
    """Invalide le dashboard org + plateforme + instructor."""
    try:
        from core.cache import (
            invalidate_instructor_dashboard,
            invalidate_org_dashboard,
            invalidate_platform_dashboard,
        )
        if instance.company_id:
            invalidate_org_dashboard(instance.company_id)
        if instance.instructor_id:
            invalidate_instructor_dashboard(instance.instructor_id)
        invalidate_platform_dashboard()
    except Exception as exc:  # noqa: BLE001
        logger.warning("dashboards.invalidate.failed", extra={"exc": str(exc)})
