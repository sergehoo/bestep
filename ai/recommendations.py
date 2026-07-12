"""ai.recommendations — Moteur de recommandations apprenants (Phase 3).

Logique 100% locale (sans LLM) pour rester rapide et déterministe.
Combine :
  - profil onboarding (topics, niveau, langue)
  - inscriptions (progression, résultats, abandons)
  - popularité globale des cours
  - feedback historique sur les recos

Résultats groupés par catégorie (for_you, continue, strengthen, etc.).
Persistés en `AIRecommendation` avec `unique_together` (user, course,
category) pour permettre le feedback et éviter les doublons.
"""
from __future__ import annotations

from typing import Dict, List, Optional, Set

from django.db.models import Count, Q

from .models import AIRecommendation


# ─────────────────────────────────────────────────────────────
# Profils utilisateur
# ─────────────────────────────────────────────────────────────


def _learner_profile(user) -> dict:
    """Compile le profil apprenant à partir de LearnerKYC + enrollments."""
    profile = {
        "topics": [],
        "level": "BEGINNER",
        "language": "fr",
        "completed_ids": set(),
        "active_ids": set(),
        "dropped_ids": set(),
    }
    # LearnerKYC
    try:
        kyc = getattr(user, "learner_kyc", None) or None
        if kyc is None:
            from compte.models import LearnerKYC
            kyc = LearnerKYC.objects.filter(user=user).first()
        if kyc:
            profile["level"] = (
                getattr(kyc, "onboarding_level", "").upper() or "BEGINNER"
            )
            onb = getattr(kyc, "onboarding_profile", {}) or {}
            topics = onb.get("topics") or []
            if isinstance(topics, list):
                profile["topics"] = [str(t).strip().lower() for t in topics if t]
            profile["language"] = (onb.get("language") or "fr").lower()
    except Exception:
        pass
    # Enrollments
    try:
        from enrollments.models import Enrollment

        for e in Enrollment.objects.filter(user=user).select_related("course"):
            course_id = getattr(e, "course_id", None) or (
                e.course.id if getattr(e, "course", None) else None
            )
            if not course_id:
                continue
            status = getattr(e, "status", "") or ""
            if status == "COMPLETED":
                profile["completed_ids"].add(course_id)
            elif status in ("DROPPED", "CANCELLED"):
                profile["dropped_ids"].add(course_id)
            else:
                profile["active_ids"].add(course_id)
    except Exception:
        pass
    return profile


def _refused_course_ids(user) -> Set[int]:
    return set(
        AIRecommendation.objects.filter(
            user=user,
            feedback__in=(
                AIRecommendation.Feedback.NOT_INTERESTED,
                AIRecommendation.Feedback.ALREADY_KNOWN,
            ),
        ).values_list("course_id", flat=True)
    )


# ─────────────────────────────────────────────────────────────
# Ranking helpers
# ─────────────────────────────────────────────────────────────


def _score_course(course, profile: dict) -> tuple[int, str]:
    """Retourne (match_score, reason) pour un cours donné."""
    score = 40
    reasons: List[str] = []

    # Niveau
    level = (getattr(course, "level", None) or "").upper()
    if level == profile["level"]:
        score += 25
        reasons.append(f"niveau {level.lower()} correspondant")

    # Langue
    lang = (getattr(course, "language", "") or "").lower()
    if lang and profile.get("language") and lang == profile["language"]:
        score += 10

    # Topics — matching naïf sur titre + description
    haystack = (
        (getattr(course, "title", "") or "")
        + " "
        + (getattr(course, "description", "") or "")
    ).lower()
    topic_hits = 0
    for topic in profile["topics"]:
        if topic and topic in haystack:
            topic_hits += 1
    if topic_hits:
        score += min(30, topic_hits * 10)
        reasons.append(f"{topic_hits} thème(s) qui vous intéresse(nt)")

    # Populaire ?
    enrolled = getattr(course, "_enrolled_count", 0) or 0
    if enrolled >= 50:
        score += 10
        reasons.append("populaire sur la plateforme")

    reason = " · ".join(reasons) or "sélection éditoriale"
    return min(100, score), reason[:280]


def _base_queryset():
    """Cours publiés + comptage inscriptions (annotation)."""
    from catalog.models import Course

    return (
        Course.objects.filter(status=Course.Status.PUBLISHED)
        .annotate(_enrolled_count=Count("enrollments"))
    )


# ─────────────────────────────────────────────────────────────
# Génération par catégorie
# ─────────────────────────────────────────────────────────────


def _pick(
    queryset,
    profile: dict,
    exclude_ids: Set[int],
    limit: int,
) -> List[dict]:
    picks: List[dict] = []
    for course in queryset:
        if course.id in exclude_ids:
            continue
        score, reason = _score_course(course, profile)
        picks.append(
            {
                "course_id": course.id,
                "match_score": score,
                "reason": reason,
                "title": course.title,
                "level": getattr(course, "level", None),
                "language": getattr(course, "language", None),
                "duration_sec": getattr(course, "duration_sec", 0),
            }
        )
    picks.sort(key=lambda p: (-p["match_score"], p["course_id"]))
    return picks[:limit]


def generate_recommendations(user, per_category: int = 6) -> Dict[str, List[dict]]:
    """Calcule les recommandations groupées par catégorie et les persiste.

    Retourne un dict ``{category: [reco_dict...]}`` prêt pour le front.
    """
    profile = _learner_profile(user)
    refused = _refused_course_ids(user)
    already_enrolled = profile["completed_ids"] | profile["active_ids"]

    base = _base_queryset()
    exclude_base = refused | already_enrolled

    out: Dict[str, List[dict]] = {}

    # ── for_you : matching topics + niveau
    for_you = _pick(base.order_by("-created_at")[:80], profile, exclude_base, per_category)
    out[AIRecommendation.Category.FOR_YOU] = for_you

    # ── continue : cours en cours (active) — ordonnés par proximité
    if profile["active_ids"]:
        active_qs = list(base.filter(id__in=profile["active_ids"]))
        out[AIRecommendation.Category.CONTINUE] = _pick(
            active_qs, profile, refused, per_category
        )
    else:
        out[AIRecommendation.Category.CONTINUE] = []

    # ── strengthen : cours du même niveau NON encore inscrits
    strengthen_qs = base.filter(level=profile["level"]).order_by("-created_at")[:60]
    out[AIRecommendation.Category.STRENGTHEN] = _pick(
        strengthen_qs, profile, exclude_base, per_category
    )

    # ── discover : niveau > actuel (marches supérieures)
    next_level = {"BEGINNER": "INTERMEDIATE", "INTERMEDIATE": "ADVANCED"}.get(
        profile["level"], "ADVANCED"
    )
    discover_qs = base.filter(level=next_level).order_by("-created_at")[:60]
    out[AIRecommendation.Category.DISCOVER] = _pick(
        discover_qs, profile, exclude_base, per_category
    )

    # ── popular : tri par nombre d'inscriptions
    popular_qs = base.order_by("-_enrolled_count", "-created_at")[:40]
    out[AIRecommendation.Category.POPULAR] = _pick(
        popular_qs, profile, exclude_base, per_category
    )

    # ── certifying : course_type certifiante
    certifying_qs = base.filter(course_type="CERTIFIANTE").order_by("-created_at")[:40]
    out[AIRecommendation.Category.CERTIFYING] = _pick(
        certifying_qs, profile, exclude_base, per_category
    )

    # ── short : Q sur duration_sec approximatif (annotation via aggregations
    # non triviale ici ; on filtre par sections < 5 pour rester rapide).
    from django.db.models import Count as _Count

    short_qs = (
        base.annotate(_sections=_Count("sections"))
        .filter(_sections__lte=5)
        .order_by("-created_at")[:40]
    )
    out[AIRecommendation.Category.SHORT] = _pick(
        short_qs, profile, exclude_base, per_category
    )

    # ── Persist / upsert
    for category, items in out.items():
        for r in items:
            AIRecommendation.objects.update_or_create(
                user=user,
                course_id=r["course_id"],
                category=category,
                defaults={
                    "reason": r["reason"],
                    "match_score": r["match_score"],
                },
            )
    return out


def submit_feedback(
    *,
    user,
    course_id: int,
    feedback: str,
    category: Optional[str] = None,
) -> int:
    """Applique un feedback. Retourne le nb de lignes mises à jour."""
    if feedback not in dict(AIRecommendation.Feedback.choices):
        raise ValueError(f"Feedback inconnu : {feedback!r}")

    from django.utils import timezone

    qs = AIRecommendation.objects.filter(user=user, course_id=course_id)
    if category:
        qs = qs.filter(category=category)
    updated = qs.update(feedback=feedback, feedback_at=timezone.now())

    # Si aucune reco pré-existante, on en crée une pour tracer le retour.
    if updated == 0:
        AIRecommendation.objects.create(
            user=user,
            course_id=course_id,
            category=category or AIRecommendation.Category.FOR_YOU,
            feedback=feedback,
            feedback_at=timezone.now(),
            reason="Feedback direct utilisateur.",
        )
        updated = 1
    return updated
