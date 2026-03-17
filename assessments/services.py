# assessments/services.py
from __future__ import annotations

from collections import defaultdict
from typing import Dict, List, Tuple

from assessments.models import AttemptAnswer


def level_from_score(score_percent: int) -> str:
    if score_percent < 40:
        return "Débutant"
    if score_percent < 70:
        return "Intermédiaire"
    return "Avancé"


def bucket_topic(score_ratio: float) -> str:
    # score_ratio: 0.0 à 1.0
    if score_ratio < 0.45:
        return "weak"
    if score_ratio < 0.75:
        return "ok"
    return "strong"


def build_profile(answers: List[AttemptAnswer], score_percent: int) -> Dict:
    """
    Retourne un JSON "profil" stable, exploitable pour recommandations.
    """
    per_topic = defaultdict(lambda: {"total": 0, "correct": 0})

    for a in answers:
        topic = getattr(a.question, "topic", "") or ""
        if not topic:
            continue
        per_topic[topic]["total"] += 1
        if a.selected_choice and getattr(a.selected_choice, "is_correct", False):
            per_topic[topic]["correct"] += 1

    topics = []
    for topic, d in per_topic.items():
        total = d["total"] or 1
        ratio = d["correct"] / total
        topics.append({
            "topic": topic,
            "total": d["total"],
            "correct": d["correct"],
            "ratio": round(ratio, 3),
            "bucket": bucket_topic(ratio),
        })

    # tri: forces d’abord, puis faiblesses
    strengths = [t["topic"] for t in sorted(topics, key=lambda x: x["ratio"], reverse=True) if t["bucket"] == "strong"]
    weaknesses = [t["topic"] for t in sorted(topics, key=lambda x: x["ratio"]) if t["bucket"] == "weak"]
    mids = [t["topic"] for t in sorted(topics, key=lambda x: x["ratio"], reverse=True) if t["bucket"] == "ok"]

    level = level_from_score(score_percent)

    profile = {
        "level": level,
        "score_percent": int(score_percent),
        "topics": topics,                 # détail par topic
        "strengths": strengths[:3],       # top 3
        "weaknesses": weaknesses[:3],     # top 3
        "focus": (weaknesses[:2] or mids[:2] or strengths[:2]),  # focus prioritaire
    }
    return profile


def smart_advice(profile: Dict) -> str:
    """
    Conseil court, actionnable.
    """
    level = profile.get("level", "—")
    focus = profile.get("focus", []) or []
    strengths = profile.get("strengths", []) or []

    if level == "Débutant":
        return (
            "Bravo 👏 Tu démarres bien. Mon conseil: consolide d’abord les bases, puis avance par petites étapes. "
            f"Priorité: {', '.join(focus) if focus else 'budget & épargne'}. "
            "Fais 20–30 min/jour et applique avec un mini-exercice (ex: suivi des dépenses sur 7 jours)."
        )

    if level == "Intermédiaire":
        return (
            "Très bien ✅ Tu as déjà de bonnes bases. Pour progresser vite: alterne théorie + pratique. "
            f"Travaille surtout: {', '.join(focus) if focus else 'diversification & crédit'}. "
            "Objectif: 1 module + 1 quiz + 1 cas pratique chaque semaine."
        )

    # Avancé
    return (
        "Excellent niveau 🔥 Tu peux aller sur des sujets avancés et des études de cas. "
        f"Tes points forts: {', '.join(strengths) if strengths else '—'}. "
        f"Pour te renforcer: {', '.join(focus) if focus else '—'}. "
        "Objectif: projets concrets + validation par quiz."
    )