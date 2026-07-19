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

import json
import re
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


def _slugify_unique_quiz(title: str) -> str:
    """Génère un slug unique pour assessments.Quiz (max 80)."""
    from assessments.models import Quiz

    base = slugify(title)[:70] or "quiz-ia"
    slug = base
    idx = 1
    while Quiz.objects.filter(slug=slug).exists():
        idx += 1
        suffix = f"-{idx}"
        slug = base[: 80 - len(suffix)] + suffix
    return slug


def _parse_quiz_payload(raw: str) -> Dict[str, Any]:
    """Extrait `{questions: [...]}` du contenu d'une leçon QUIZ.

    Le contenu peut être :
      - Un JSON pur : `{"questions": [...]}`
      - Un JSON dans un bloc code : ```json { ... } ```
      - Une string qui contient les 2 (on cherche le premier `{ ... }`
        équilibré qui contient la clé `questions`).

    Retourne `{}` si non parsable.
    """
    if not raw:
        return {}
    txt = raw.strip()
    # Retire un éventuel bloc fenced (```json ... ``` ou ``` ... ```).
    fenced = re.match(r"^```(?:json)?\s*([\s\S]+?)\s*```$", txt)
    if fenced:
        txt = fenced.group(1).strip()

    # Tentative directe.
    try:
        data = json.loads(txt)
        if isinstance(data, dict) and isinstance(data.get("questions"), list):
            return data
    except (json.JSONDecodeError, ValueError):
        pass

    # Fallback : trouve la première accolade équilibrée qui contient
    # "questions". Utile quand le contenu contient à la fois du HTML
    # descriptif ET un JSON.
    start = txt.find("{")
    while start != -1:
        depth = 0
        for j, ch in enumerate(txt[start:], start):
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    candidate = txt[start : j + 1]
                    try:
                        data = json.loads(candidate)
                        if isinstance(data, dict) and isinstance(
                            data.get("questions"), list
                        ):
                            return data
                    except (json.JSONDecodeError, ValueError):
                        pass
                    break
        start = txt.find("{", start + 1)
    return {}


def _create_quiz_from_payload(
    lesson, section, course, payload: Dict[str, Any]
) -> int:
    """Crée un Quiz + Question(s) + Choice(s) attachés à la leçon.

    Retourne le nombre de questions créées (0 = pas de quiz créé).

    Accepte 2 formats de question :
      - multiple_choice : options=[{text, correct}, ...]
      - true_false : correct=bool (Vrai/Faux comme choix)
    """
    from assessments.models import Quiz, Question, Choice

    questions_raw = payload.get("questions") or []
    if not isinstance(questions_raw, list) or not questions_raw:
        return 0

    quiz = Quiz.objects.create(
        title=lesson.title[:200],
        slug=_slugify_unique_quiz(lesson.title),
        course=course,
        section=section,
        lesson=lesson,
        is_active=True,
        passing_score=70,
        max_attempts=3,
    )

    created = 0
    for order_idx, q in enumerate(questions_raw, start=1):
        if not isinstance(q, dict):
            continue
        prompt = str(q.get("question") or q.get("prompt") or "").strip()
        if not prompt:
            continue
        question = Question.objects.create(
            quiz=quiz, prompt=prompt[:2000], order=order_idx
        )

        qtype = str(q.get("type") or "multiple_choice").lower()
        if qtype in ("true_false", "boolean", "tf"):
            # Le champ "correct" (booléen) OU "correct_answer" (chaîne
            # "Vrai"/"Faux"/"true"/"false") : on normalise les deux.
            raw_correct = q.get("correct")
            if raw_correct is None:
                ca = str(q.get("correct_answer") or "").strip().lower()
                raw_correct = ca in ("true", "vrai", "yes", "oui", "1")
            correct_val = bool(raw_correct)
            Choice.objects.create(
                question=question, text="Vrai", is_correct=correct_val
            )
            Choice.objects.create(
                question=question, text="Faux", is_correct=not correct_val
            )
        else:
            opts = q.get("options") or []
            if not isinstance(opts, list) or not opts:
                # Question sans options → on la retire.
                question.delete()
                continue
            # Support de 2 formats :
            #   A) options: [{"text": "...", "correct": true}, ...]
            #   B) options: ["str", "str", ...] + correct_answer: "str"
            #      (ou correct_answer: 0 = index, ou une liste d'index).
            correct_answer = q.get("correct_answer")
            correct_answers_norm: set[str] = set()
            correct_index_set: set[int] = set()
            if isinstance(correct_answer, str):
                correct_answers_norm.add(correct_answer.strip().lower())
            elif isinstance(correct_answer, list):
                for a in correct_answer:
                    if isinstance(a, str):
                        correct_answers_norm.add(a.strip().lower())
                    elif isinstance(a, int):
                        correct_index_set.add(a)
            elif isinstance(correct_answer, int):
                correct_index_set.add(correct_answer)

            for opt_idx, opt in enumerate(opts):
                if isinstance(opt, dict):
                    text = str(opt.get("text") or "").strip()
                    is_correct = bool(opt.get("correct"))
                    # Cas dict avec is_correct absent → utiliser
                    # correct_answer top-level en fallback.
                    if "correct" not in opt and correct_answers_norm:
                        is_correct = text.lower() in correct_answers_norm
                else:
                    text = str(opt).strip()
                    is_correct = (
                        text.lower() in correct_answers_norm
                        or opt_idx in correct_index_set
                    )
                if not text:
                    continue
                Choice.objects.create(
                    question=question, text=text[:500], is_correct=is_correct
                )
            # Sécurité : si aucune choice n'est marquée correcte (LLM
            # buggy), on prend la 1ère comme correcte pour éviter un
            # quiz insoluble.
            if not question.choices.filter(is_correct=True).exists():
                first = question.choices.first()
                if first:
                    first.is_correct = True
                    first.save(update_fields=["is_correct"])
        created += 1

    if created == 0:
        # Rien de valide → on supprime le quiz vide.
        quiz.delete()
    return created


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

                # Génération auto d'une cover SVG thématique (adaptée au
                # titre + niveau + langue). Ne bloque jamais la création
                # du cours en cas d'erreur — c'est purement décoratif.
                # NB : ImageField valide via Pillow qui rejette le SVG →
                # on utilise save=False + save(update_fields) comme le
                # font InstructorCourseGenerateCoverView (chemin manuel
                # qui marche déjà en prod).
                try:
                    from catalog.cover_generator import generate_svg_cover
                    from django.core.files.base import ContentFile

                    svg_bytes = generate_svg_cover(
                        title=title,
                        subtitle=subtitle,
                        level=level,
                        language=language,
                    )
                    filename = f"cover-{course.slug or course.id}.svg"
                    course.thumbnail.save(
                        filename, ContentFile(svg_bytes), save=False
                    )
                    course.save(update_fields=["thumbnail"])
                except Exception:  # noqa: BLE001 — cover facultative
                    pass

                sections_created = 0
                lessons_created = 0
                quizzes_created = 0
                questions_created = 0
                for s_idx, section_data in enumerate(sections):
                    section = CourseSection.objects.create(
                        course=course,
                        title=section_data["title"] or f"Section {s_idx + 1}",
                        order=s_idx + 1,
                    )
                    sections_created += 1
                    for l_idx, lesson_data in enumerate(section_data["lessons"]):
                        ltype = lesson_data["lesson_type"]
                        raw_content = lesson_data["content"]
                        is_quiz = ltype == "QUIZ"

                        # Pour un QUIZ, le contenu texte de la leçon reste
                        # descriptif (résumé/consignes), mais les
                        # questions sont stockées dans le modèle Quiz.
                        display_content = raw_content
                        if is_quiz:
                            # On remplace le JSON par un placeholder pédagogique
                            # si le contenu est justement le JSON du quiz.
                            if raw_content.startswith("{") or raw_content.startswith("```"):
                                display_content = (
                                    "<p>Répondez au quiz ci-dessous pour "
                                    "valider vos acquis.</p>"
                                )

                        lesson = Lesson.objects.create(
                            section=section,
                            title=lesson_data["title"] or f"Leçon {l_idx + 1}",
                            order=l_idx + 1,
                            lesson_type=ltype,
                            duration_sec=lesson_data["duration_min"] * 60,
                            content=(
                                display_content
                                or "<p>Contenu à compléter par l'instructeur.</p>"
                            ),
                        )
                        lessons_created += 1

                        # Création Quiz/Question/Choice si applicable.
                        if is_quiz:
                            payload = _parse_quiz_payload(raw_content)
                            if payload:
                                nb = _create_quiz_from_payload(
                                    lesson, section, course, payload
                                )
                                if nb > 0:
                                    quizzes_created += 1
                                    questions_created += nb
        except Exception as exc:  # pragma: no cover — safeguard DB errors
            return ToolResult(
                ok=False,
                detail=f"Création interrompue : {exc.__class__.__name__} — {str(exc)[:200]}",
            )

        quiz_extra = ""
        if quizzes_created:
            quiz_extra = (
                f", {quizzes_created} quiz avec "
                f"{questions_created} question(s)"
            )
        return ToolResult(
            ok=True,
            detail=(
                f"Formation créée : « {course.title} » "
                f"({sections_created} section(s), {lessons_created} leçon(s)"
                f"{quiz_extra}, statut DRAFT). Prochaine étape : éditer "
                "les leçons puis publier."
            ),
            data={
                "course_id": course.id,
                "slug": course.slug,
                "status": course.status,
                "sections_created": sections_created,
                "lessons_created": lessons_created,
                "quizzes_created": quizzes_created,
                "questions_created": questions_created,
                # URL relative — le frontend peut la préfixer d'un
                # host ou l'utiliser en href direct.
                "edit_url": f"/instructor/courses/{course.id}/edit",
                "preview_url": f"/instructor/courses/{course.id}",
            },
        )
