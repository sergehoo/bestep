"""Tool : add_quiz_to_course — ajouter un quiz à un cours existant.

Contrairement à ``generate_full_course`` (qui crée le cours from scratch),
ce tool cible un cours **déjà en base** identifié par ``course_id``,
``course_slug`` ou ``course_title``. Il crée :

  - Une nouvelle Lesson de type QUIZ dans la section demandée (ou
    à la fin de la dernière section si non précisée) ;
  - Le Quiz correspondant (assessments.Quiz) rattaché à cette leçon ;
  - Les Question(s) + Choice(s) associés.

Sécurité :
    - Le cours doit appartenir à l'utilisateur (instructeur) OU être
      accessible à un platform_admin.
    - Bornes : max 50 questions par quiz, max 8 choix par question.
    - Titres tronqués aux max_length modèle.
    - Slug Quiz désambiguïsé automatiquement.
    - confirmation_level=1 → l'user voit un aperçu avant exécution.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from django.db import transaction
from django.db.models import Max
from django.utils.text import slugify

from .base import AbstractAITool, ToolPreview, ToolResult, register


MAX_QUESTIONS = 50
MAX_CHOICES_PER_QUESTION = 8


def _slugify_unique_quiz(title: str) -> str:
    """Slug unique pour assessments.Quiz (max 80)."""
    from assessments.models import Quiz

    base = slugify(title)[:70] or "quiz-ia"
    slug = base
    idx = 1
    while Quiz.objects.filter(slug=slug).exists():
        idx += 1
        suffix = f"-{idx}"
        slug = base[: 80 - len(suffix)] + suffix
    return slug


def _resolve_course(user, params: dict):
    """Trouve un cours accessible à l'utilisateur.

    Ordre de priorité : course_id > course_slug > course_title
    (recherche insensible à la casse dans les cours de l'user).

    Retourne l'objet Course ou None.
    """
    from catalog.models import Course

    course_id = params.get("course_id")
    course_slug = params.get("course_slug")
    course_title = params.get("course_title")

    is_admin = bool(getattr(user, "is_platform_admin", False))
    base_qs = Course.objects.all() if is_admin else Course.objects.filter(instructor=user)

    if course_id:
        try:
            return base_qs.filter(pk=int(course_id)).first()
        except (TypeError, ValueError):
            pass
    if course_slug:
        c = base_qs.filter(slug=str(course_slug).strip()).first()
        if c:
            return c
    if course_title:
        title = str(course_title).strip()
        # Match exact d'abord, puis contains (case-insensitive).
        c = base_qs.filter(title__iexact=title).first()
        if c:
            return c
        c = base_qs.filter(title__icontains=title).first()
        if c:
            return c
    return None


def _resolve_section(course, params: dict):
    """Trouve la section cible.

    Priorité : section_id > section_title (icontains sur le cours) >
    dernière section du cours > None (le caller créera une section
    "Évaluation" si aucune n'existe).
    """
    from catalog.models import CourseSection

    section_id = params.get("section_id")
    section_title = params.get("section_title")

    if section_id:
        try:
            s = CourseSection.objects.filter(pk=int(section_id), course=course).first()
            if s:
                return s
        except (TypeError, ValueError):
            pass
    if section_title:
        s = (
            CourseSection.objects.filter(
                course=course, title__icontains=str(section_title).strip()
            )
            .order_by("order")
            .first()
        )
        if s:
            return s
    return course.sections.order_by("-order").first()


def _normalize_questions(raw: Any) -> List[Dict[str, Any]]:
    """Nettoie/tronque/borne la liste des questions."""
    if not isinstance(raw, list):
        return []
    out: List[Dict[str, Any]] = []
    for q in raw[:MAX_QUESTIONS]:
        if not isinstance(q, dict):
            continue
        prompt = str(q.get("question") or q.get("prompt") or "").strip()
        if not prompt:
            continue
        qtype = str(q.get("type") or "multiple_choice").lower()
        item: Dict[str, Any] = {
            "prompt": prompt[:2000],
            "type": qtype,
            "explanation": str(q.get("explanation") or "").strip()[:500],
        }
        if qtype in ("true_false", "boolean", "tf"):
            raw_correct = q.get("correct")
            if raw_correct is None:
                ca = str(q.get("correct_answer") or "").strip().lower()
                raw_correct = ca in ("true", "vrai", "yes", "oui", "1")
            item["correct"] = bool(raw_correct)
        else:
            opts_raw = q.get("options") or []
            correct_answer = q.get("correct_answer")
            opts: List[Dict[str, Any]] = []
            if isinstance(opts_raw, list):
                for idx, opt in enumerate(opts_raw[:MAX_CHOICES_PER_QUESTION]):
                    if isinstance(opt, dict):
                        text = str(opt.get("text") or "").strip()
                        is_correct = bool(opt.get("correct"))
                    else:
                        text = str(opt).strip()
                        is_correct = False
                        if isinstance(correct_answer, str):
                            is_correct = text.lower() == correct_answer.strip().lower()
                        elif isinstance(correct_answer, int):
                            is_correct = idx == correct_answer
                        elif isinstance(correct_answer, list):
                            for a in correct_answer:
                                if isinstance(a, str) and text.lower() == a.strip().lower():
                                    is_correct = True
                                elif isinstance(a, int) and idx == a:
                                    is_correct = True
                    if text:
                        opts.append({"text": text[:500], "is_correct": is_correct})
            if not opts:
                continue
            # Garantir au moins une bonne réponse.
            if not any(o["is_correct"] for o in opts):
                opts[0]["is_correct"] = True
            item["options"] = opts
        out.append(item)
    return out


@register
class AddQuizToCourseTool(AbstractAITool):
    key = "add_quiz_to_course"
    title = "Ajouter un quiz à un cours existant"
    description = (
        "Crée un nouveau quiz (avec ses questions et choix) dans un cours "
        "déjà en base. Le quiz est ajouté comme leçon de type QUIZ dans "
        "la section demandée (ou à la fin de la dernière section)."
    )
    allowed_roles = ["instructor", "platform_admin"]
    confirmation_level = 1
    params_schema = {
        "course_id": {"type": "integer", "required": False},
        "course_slug": {"type": "string", "required": False, "max_length": 200},
        "course_title": {
            "type": "string",
            "required": False,
            "max_length": 200,
            "description": "Titre exact ou partiel — utilisé si course_id/slug absents",
        },
        "section_id": {"type": "integer", "required": False},
        "section_title": {"type": "string", "required": False, "max_length": 200},
        "title": {"type": "string", "required": True, "max_length": 200},
        "duration_min": {"type": "integer", "required": False, "default": 10},
        "passing_score": {"type": "integer", "required": False, "default": 70},
        "is_final": {"type": "boolean", "required": False, "default": False},
        "questions": {
            "type": "array",
            "required": True,
            "max_items": MAX_QUESTIONS,
            "description": (
                "Liste d'objets question. Format multiple_choice : "
                "{type, question, options: [{text, correct}], explanation}. "
                "Format true_false : {type: 'true_false', question, correct: bool, explanation}."
            ),
        },
    }

    # ── PREVIEW ─────────────────────────────────────────────────
    def build_preview(self, user, params: dict) -> ToolPreview:
        course = _resolve_course(user, params)
        title = str(params.get("title") or "").strip() or "Nouveau quiz"
        questions = _normalize_questions(params.get("questions"))

        if course is None:
            return ToolPreview(
                summary=f"Impossible : cours introuvable.",
                impact=(
                    "Aucun cours de votre catalogue ne correspond à "
                    f"course_id={params.get('course_id')} / "
                    f"slug={params.get('course_slug')} / "
                    f"title={params.get('course_title')}."
                ),
            )

        section = _resolve_section(course, params)
        section_label = section.title if section else "(nouvelle section « Évaluation »)"
        return ToolPreview(
            summary=(
                f"Ajouter un quiz de {len(questions)} question(s) au cours "
                f"« {course.title[:60]} » (section : {section_label})."
            ),
            impact=(
                f"Une leçon QUIZ nommée « {title[:60]} » sera créée dans la "
                f"section « {section_label} » du cours #{course.id}. Le quiz "
                "sera actif immédiatement mais reste sur un cours en "
                f"statut {course.status}."
            ),
            affected_items=[
                {"type": "course", "id": course.id, "title": course.title[:80]},
                {"type": "section", "title": section_label},
                {"type": "quiz", "title": title[:80], "questions_count": len(questions)},
            ],
            permissions_used=[
                "catalog.add_lesson",
                "assessments.add_quiz",
                "assessments.add_question",
                "assessments.add_choice",
            ],
        )

    # ── RUN ────────────────────────────────────────────────────
    def run(self, user, params: dict) -> ToolResult:
        from assessments.models import Quiz, Question, Choice
        from catalog.models import CourseSection, Lesson

        course = _resolve_course(user, params)
        if course is None:
            return ToolResult(
                ok=False,
                detail=(
                    "Cours introuvable ou non accessible. Précisez "
                    "course_id, course_slug ou course_title."
                ),
            )

        title = str(params.get("title") or "").strip()
        if not title:
            return ToolResult(ok=False, detail="Le titre du quiz est requis.")

        questions = _normalize_questions(params.get("questions"))
        if not questions:
            return ToolResult(
                ok=False,
                detail=(
                    "Au moins une question valide avec ses options est "
                    "requise. Vérifiez le format (voir params_schema)."
                ),
            )

        try:
            duration_min = max(1, int(params.get("duration_min") or 10))
        except (TypeError, ValueError):
            duration_min = 10
        try:
            passing_score = max(0, min(100, int(params.get("passing_score") or 70)))
        except (TypeError, ValueError):
            passing_score = 70
        is_final = bool(params.get("is_final"))

        try:
            with transaction.atomic():
                # 1) Résout ou crée la section cible.
                section = _resolve_section(course, params)
                if section is None:
                    section = CourseSection.objects.create(
                        course=course, title="Évaluation", order=1
                    )

                # 2) Lesson QUIZ à la fin de la section.
                max_order = (
                    Lesson.objects.filter(section=section)
                    .aggregate(m=Max("order"))["m"]
                    or 0
                )
                lesson = Lesson.objects.create(
                    section=section,
                    title=title[:200],
                    order=max_order + 1,
                    lesson_type=Lesson.LessonType.QUIZ,
                    duration_sec=duration_min * 60,
                    content=(
                        "<p>Répondez au quiz ci-dessous pour valider vos "
                        "acquis.</p>"
                    ),
                )

                # 3) Quiz + rattachement lesson (OneToOne).
                quiz = Quiz.objects.create(
                    title=title[:200],
                    slug=_slugify_unique_quiz(title),
                    course=course,
                    section=section,
                    lesson=lesson,
                    is_active=True,
                    is_final=is_final,
                    passing_score=passing_score,
                    max_attempts=3,
                )

                # 4) Question(s) + Choice(s).
                created_questions = 0
                for order_idx, q in enumerate(questions, start=1):
                    question = Question.objects.create(
                        quiz=quiz, prompt=q["prompt"], order=order_idx
                    )
                    if q["type"] in ("true_false", "boolean", "tf"):
                        correct_val = bool(q.get("correct"))
                        Choice.objects.create(
                            question=question, text="Vrai", is_correct=correct_val
                        )
                        Choice.objects.create(
                            question=question, text="Faux", is_correct=not correct_val
                        )
                    else:
                        for opt in q.get("options") or []:
                            Choice.objects.create(
                                question=question,
                                text=opt["text"],
                                is_correct=opt["is_correct"],
                            )
                    created_questions += 1
        except Exception as exc:  # noqa: BLE001
            return ToolResult(
                ok=False,
                detail=(
                    f"Création interrompue : {exc.__class__.__name__} — "
                    f"{str(exc)[:200]}"
                ),
            )

        return ToolResult(
            ok=True,
            detail=(
                f"Quiz créé : « {quiz.title} » — {created_questions} "
                f"question(s), score requis {passing_score}%. Attaché à la "
                f"section « {section.title} » du cours « {course.title} »."
            ),
            data={
                "quiz_id": quiz.id,
                "quiz_slug": quiz.slug,
                "lesson_id": lesson.id,
                "section_id": section.id,
                "course_id": course.id,
                "questions_created": created_questions,
                "edit_url": f"/instructor/courses/{course.id}/edit",
                "player_url": f"/learn/courses/{course.id}/player",
            },
        )
