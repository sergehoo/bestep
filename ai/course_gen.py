"""ai.course_gen — Générateur de cours IA (Phase 2).

Étapes :
    1. brief          — utilisateur pose ses paramètres
    2. plan           — LLM propose plan structuré (JSON)
    3. lessons_content — LLM génère le contenu d'une leçon
    4. quizzes        — LLM génère un quiz par section
    5. certification  — LLM recommande le mode de certification
    6. finalize       — création atomique Course + Section + Lesson

Chaque étape LLM utilise un **prompt structuré JSON** : on demande au
modèle de produire uniquement du JSON parsable, et on tombe sur un
fallback synthétique déterministe (basé sur le brief) si le stub-dev
est utilisé ou si le JSON reçu est invalide.
"""
from __future__ import annotations

import json
import re
from decimal import Decimal
from typing import Any, Dict

from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify

from .models import AICourseGeneration, AIAuditLog
from .providers import ChatMessage, get_provider_for_purpose


# ─────────────────────────────────────────────────────────────
# Helpers LLM structuré
# ─────────────────────────────────────────────────────────────


def _try_extract_json(text: str) -> Dict[str, Any] | None:
    """Extrait un objet JSON du texte du LLM (tolère ```json blocs et prose)."""
    if not text:
        return None
    # Bloc code triple-backtick
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if m:
        candidate = m.group(1)
    else:
        # Cherche le premier { …. } équilibré grossièrement
        start = text.find("{")
        end = text.rfind("}")
        if start < 0 or end <= start:
            return None
        candidate = text[start : end + 1]
    try:
        return json.loads(candidate)
    except (json.JSONDecodeError, ValueError):
        return None


def _call_llm_json(*, purpose: str, system: str, user_prompt: str) -> Dict[str, Any] | None:
    resolved = get_provider_for_purpose(purpose)
    messages = [
        ChatMessage(role="system", content=system),
        ChatMessage(role="user", content=user_prompt),
    ]
    try:
        result = resolved.provider.chat(
            model=resolved.model_name,
            messages=messages,
            temperature=0.4,
            max_tokens=resolved.max_tokens,
        )
    except Exception:
        return None
    return _try_extract_json(result.content or "")


# ─────────────────────────────────────────────────────────────
# Fallbacks synthétiques (sans LLM)
# ─────────────────────────────────────────────────────────────


def _default_plan(brief: dict) -> dict:
    topic = (brief.get("topic") or "Investissement en bourse").strip()
    audience = (brief.get("audience") or "débutants").strip()
    level = (brief.get("level") or "BEGINNER").strip()
    duration_hours = int(brief.get("duration_hours") or 4)
    lang = (brief.get("language") or "fr").strip()

    section_count = 4 if duration_hours <= 6 else 6
    lessons_per_section = max(2, min(4, duration_hours * 2 // section_count))

    sections = []
    for s in range(section_count):
        lessons = []
        for l in range(lessons_per_section):
            lessons.append(
                {
                    "title": f"Leçon {s + 1}.{l + 1} — clé pratique",
                    "duration_min": max(6, 60 // lessons_per_section),
                    "objectives": [
                        "Comprendre le concept clé",
                        "Appliquer sur un cas concret",
                    ],
                }
            )
        sections.append(
            {
                "title": f"Section {s + 1} — Fondations {s + 1}",
                "summary": (
                    f"Panorama structuré pour {audience} : concepts, exemples, "
                    "erreurs fréquentes."
                ),
                "lessons": lessons,
            }
        )

    return {
        "title": f"{topic} — parcours {audience}",
        "subtitle": f"Une formation complète pour {audience}",
        "description": (
            f"Cette formation vous accompagne pas à pas sur le sujet « {topic} ». "
            f"Elle est conçue pour {audience}. À l'issue, vous serez capable "
            "d'appliquer les concepts sur des cas concrets."
        ),
        "objectives": [
            f"Maîtriser les bases de {topic}",
            "Mettre en pratique via des exercices guidés",
            "Se projeter sur des cas réels d'usage",
        ],
        "audience": audience,
        "prerequisites": ["Aucun prérequis"],
        "level": level,
        "language": lang,
        "duration_hours": duration_hours,
        "sections": sections,
        "keywords": [topic.split()[0].lower(), audience.lower(), "formation"],
        "certification_hint": {
            "recommended_mode": "COURSE_CERTIFICATE"
            if duration_hours >= 4
            else "PARTICIPATION",
            "reasoning": (
                "Durée + évaluations recommandées → certificat de réussite."
                if duration_hours >= 4
                else "Formation courte, attestation de participation suffisante."
            ),
        },
    }


def _default_lesson_content(brief: dict, plan: dict, section_idx: int, lesson_idx: int) -> dict:
    lesson_meta = (
        (plan.get("sections") or [])[section_idx].get("lessons") or []
    )[lesson_idx]
    title = lesson_meta.get("title", "Leçon")
    topic = brief.get("topic") or "sujet"
    return {
        "title": title,
        "html": (
            f"<h3>{title}</h3>"
            f"<p><strong>Introduction.</strong> Cette leçon aborde une facette "
            f"essentielle de <em>{topic}</em>.</p>"
            "<h4>Objectifs</h4>"
            "<ul><li>Comprendre le concept clé</li><li>Le mettre en application</li></ul>"
            "<h4>Contenu principal</h4>"
            "<p>Nous verrons ici les fondations théoriques puis un exemple pratique.</p>"
            "<blockquote><em>Conseil :</em> prenez des notes au fur et à mesure.</blockquote>"
            "<h4>À retenir</h4>"
            "<ul><li>Point clé n°1</li><li>Point clé n°2</li><li>Point clé n°3</li></ul>"
        ),
        "key_points": [
            "Point clé n°1",
            "Point clé n°2",
            "Point clé n°3",
        ],
        "resources": [],
    }


def _default_section_quiz(plan: dict, section_idx: int) -> dict:
    section = (plan.get("sections") or [])[section_idx]
    section_title = section.get("title", f"Section {section_idx + 1}")
    return {
        "section_title": section_title,
        "questions": [
            {
                "type": "SINGLE",
                "prompt": f"Quel est l'objectif principal de la {section_title.lower()} ?",
                "choices": [
                    "Comprendre les concepts clés",
                    "Uniquement mémoriser des définitions",
                    "Passer un examen final",
                    "Aucune de ces réponses",
                ],
                "correct": [0],
                "explanation": "Cette section vise à ancrer les concepts clés du domaine.",
                "difficulty": "EASY",
                "score": 1,
            },
            {
                "type": "TRUE_FALSE",
                "prompt": "Les exemples concrets aident à mieux ancrer les concepts.",
                "choices": ["Vrai", "Faux"],
                "correct": [0],
                "explanation": "Les exemples concrets sont essentiels à la mémorisation.",
                "difficulty": "EASY",
                "score": 1,
            },
            {
                "type": "MULTIPLE",
                "prompt": "Parmi ces bonnes pratiques, lesquelles sont recommandées ?",
                "choices": [
                    "Prendre des notes",
                    "Sauter les exercices",
                    "Revenir sur les points clés",
                    "Éviter la pratique",
                ],
                "correct": [0, 2],
                "explanation": "Notes + révision des points clés = ancrage durable.",
                "difficulty": "MEDIUM",
                "score": 2,
            },
        ],
    }


def _default_certification(brief: dict, plan: dict) -> dict:
    duration = int(plan.get("duration_hours") or brief.get("duration_hours") or 4)
    if duration >= 8:
        mode = "CERTIFICATE"
        reason = "Durée > 8h + évaluations → certificat de réussite recommandé."
        score_min = 70
    elif duration >= 4:
        mode = "COURSE_CERTIFICATE"
        reason = "Formation moyenne (4-7h) → certificat cours + score min 60%."
        score_min = 60
    else:
        mode = "PARTICIPATION"
        reason = "Formation courte → attestation de participation."
        score_min = 0
    return {
        "recommended_mode": mode,
        "reasoning": reason,
        "score_min": score_min,
        "issues_badge": duration >= 4,
    }


# ─────────────────────────────────────────────────────────────
# Étapes appelées par les vues
# ─────────────────────────────────────────────────────────────


def _prompt_system() -> str:
    return (
        "Tu es un concepteur pédagogique senior. Tu produis des plans de "
        "formation et du contenu structuré. Tu réponds STRICTEMENT en JSON "
        "valide, sans texte hors JSON."
    )


def generate_plan(generation: AICourseGeneration) -> dict:
    brief = generation.brief or {}
    prompt = (
        "À partir du brief suivant, produis un plan de formation détaillé "
        "au format JSON avec les clés : title, subtitle, description, "
        "objectives (array), audience, prerequisites (array), level "
        "(BEGINNER|INTERMEDIATE|ADVANCED), language, duration_hours, "
        "sections (array de {title, summary, lessons: [{title, duration_min, "
        "objectives:[]}]}) et keywords (array).\n\n"
        f"Brief :\n{json.dumps(brief, ensure_ascii=False, indent=2)}"
    )
    parsed = _call_llm_json(
        purpose="chat_advanced",
        system=_prompt_system(),
        user_prompt=prompt,
    )
    if not parsed or not isinstance(parsed.get("sections"), list):
        parsed = _default_plan(brief)
    return parsed


def generate_lesson_content(
    generation: AICourseGeneration, section_idx: int, lesson_idx: int
) -> dict:
    plan = generation.plan or {}
    sections = plan.get("sections") or []
    if not (0 <= section_idx < len(sections)):
        raise IndexError("Section hors bornes.")
    lessons = sections[section_idx].get("lessons") or []
    if not (0 <= lesson_idx < len(lessons)):
        raise IndexError("Leçon hors bornes.")
    lesson = lessons[lesson_idx]

    prompt = (
        "Rédige le contenu HTML d'une leçon e-learning. Réponds en JSON avec "
        "les clés : title, html (HTML propre avec h3/h4/p/ul/li/blockquote), "
        "key_points (array de 3-5 items), resources (array de {label, url}).\n\n"
        f"Contexte cours : {plan.get('title', '')}\n"
        f"Section : {sections[section_idx].get('title', '')}\n"
        f"Leçon : {lesson.get('title', '')}\n"
        f"Objectifs : {lesson.get('objectives', [])}\n"
        f"Durée cible : {lesson.get('duration_min', 15)} minutes"
    )
    parsed = _call_llm_json(
        purpose="chat_advanced",
        system=_prompt_system(),
        user_prompt=prompt,
    )
    if not parsed or "html" not in parsed:
        parsed = _default_lesson_content(
            generation.brief or {}, plan, section_idx, lesson_idx
        )
    return parsed


def generate_section_quiz(generation: AICourseGeneration, section_idx: int) -> dict:
    plan = generation.plan or {}
    sections = plan.get("sections") or []
    if not (0 <= section_idx < len(sections)):
        raise IndexError("Section hors bornes.")
    section = sections[section_idx]

    prompt = (
        "Génère un quiz de fin de section pour une formation e-learning. "
        "Réponds en JSON avec les clés : section_title, questions (array). "
        "Chaque question doit avoir : type (SINGLE|MULTIPLE|TRUE_FALSE|TEXT), "
        "prompt, choices (array), correct (array d'indices), explanation, "
        "difficulty (EASY|MEDIUM|HARD), score (int).\n\n"
        f"Contexte cours : {plan.get('title', '')}\n"
        f"Section : {section.get('title', '')}\n"
        f"Résumé : {section.get('summary', '')}\n"
        f"Leçons : {[l.get('title', '') for l in section.get('lessons', [])]}\n"
        "Produis 3 à 5 questions équilibrées en difficulté."
    )
    parsed = _call_llm_json(
        purpose="chat_advanced",
        system=_prompt_system(),
        user_prompt=prompt,
    )
    if not parsed or not isinstance(parsed.get("questions"), list):
        parsed = _default_section_quiz(plan, section_idx)
    return parsed


def recommend_certification(generation: AICourseGeneration) -> dict:
    brief = generation.brief or {}
    plan = generation.plan or {}
    prompt = (
        "Recommande le mode de certification adapté à cette formation. "
        "Réponds en JSON avec : recommended_mode (PARTICIPATION|"
        "COURSE_CERTIFICATE|CERTIFICATE), reasoning, score_min (0-100), "
        "issues_badge (bool).\n\n"
        f"Durée : {plan.get('duration_hours') or brief.get('duration_hours')}h\n"
        f"Niveau : {plan.get('level') or brief.get('level')}\n"
        f"Nombre de sections : {len(plan.get('sections') or [])}\n"
        f"Objectifs : {plan.get('objectives', [])}"
    )
    parsed = _call_llm_json(
        purpose="analysis",
        system=_prompt_system(),
        user_prompt=prompt,
    )
    if not parsed or "recommended_mode" not in parsed:
        parsed = _default_certification(brief, plan)
    return parsed


# ─────────────────────────────────────────────────────────────
# Finalisation → catalog.Course + CourseSection + Lesson
# ─────────────────────────────────────────────────────────────


def _slugify_unique(title: str, model) -> str:
    base = slugify(title)[:200] or "cours-ia"
    slug = base
    i = 1
    while model.objects.filter(slug=slug).exists():
        i += 1
        slug = f"{base}-{i}"
    return slug


def finalize_generation(generation: AICourseGeneration) -> int:
    """Crée un ``catalog.Course`` (+ sections + leçons) à partir de l'état.

    - N'utilise que ce qui est déjà stocké dans la génération.
    - Ne publie PAS le cours : status=DRAFT (validation humaine explicite
      requise avant publication, cf. cahier des charges).
    - Retourne l'ID du cours créé.
    """
    from catalog.models import Course, CourseSection, Lesson

    plan = generation.plan or {}
    lessons_content = (generation.lessons_content or {}).get("lessons") or {}
    brief = generation.brief or {}

    title = (plan.get("title") or brief.get("topic") or "Cours généré par IA").strip()
    subtitle = (plan.get("subtitle") or "").strip()[:220]
    description = (plan.get("description") or "").strip()
    level = (plan.get("level") or "BEGINNER").upper()
    language = (plan.get("language") or "fr").strip()[:10]

    with transaction.atomic():
        course = Course.objects.create(
            title=title[:200],
            slug=_slugify_unique(title, Course),
            subtitle=subtitle,
            description=description,
            instructor=generation.user,
            course_type=Course.CourseType.PROFESSIONNELLE,
            pricing_type=Course.PricingType.FREE,
            price=Decimal("0"),
            currency="XOF",
            status=Course.Status.DRAFT,
            level=level if level in ("BEGINNER", "INTERMEDIATE", "ADVANCED") else "BEGINNER",
            language=language,
        )

        for s_idx, section_data in enumerate(plan.get("sections") or []):
            section = CourseSection.objects.create(
                course=course,
                title=(section_data.get("title") or f"Section {s_idx + 1}")[:200],
                order=s_idx + 1,
            )
            for l_idx, lesson_meta in enumerate(section_data.get("lessons") or []):
                key = f"{s_idx}-{l_idx}"
                content = lessons_content.get(key) or {}
                Lesson.objects.create(
                    section=section,
                    title=(content.get("title") or lesson_meta.get("title") or f"Leçon {l_idx + 1}")[
                        :200
                    ],
                    order=l_idx + 1,
                    lesson_type=Lesson.LessonType.TEXT,
                    duration_sec=int((lesson_meta.get("duration_min") or 10)) * 60,
                    content=content.get("html") or "<p>Contenu à compléter.</p>",
                )

        generation.finalized_course_id = course.id
        generation.finalized_at = timezone.now()
        generation.status = AICourseGeneration.Status.FINALIZED
        generation.save(
            update_fields=[
                "finalized_course_id",
                "finalized_at",
                "status",
                "updated_at",
            ]
        )

        AIAuditLog.objects.create(
            user=generation.user,
            organization_id=generation.organization_id,
            kind=AIAuditLog.Kind.COURSE_GEN_FINALIZE,
            payload={
                "generation_id": generation.id,
                "course_id": course.id,
                "sections": CourseSection.objects.filter(course=course).count(),
                "lessons": Lesson.objects.filter(section__course=course).count(),
            },
        )

        return course.id
