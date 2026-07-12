"""Tool : search_courses — recherche dans le catalogue (L0).

Retourne une liste de cours filtrés (titre, level, catégorie). Aucune
écriture. Autorisé pour tout utilisateur authentifié.
"""
from __future__ import annotations

from django.db.models import Q

from .base import AbstractAITool, ToolResult, register


@register
class SearchCoursesTool(AbstractAITool):
    key = "search_courses"
    title = "Rechercher un cours"
    description = "Recherche dans le catalogue des cours publiés (titre, catégorie, niveau)."
    allowed_roles = ["any"]
    confirmation_level = 0
    params_schema = {
        "q": {"type": "string", "required": False, "description": "Mots-clés"},
        "level": {"type": "string", "required": False, "enum": ["BEGINNER", "INTERMEDIATE", "ADVANCED"]},
        "limit": {"type": "integer", "required": False, "default": 10, "max": 50},
    }

    def run(self, user, params: dict) -> ToolResult:
        from catalog.models import Course

        q = (params.get("q") or "").strip()
        level = (params.get("level") or "").upper() or None
        limit = min(int(params.get("limit") or 10), 50)

        qs = Course.objects.filter(status=Course.Status.PUBLISHED)
        if q:
            qs = qs.filter(Q(title__icontains=q) | Q(description__icontains=q))
        if level:
            qs = qs.filter(level=level)
        qs = qs.order_by("-created_at")[:limit]

        results = [
            {
                "id": c.id,
                "title": c.title,
                "slug": c.slug,
                "level": getattr(c, "level", None),
                "language": getattr(c, "language", None),
                "course_type": getattr(c, "course_type", None),
            }
            for c in qs
        ]
        return ToolResult(
            ok=True,
            detail=f"{len(results)} cours trouvé(s).",
            data={"query": q, "results": results},
        )
