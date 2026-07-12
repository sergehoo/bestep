"""Tool : create_course_draft — création rapide d'un cours brouillon (L1).

Confirmation simple : montre le titre + niveau + langue avant création.
Ne publie pas — status=DRAFT toujours.
"""
from __future__ import annotations

from django.utils.text import slugify

from .base import AbstractAITool, ToolPreview, ToolResult, register


@register
class CreateCourseDraftTool(AbstractAITool):
    key = "create_course_draft"
    title = "Créer un cours brouillon"
    description = "Crée un nouveau cours en brouillon avec les métadonnées de base."
    allowed_roles = ["instructor", "platform_admin"]
    confirmation_level = 1
    params_schema = {
        "title": {"type": "string", "required": True, "max_length": 200},
        "subtitle": {"type": "string", "required": False},
        "level": {"type": "string", "required": False, "enum": ["BEGINNER", "INTERMEDIATE", "ADVANCED"]},
        "language": {"type": "string", "required": False, "default": "fr"},
    }

    def build_preview(self, user, params: dict) -> ToolPreview:
        title = (params.get("title") or "").strip()
        level = (params.get("level") or "BEGINNER").upper()
        language = (params.get("language") or "fr").lower()
        return ToolPreview(
            summary=f"Créer le cours brouillon « {title[:60] or 'sans titre'} »",
            impact=(
                "Un nouveau cours sera créé en statut DRAFT dans le catalogue. "
                "Il ne sera visible d'aucun apprenant tant que vous ne l'aurez "
                "pas publié manuellement."
            ),
            affected_items=[
                {"type": "course", "title": title, "level": level, "language": language},
            ],
            permissions_used=["catalog.add_course"],
        )

    def run(self, user, params: dict) -> ToolResult:
        from catalog.models import Course

        title = (params.get("title") or "").strip()
        if not title:
            return ToolResult(ok=False, detail="Le titre est requis.")
        subtitle = (params.get("subtitle") or "").strip()[:220]
        level = (params.get("level") or "BEGINNER").upper()
        language = (params.get("language") or "fr").lower()[:10]

        base = slugify(title)[:200] or "cours-ia"
        slug = base
        i = 1
        while Course.objects.filter(slug=slug).exists():
            i += 1
            slug = f"{base}-{i}"

        course = Course.objects.create(
            title=title[:200],
            slug=slug,
            subtitle=subtitle,
            instructor=user,
            course_type=Course.CourseType.PROFESSIONNELLE,
            pricing_type=Course.PricingType.FREE,
            price=0,
            currency="XOF",
            status=Course.Status.DRAFT,
            level=level if level in ("BEGINNER", "INTERMEDIATE", "ADVANCED") else "BEGINNER",
            language=language,
        )
        return ToolResult(
            ok=True,
            detail=f"Cours brouillon créé : « {course.title} » (id={course.id}).",
            data={"course_id": course.id, "slug": course.slug, "status": course.status},
        )
