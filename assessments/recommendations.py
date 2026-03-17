# assessments/recommendations.py
from __future__ import annotations

from typing import Dict, List

from catalog.models import Course


TOPIC_KEYWORDS: Dict[str, List[str]] = {
    "budget": ["budget", "dépense", "revenu", "planifier"],
    "epargne": ["épargne", "économiser", "mise de côté"],
    "epargne_securite": ["urgence", "fonds d'urgence", "sécurité"],
    "objectifs": ["objectif", "plan", "projet"],
    "taux": ["taux", "inflation", "intérêt"],
    "credit": ["crédit", "dette", "emprunt", "mensualité"],
    "risque": ["risque", "rendement"],
    "investissement": ["investir", "placement", "bourse"],
    "diversification": ["diversification", "portefeuille"],
    "patrimoine": ["patrimoine", "immobilier", "actifs"],
}


LEVEL_HINTS: Dict[str, List[str]] = {
    "Débutant": ["débutant", "bases", "fondamentaux", "introduction"],
    "Intermédiaire": ["intermédiaire", "pratique", "stratégie"],
    "Avancé": ["avancé", "expert", "cas pratique", "analyse"],
}


def recommend_courses(profile: Dict, limit: int = 4) -> List[Course]:
    level = profile.get("level", "Débutant")
    focus = profile.get("focus", []) or []
    strengths = profile.get("strengths", []) or []

    # priorité: focus, puis strengths (car intérêt)
    topics = list(dict.fromkeys(focus + strengths))

    qs = Course.objects.all()

    # si tu as un champ de publication, on tente sans casser
    for field in ("is_published", "published", "is_active"):
        if hasattr(Course, field):
            try:
                qs = qs.filter(**{field: True})
                break
            except Exception:
                pass

    # build keywords
    keywords = []
    for t in topics:
        keywords += TOPIC_KEYWORDS.get(t, [])
    keywords += LEVEL_HINTS.get(level, [])
    keywords = list(dict.fromkeys([k.lower() for k in keywords if k]))

    matched_ids: List[int] = []

    # 1) match titre
    for kw in keywords:
        for c in qs.filter(title__icontains=kw)[:30]:
            if c.id not in matched_ids:
                matched_ids.append(c.id)
            if len(matched_ids) >= limit:
                break
        if len(matched_ids) >= limit:
            break

    # 2) match description
    if len(matched_ids) < limit and hasattr(Course, "description"):
        for kw in keywords:
            for c in qs.filter(description__icontains=kw)[:30]:
                if c.id not in matched_ids:
                    matched_ids.append(c.id)
                if len(matched_ids) >= limit:
                    break
            if len(matched_ids) >= limit:
                break

    # 3) fallback: récents
    if len(matched_ids) < limit:
        for cid in qs.order_by("-id").values_list("id", flat=True)[:50]:
            if cid not in matched_ids:
                matched_ids.append(cid)
            if len(matched_ids) >= limit:
                break

    courses = list(Course.objects.filter(id__in=matched_ids))
    by_id = {c.id: c for c in courses}
    return [by_id[i] for i in matched_ids if i in by_id][:limit]