"""Tool : publish_course — publier un cours (L2 — confirmation renforcée).

Action sensible : le cours devient visible catalogue. Utilise
``catalog.lifecycle.publish_course`` (validation + journalisation).
"""
from __future__ import annotations

from .base import AbstractAITool, ToolPreview, ToolResult, register


@register
class PublishCourseTool(AbstractAITool):
    key = "publish_course"
    title = "Publier un cours"
    description = (
        "Publie un cours brouillon : visible dans le catalogue et "
        "inscriptions ouvertes. Action sensible — confirmation renforcée."
    )
    allowed_roles = ["instructor", "platform_admin"]
    confirmation_level = 2
    params_schema = {
        "course_id": {"type": "integer", "required": True},
        "note": {"type": "string", "required": False},
    }

    def build_preview(self, user, params: dict) -> ToolPreview:
        from catalog.models import Course

        course = Course.objects.filter(pk=params.get("course_id")).first()
        title = course.title if course else "?"
        return ToolPreview(
            summary=f"Publier le cours « {title[:60]} »",
            impact=(
                "Le cours devient visible dans le catalogue public. Il pourra "
                "recevoir des inscriptions. Cette action journalise un "
                "CourseLifecycleEvent et déclenche potentiellement des "
                "notifications aux apprenants abonnés à la thématique. "
                "Vous pouvez dépublier ensuite si nécessaire."
            ),
            affected_items=[
                {
                    "type": "course",
                    "id": course.id if course else None,
                    "title": title,
                    "status_before": course.status if course else "?",
                    "status_after": "PUBLISHED",
                }
            ],
            permissions_used=["catalog.publish_course"],
        )

    def run(self, user, params: dict) -> ToolResult:
        from catalog.lifecycle import publish_course
        from catalog.models import Course

        course = Course.objects.filter(pk=params.get("course_id")).first()
        if not course:
            return ToolResult(ok=False, detail="Cours introuvable.")

        # RBAC affiné identique à enroll_learner
        if not getattr(user, "is_platform_admin", False):
            if course.instructor_id != user.id:
                return ToolResult(ok=False, detail="Vous n'êtes pas l'instructeur de ce cours.")

        try:
            note = (params.get("note") or "Publication via agent IA (confirmée).")[:280]
            publish_course(course, actor=user, note=note)
        except Exception as exc:  # noqa: BLE001
            return ToolResult(ok=False, detail=f"Publication refusée : {exc}")

        course.refresh_from_db()
        return ToolResult(
            ok=True,
            detail=f"Cours « {course.title} » publié avec succès.",
            data={"course_id": course.id, "status": course.status},
        )
