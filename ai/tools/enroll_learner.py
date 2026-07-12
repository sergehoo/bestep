"""Tool : enroll_learner — inscrire un apprenant à un cours (L1).

Confirmation simple. RBAC : instructor peut inscrire un learner sur
son propre cours ; admin peut inscrire n'importe qui.
"""
from __future__ import annotations

from django.contrib.auth import get_user_model

from .base import AbstractAITool, ToolPreview, ToolResult, register


User = get_user_model()


@register
class EnrollLearnerTool(AbstractAITool):
    key = "enroll_learner"
    title = "Inscrire un apprenant"
    description = "Inscrit un apprenant à un cours publié."
    allowed_roles = ["instructor", "platform_admin"]
    confirmation_level = 1
    params_schema = {
        "user_id": {"type": "integer", "required": True},
        "course_id": {"type": "integer", "required": True},
    }

    def build_preview(self, user, params: dict) -> ToolPreview:
        from catalog.models import Course

        target = User.objects.filter(pk=params.get("user_id")).first()
        course = Course.objects.filter(pk=params.get("course_id")).first()
        return ToolPreview(
            summary=(
                f"Inscrire {target.email if target else 'apprenant inconnu'} "
                f"au cours « {course.title if course else '?'} »"
            ),
            impact=(
                "L'apprenant recevra l'accès au cours immédiatement et une "
                "notification interne. Cette action ne peut pas être annulée "
                "automatiquement (désinscription manuelle requise)."
            ),
            affected_items=[
                {"type": "user", "id": target.id if target else None, "email": target.email if target else "?"},
                {"type": "course", "id": course.id if course else None, "title": course.title if course else "?"},
            ],
            permissions_used=["enrollments.add_enrollment"],
        )

    def run(self, user, params: dict) -> ToolResult:
        from catalog.models import Course

        target = User.objects.filter(pk=params.get("user_id")).first()
        course = Course.objects.filter(pk=params.get("course_id")).first()
        if not target:
            return ToolResult(ok=False, detail="Apprenant introuvable.")
        if not course:
            return ToolResult(ok=False, detail="Cours introuvable.")
        if course.status != Course.Status.PUBLISHED:
            return ToolResult(ok=False, detail="Le cours doit être publié.")

        # RBAC affiné : instructor ne peut inscrire que sur ses cours.
        if not getattr(user, "is_platform_admin", False):
            if course.instructor_id != user.id:
                return ToolResult(ok=False, detail="Vous n'êtes pas l'instructeur de ce cours.")

        try:
            from enrollments.models import Enrollment

            enrollment, created = Enrollment.objects.get_or_create(
                user=target,
                course=course,
                defaults={"status": "ACTIVE"},
            )
            if not created:
                return ToolResult(
                    ok=False,
                    detail="Cet apprenant est déjà inscrit à ce cours.",
                    data={"enrollment_id": enrollment.id},
                )
            return ToolResult(
                ok=True,
                detail=f"{target.email} inscrit à « {course.title} ».",
                data={"enrollment_id": enrollment.id, "course_id": course.id},
            )
        except Exception as exc:  # noqa: BLE001
            return ToolResult(ok=False, detail=f"Erreur inscription : {exc}")
