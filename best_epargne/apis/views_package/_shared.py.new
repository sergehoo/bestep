"""best_epargne/apis/views/_shared.py — Helpers partagés (V6.C migration concrète).

CORRECTIFS audit API-19, API-20, API-46, AUDIT_REPORT §5.2.

Avant : ``best_epargne/apis/views.py`` (3 238 lignes) embarquait ces
helpers, dupliqués à plusieurs endroits (`_range_to_days` × 3, blocs
d'import défensifs × 2).

Après : un seul fichier source pour les helpers transverses des vues API.
Tous les sous-modules `instructor.py`, `learner.py`, `media.py`,
`public.py`, `platform.py` doivent importer depuis ici.

Pour migrer : importer ``from best_epargne.apis.views_package._shared import ...``
puis supprimer les définitions locales correspondantes dans ``views.py``.

Le but est de pouvoir, à terme :

    # best_epargne/apis/__init__.py
    # ou views_package/__init__.py :
    from ._shared import *
    from .instructor import *
    from .learner import *
    from .media import *
    from .public import *
    from .platform import *

et faire pointer ``apis/views.py → apis/views_package`` via un rename.
"""
from __future__ import annotations

from datetime import timedelta
from typing import Iterable

from django.db.models import Q, QuerySet
from django.shortcuts import get_object_or_404
from django.utils import timezone

from catalog.models import Course
from organizations.models import OrganizationMembership

# Import direct (les apps sont chargées au démarrage Django, pas de risque
# d'import circulaire ici car _shared ne dépend de personne en aval).
from core.permissions import is_platform_admin


# ---------------------------------------------------------------------------
# Helpers temps / range
# ---------------------------------------------------------------------------


def _range_to_days(range_str: str | None) -> int:
    """Convertit un range littéral ('7d', '30d', '90d') en nombre de jours.

    CORRECTIF API-19 : helper unique au lieu de 3 définitions dupliquées
    aux lignes 244-246, 273-275 et 2003-2005 du legacy ``views.py``.

    Args:
        range_str: chaîne du genre "7d", "30d", "90d". Défaut 30 si invalide.

    Returns:
        Nombre de jours (entier, borné [1, 365]).
    """
    if not range_str:
        return 30
    try:
        days = int(str(range_str).rstrip("dD"))
    except (ValueError, TypeError):
        return 30
    return max(1, min(days, 365))


def _range_to_window(range_str: str | None) -> tuple:
    """Retourne (since, until) datetime correspondant au range."""
    days = _range_to_days(range_str)
    now = timezone.now()
    return now - timedelta(days=days), now


# ---------------------------------------------------------------------------
# Helpers scope cours (instructor / org admin)
# ---------------------------------------------------------------------------


_ORG_MANAGER_ROLES = (
    OrganizationMembership.Role.OWNER,
    OrganizationMembership.Role.ADMIN,
    OrganizationMembership.Role.MANAGER,
)


def _writable_courses_qs(user, *, organization_ids: Iterable[int] | None = None) -> QuerySet:
    """QuerySet des cours qu'un user peut MODIFIER (écriture).

    CORRECTIF API-09 : helper unique pour remplacer les ``Course.objects.
    filter(instructor=user)`` éparpillés qui bloquaient les admins org.

    Règles :
    - admin plateforme strict → tous les cours,
    - sinon : `instructor=user` OU `company_id IN ses_orgs_OWNER_ADMIN_MANAGER`.

    `organization_ids` permet de scoper à un sous-ensemble (ex. quand un
    admin org est dans un espace org spécifique).
    """
    if user is None or not user.is_authenticated:
        return Course.objects.none()

    qs = Course.objects.all()

    if is_platform_admin(user):
        return qs

    if organization_ids is None:
        organization_ids = list(
            user.organization_memberships.filter(
                role__in=_ORG_MANAGER_ROLES,
                is_active=True,
                organization__is_active=True,
            ).values_list("organization_id", flat=True)
        )
    else:
        organization_ids = list(organization_ids or [])

    scope = Q(instructor=user)
    if organization_ids:
        scope |= Q(company_id__in=organization_ids)
    return qs.filter(scope).distinct()


def _get_writable_course(course_id: int, user) -> Course:
    """Retourne le Course modifiable par user, ou 404.

    À utiliser dans TOUTES les vues d'écriture cours/section/leçon (cf.
    PATCHES.md §11 — remplace ``_course_owned`` qui filtrait strict
    `instructor=user`).
    """
    return get_object_or_404(_writable_courses_qs(user), pk=course_id)


# ---------------------------------------------------------------------------
# Sérialisation cours (extraite du legacy _course_to_dict)
# ---------------------------------------------------------------------------


def _course_to_dict(course: Course, *, request=None) -> dict:
    """Sérialise un Course en dict léger pour les endpoints custom.

    CORRECTIF API-46 / FORMATIONS-46 : helper extrait du legacy
    ``apis/views.py`` (couplage circulaire avec ``formations/views.py``).

    Si vous avez besoin d'un payload plus riche, utilisez plutôt
    ``CourseSerializer`` ou ``PublicCourseSerializer``.
    """
    thumbnail_url = None
    if getattr(course, "thumbnail", None):
        try:
            url = course.thumbnail.url
            thumbnail_url = request.build_absolute_uri(url) if request else url
        except (ValueError, AttributeError):
            thumbnail_url = None

    return {
        "id": course.id,
        "slug": course.slug,
        "title": course.title,
        "subtitle": getattr(course, "subtitle", "") or "",
        "status": course.status,
        "course_type": course.course_type,
        "pricing_type": course.pricing_type,
        "price": str(course.price) if course.price is not None else None,
        "currency": course.currency,
        "company_only": course.company_only,
        "company_id": course.company_id,
        "thumbnail_url": thumbnail_url,
        "published_at": course.published_at.isoformat() if course.published_at else None,
    }


# ---------------------------------------------------------------------------
# Helpers IDs orgs accessibles
# ---------------------------------------------------------------------------


def _user_admin_org_ids(user) -> list[int]:
    """IDs des orgs dont l'user est OWNER/ADMIN/MANAGER actif."""
    if not user or not user.is_authenticated:
        return []
    if is_platform_admin(user):
        from organizations.models import Organization
        return list(Organization.objects.filter(is_active=True).values_list("id", flat=True))
    return list(
        user.organization_memberships.filter(
            role__in=_ORG_MANAGER_ROLES,
            is_active=True,
            organization__is_active=True,
        ).values_list("organization_id", flat=True)
    )


__all__ = [
    "_range_to_days",
    "_range_to_window",
    "_writable_courses_qs",
    "_get_writable_course",
    "_course_to_dict",
    "_user_admin_org_ids",
]
