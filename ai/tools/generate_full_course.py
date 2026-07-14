"""Tool : generate_full_course — création d'une formation complète (L2).

Contrairement à ``create_course_draft`` (qui ne crée qu'une coquille de
cours vide), ce tool accepte une **structure de formation complète** :
titre, description, niveau, langue + liste de sections dont chacune
contient une liste de leçons. Tout est créé en une **transaction
atomique** : Course + CourseSection[] + Lesson[].

Format des ``params`` attendus (validé au run) :

    {
      "title": "Investir en bourse : les fondamentaux",
      "subtitle": "Optionnel",
      "description": "Optionnel",
      "level": "BEGINNER" | "INTERMEDIATE" | "ADVANCED",
      "language": "fr",
      "sections": [
        {
          "title": "Module 1 — Fondamentaux",
          "lessons": [
            {
              "title": "Qu'est-ce qu'une action ?",
              "lesson_type": "TEXT" | "VIDEO" | "FILE" | "QUIZ" | "LIVE",
              "duration_min": 15,
              "content": "<p>HTML optionnel du contenu de la leçon.</p>"
            },
            ...
          ]
        },
        ...
      ]
    }

Sécurité :
    - Le cours est TOUJOURS créé en statut ``DRAFT``. La publication reste
      une action explicite de l'instructeur (approbation humaine).
    - Bornes strictes : max 30 sections × 30 leçons = 900 leçons/course.
    - Titres tronqués défensivement à leur max_length modèle.
    - Slug généré automatiquement + désambiguïsation par suffixe -N.
    - Requiert ``confirmation_level=1`` (le user voit un preview avant
      exécution) car l'action crée du contenu persistant.

Le tool ne publie jamais le cours, ne le met jamais en review, et
n'inscrit aucun apprenant. Ces actions restent réservées aux tools
dédiés (``publish_course``, ``enroll_learner``) + validation métier.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any, Dict, List

from django.db import transaction
from django.utils.text import slugify

from .base import AbstractAITool, ToolPreview, ToolResult, register


# ── Bornes de sécurité (évite d'accepter un plan de 10_000 leçons) ────
MAX_SECTIONS = 30
MAX_LESSONS_PER_SECTION = 30
LESSON_TYPES = {"VIDEO", "TEXT", "FILE", "QUIZ", "LIVE"}
LEVELS = {"BEGINNER", "INTERMEDIATE", "ADVANCED"}


def _slugify_unique(title: str) -> str:
    """Génère un slug unique pour la table catalog.Course."""
    from catalog.models import Course

    base = slugify(title)[:200] or "cours-ia"
    slug = base
    idx = 1
    while Course.objects.filter(slug=slug).exists():
        idx += 1
        slug = f"{base}-{idx}"
    return slug


def _normalize_sections(raw_sections: Any) -> List[Dict[str, Any]]:
    """Nettoie/tronque/borne la liste sections + leçons.

    Retourne toujours une liste — vide si l'entrée est mal formée.
    """
    if not isinstance(raw_sections, list):
        return []
    out: List[Dict[str, Any]] = []
    for s_idx, section in enumerate(raw_sections[:MAX_SECTIONS]):
        if not isinstance(section, dict):
            continue
        title = str(section.get("title") or f"Section {s_idx + 1}")[:200].strip()
        raw_lessons = section.get("lessons")
        lessons: List[Dict[str, Any]] = []
        if isinstance(raw_lessons, list):
            for l_idx, lesson in enumerate(raw_lessons[:MAX_LESSONS_PER_SECTION]):
                if not isinstance(lesson, dict):
                    continue
                ltype = str(lesson.get("lesson_type") or "TEXT").upper()
                if ltype not in LESSON_TYPES:
                    ltype = "TEXT"
                try:
                    duration_min = max(1, int(lesson.get("duration_min") or 10))
                except (TypeError, ValueError):
                    duration_min = 10
                lessons.append(
                    {
                        "title": str(
                            lesson.get("title") or f"Leçon {l_idx + 1}"
                        )[:200].strip(),
                        "lesson_type": ltype,
                        "duration_min": duration_min,
                        "content": str(lesson.get("content") or "").strip(),
                    }
                )
        out.append({"title": title, "lessons": lessons})
    return out


@register
class GenerateFullCourseTool(AbstractAITool):
    key = "generate_full_course"
    title = "Générer une formation complète"
    description = (
        "Crée un nouveau cours en brouillon avec toutes ses sections et "
        "leçons en une transaction. Le cours n'est jamais publié "
        "automatiquement — publication ultérieure à valider par un "
        "humain."
    )
    allowed_roles = ["instructor", "platform_admin"]
    confirmation_level = 1
    params_schema = {
        "title": {"type": "string", "required": True, "max_length": 200},
        "subtitle": {"type": "string", "required": False, "max_length": 220},
        "description": {"type": "string", "required": False},
        "level": {
            "type": "string",
            "required": False,
            "enum": ["BEGINNER", "INTERMEDIATE", "ADVANCED"],
        },
        "language": {"type": "string", "required": False, "default": "fr"},
        "sections": {
            "type": "array",
            "required": True,
            "description": (
                "Liste d'objets {title, lessons: [{title, lesson_type, "
                "duration_min, content}]}"
            ),
            "max_items": MAX_SECTIONS,
        },
    }

    # ── PREVIEW ─────────────────────────────────────────────────
    def build_preview(self, user, params: dict) -> ToolPreview:
        title = str(params.get("title") or "").strip()
        level = str(params.get("level") or "BEGINNER").upper()
        language = str(params.get("language") or "fr").lower()
        sections = _normalize_sections(params.get("sections"))
        lessons_count = sum(len(s["lessons"]) for s in sections)

        # Preview compact : liste des titres de section avec le nombre
        # de leçons dans chaque, pour que l'user voit ce qu'il approuve.
        affected: List[Dict[str, Any]] = [
            {
                "type": "course",
                "title": title[:60] or "sans titre",
                "level": level,
                "language": language,
            }
        ]
        for s_idx, s in enumerate(sections):
            affected.append(
                {
                    "type": "section",
                    "index": s_idx + 1,
                    "title": s["title"][:80],
                    "lessons_count": len(s["lessons"]),
                }
            )

        return ToolPreview(
            summary=(
                f"Créer la formation « {title[:60] or 'sans titre'} » : "
                f"{len(sections)} section(s), {lessons_count} leçon(s), "
                f"statut DRAFT."
            ),
            impact=(
                f"Un cours brouillon sera créé avec {len(sections)} "
                f"section(s) et {lessons_count} leçon(s) au total. Le "
                "cours reste invisible aux apprenants tant que vous ne "
                "le publiez pas manuellement. Vous pourrez éditer chaque "
                "leçon avant publication."
            ),
            affected_items=affected,
            permissions_used=[
                "catalog.add_course",
                "catalog.add_coursesection",
                "catalog.add_lesson",
            ],
        )

    # ── RUN ────────────────────────────────────────────────────
    def run(self, user, params: dict) -> ToolResult:
        from catalog.models import Course, CourseSection, Lesson

        title = str(params.get("title") or "").strip()
        if not title:
            return ToolResult(ok=False, detail="Le titre du cours est requis.")

        subtitle = str(params.get("subtitle") or "").strip()[:220]
        description = str(params.get("description") or "").strip()
        level = str(params.get("level") or "BEGINNER").upper()
        if level not in LEVELS:
            level = "BEGINNER"
        language = str(params.get("language") or "fr").lower()[:10]

        sections = _normalize_sections(params.get("sections"))
        if not sections:
            return ToolResult(
                ok=False,
                detail=(
                    "Au moins une section avec au moins une leçon est "
                    "requise. Fournir un objet ``sections: [{title, "
                    "lessons: [{title, ...}]}]``."
                ),
            )

        try:
            with transaction.atomic():
                course = Course.objects.create(
                    title=title[:200],
                    slug=_slugify_unique(title),
                    subtitle=subtitle,
                    description=description,
                    instructor=user,
                    course_type=Course.CourseType.PROFESSIONNELLE,
                    pricing_type=Course.PricingType.FREE,
                    price=Decimal("0"),
                    currency="XOF",
                    status=Course.Status.DRAFT,
                    level=level,
                    language=language,
                )

                sections_created = 0
                lessons_created = 0
                for s_idx, section_data in enumerate(sections):
                    section = CourseSection.objects.create(
                        course=course,
                        title=section_data["title"] or f"Section {s_idx + 1}",
                        order=s_idx + 1,
                    )
                    sections_created += 1
                    for l_idx, lesson_data in enumerate(section_data["lessons"]):
                        Lesson.objects.create(
                            section=section,
                            title=lesson_data["title"] or f"Leçon {l_idx + 1}",
                            order=l_idx + 1,
                            lesson_type=lesson_data["lesson_type"],
                            duration_sec=lesson_data["duration_min"] * 60,
                            content=(
                                lesson_data["content"]
                                or "<p>Contenu à compléter par l'instructeur.</p>"
                            ),
                        )
                        lessons_created += 1
        except Exception as exc:  # pragma: no cover — safeguard DB errors
            return ToolResult(
                ok=False,
                detail=f"Création interrompue : {exc.__class__.__name__} — {str(exc)[:200]}",
            )

        return ToolResult(
            ok=True,
            detail=(
                f"Formation créée : « {course.title} » "
                f"({sections_created} section(s), {lessons_created} leçon(s), "
                "statut DRAFT). Prochaine étape : éditer les leçons puis publier."
            ),
            data={
                "course_id": course.id,
                "slug": course.slug,
                "status": course.status,
                "sections_created": sections_created,
                "lessons_created": lessons_created,
                # URL relative — le frontend peut la préfixer d'un
                # host ou l'utiliser en href direct.
                "edit_url": f"/instructor/courses/{course.id}/edit",
                "preview_url": f"/instructor/courses/{course.id}",
            },
        )
