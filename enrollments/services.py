"""enrollments/services.py — Service de calcul de progression.

CORRECTIF P2/P3 (audit ENROLL-05) :

Avant : ``Enrollment.progress_percent`` existait en DB mais n'était jamais
recalculé à partir des ``LessonProgress``. Les KPIs ``avg_progress`` des
dashboards org étaient toujours à zéro et la complétion n'était jamais
déclenchée → aucun certificat n'était émis automatiquement.

Après : ``recompute_enrollment_progress`` calcule le pourcentage en agrégant
les ``LessonProgress.completed`` rattachées et bascule l'enrollment en
COMPLETED + ``completed_at`` à 100 %. Le signal ``post_save`` sur
``LessonProgress`` appelle ce service automatiquement.
"""
from __future__ import annotations

import logging

from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone

from .models import Enrollment, LessonProgress

logger = logging.getLogger(__name__)


def recompute_enrollment_progress(enrollment_id: int) -> dict:
    """Recalcule progress_percent et bascule status si 100 %.

    Atomique : un seul UPDATE final, idempotent.
    """
    try:
        enrollment = Enrollment.objects.select_related("course").get(pk=enrollment_id)
    except Enrollment.DoesNotExist:
        return {"ok": False, "reason": "missing_enrollment"}

    # Total des leçons du cours.
    total = (
        enrollment.course.sections.aggregate(n=Count("lessons"))["n"] or 0
    )
    done = (
        LessonProgress.objects.filter(enrollment_id=enrollment_id, completed=True).count()
    )

    if total <= 0:
        percent = 0
    else:
        percent = int(round(100 * done / total))
        percent = max(0, min(percent, 100))

    updates = {"progress_percent": percent}
    if percent >= 100 and enrollment.status != Enrollment.Status.COMPLETED:
        updates["status"] = Enrollment.Status.COMPLETED
        updates["completed_at"] = timezone.now()

    Enrollment.objects.filter(pk=enrollment_id).update(**updates)
    logger.debug(
        "enrollments.progress.recomputed",
        extra={
            "enrollment_id": enrollment_id,
            "done": done,
            "total": total,
            "percent": percent,
        },
    )
    return {"ok": True, "percent": percent, "done": done, "total": total}


@transaction.atomic
def mark_lesson_completed(enrollment_id: int, lesson_id: int) -> dict:
    """Marque une leçon complétée et recalcule la progression.

    Idempotent.
    """
    lp, _ = LessonProgress.objects.select_for_update().get_or_create(
        enrollment_id=enrollment_id,
        lesson_id=lesson_id,
        defaults={"progress_percent": 100, "completed": True},
    )
    if not lp.completed or lp.progress_percent < 100:
        lp.completed = True
        lp.progress_percent = 100
        lp.save(update_fields=["completed", "progress_percent", "updated_at"])
    return recompute_enrollment_progress(enrollment_id)
