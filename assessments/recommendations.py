"""
assessments/recommendations.py — CORRECTIF P1.C (audit ASS-01, ASS-02, ASS-03).

ASS-01 (Critique, fuite de données) : la version précédente faisait
``qs = Course.objects.all()`` puis essayait ``hasattr(Course, 'is_published'/
'published'/'is_active')`` — aucun n'existe sur le modèle (le champ réel est
``status``). Conséquence : les recommandations exposaient des cours DRAFT,
ARCHIVED et company_only à TOUS les apprenants après l'onboarding.

ASS-02 (Performance) : la version précédente faisait jusqu'à 50 requêtes
icontains (2 colonnes × 25 keywords). On agrège en un seul filter avec un
``Q`` reduce.

ASS-03 : ``except Exception: pass`` masquait toute erreur réelle — supprimé.

Sécurité du filtrage : on délègue à ``catalog.services.get_visible_courses_qs``
qui garantit status=PUBLISHED + company_only=False (pour un appelant
anonyme/learner).
"""
from __future__ import annotations

import operator
from functools import reduce

from django.db.models import Q

from catalog.models import Course
from catalog.services import get_visible_courses_qs

TOPIC_KEYWORDS: dict[str, list[str]] = {
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


LEVEL_HINTS: dict[str, list[str]] = {
    "Débutant": ["débutant", "bases", "fondamentaux", "introduction"],
    "Intermédiaire": ["intermédiaire", "pratique", "stratégie"],
    "Avancé": ["avancé", "expert", "cas pratique", "analyse"],
}


def _build_keywords(profile: dict) -> list[str]:
    level = profile.get("level", "Débutant")
    focus = profile.get("focus", []) or []
    strengths = profile.get("strengths", []) or []
    topics = list(dict.fromkeys(focus + strengths))
    keywords: list[str] = []
    for t in topics:
        keywords += TOPIC_KEYWORDS.get(t, [])
    keywords += LEVEL_HINTS.get(level, [])
    return list(dict.fromkeys([k.lower() for k in keywords if k]))


def recommend_courses(profile: dict, limit: int = 4, user=None) -> list[Course]:
    """Suggère ``limit`` cours adaptés au profil d'onboarding ``profile``.

    Sécurité : ne retourne JAMAIS de cours non publiés ni de cours
    company_only auxquels ``user`` n'a pas accès. Si ``user`` n'est pas
    fourni, fallback sur la portée publique (anonyme).
    """
    qs = get_visible_courses_qs(user)

    keywords = _build_keywords(profile)
    matched_ids: list[int] = []

    if keywords:
        # CORRECTIF ASS-02 : on agrège en UN seul filter au lieu de 25+ icontains.
        title_q = reduce(operator.or_, (Q(title__icontains=k) for k in keywords))
        desc_q = reduce(operator.or_, (Q(description__icontains=k) for k in keywords))

        # 1) Priorité au match title.
        for cid in qs.filter(title_q).values_list("id", flat=True)[: limit * 3]:
            if cid not in matched_ids:
                matched_ids.append(cid)

        # 2) Compléter avec description si besoin.
        if len(matched_ids) < limit:
            for cid in qs.filter(desc_q).values_list("id", flat=True)[: limit * 3]:
                if cid not in matched_ids:
                    matched_ids.append(cid)

    # 3) Fallback récents (filtré par get_visible_courses_qs → toujours PUBLISHED).
    if len(matched_ids) < limit:
        for cid in qs.order_by("-published_at", "-id").values_list("id", flat=True)[: limit * 3]:
            if cid not in matched_ids:
                matched_ids.append(cid)

    matched_ids = matched_ids[:limit]
    if not matched_ids:
        return []
    by_id = {c.id: c for c in qs.filter(id__in=matched_ids)}
    return [by_id[i] for i in matched_ids if i in by_id]
