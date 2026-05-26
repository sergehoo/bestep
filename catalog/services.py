"""Services applicatifs catalog (cours et médias).

CORRECTIF P1.C (CAT-01, ASS-01) : ajout de ``get_visible_courses_qs`` qui
centralise le filtrage status=PUBLISHED + company_only + scope org. C'est
LE point d'entrée à utiliser dans toutes les vues qui exposent un cours :

- CourseDetailView (catalog/views.py)
- recommend_courses (assessments/recommendations.py)
- pick_courses_for_topics (assessments/views.py)
- LearnerExploreCoursesView, LearnerCourseDetailView (best_epargne/apis/views.py)
- toute future vue API/template public

Le reste du module (resolve_default_organization_for_user, get_visible_media_qs,
can_modify_media, get_instructor_courses_qs) est conservé tel quel — il fait
déjà bien son travail.
"""
from __future__ import annotations

from typing import Iterable, Optional

from django.db.models import Q, QuerySet

from catalog.models import Course, MediaAsset
from core.permissions import is_platform_admin
from organizations.models import Organization, OrganizationMembership


# --- Organisation par défaut ------------------------------------------------

_AUTO_ATTACH_ROLES = (
    OrganizationMembership.Role.OWNER,
    OrganizationMembership.Role.ADMIN,
    OrganizationMembership.Role.MANAGER,
    OrganizationMembership.Role.INSTRUCTOR,
)


def resolve_default_organization_for_user(user) -> Optional[Organization]:
    if not user or not user.is_authenticated:
        return None
    memberships = (
        user.organization_memberships
        .filter(
            is_active=True,
            organization__is_active=True,
            role__in=_AUTO_ATTACH_ROLES,
        )
        .select_related("organization")
    )
    candidates = list(memberships[:2])
    if len(candidates) == 1:
        return candidates[0].organization
    return None


def get_user_organization_ids(user) -> list[int]:
    if not user or not user.is_authenticated:
        return []
    return list(
        user.organization_memberships
        .filter(is_active=True, organization__is_active=True)
        .values_list("organization_id", flat=True)
    )


# --- Cours : portée de visibilité publique / apprenant --------------------

def get_visible_courses_qs(
    user,
    *,
    public_only: bool = False,
    base_qs: Optional[QuerySet] = None,
) -> QuerySet:
    """Cours qu'un utilisateur a le droit de voir/lister/consulter.

    Cette fonction est l'UNIQUE source de vérité pour filtrer les cours
    exposés via templates publics ET via API.

    Règles :
    - Cours ``status=PUBLISHED`` obligatoire (jamais de DRAFT/REVIEW/ARCHIVED).
    - Si ``company_only=True`` : visible UNIQUEMENT par les membres actifs
      de ``Course.company`` (et par l'admin plateforme).
    - Sinon : visible publiquement.

    Args:
        user: ``request.user``, peut être anonyme.
        public_only: si True, ignore le scope org même pour un user
            authentifié (catalogue public strict). Utile pour
            ``CourseListView`` non-authentifiée.
        base_qs: queryset de base optionnel pour permettre d'enchaîner
            d'autres filtres en amont.

    Returns:
        QuerySet ``Course`` filtré.
    """
    qs = base_qs if base_qs is not None else Course.objects.all()
    qs = qs.filter(status=Course.Status.PUBLISHED)

    # Anonyme ou public_only : pas de company_only.
    if not user or not user.is_authenticated or public_only:
        return qs.filter(company_only=False)

    # Admin plateforme : voit tout (mais toujours filtré sur PUBLISHED ; pour
    # les DRAFT, passer par les vues admin/instructor dédiées qui ont leur
    # propre scope).
    if is_platform_admin(user):
        return qs

    org_ids = get_user_organization_ids(user)
    if not org_ids:
        return qs.filter(company_only=False)
    return qs.filter(
        Q(company_only=False) | Q(company_only=True, company_id__in=org_ids)
    )


# --- Bibliothèque média : portée de visibilité ----------------------------

def get_visible_media_qs(user, *, current_organization_id: Optional[int] = None) -> QuerySet:
    qs = MediaAsset.objects.select_related("owner", "organization")
    if not user or not user.is_authenticated:
        return qs.none()
    if is_platform_admin(user):
        if current_organization_id:
            return qs.filter(
                Q(owner=user) | Q(organization_id=current_organization_id)
            ).distinct()
        return qs
    org_ids = get_user_organization_ids(user)
    if current_organization_id:
        if current_organization_id not in org_ids:
            return qs.filter(owner=user)
        return qs.filter(
            Q(owner=user) | Q(organization_id=current_organization_id)
        ).distinct()
    scope = Q(owner=user)
    if org_ids:
        scope |= Q(organization_id__in=org_ids)
    return qs.filter(scope).distinct()


def can_modify_media(user, asset: MediaAsset) -> bool:
    if not user or not user.is_authenticated or asset is None:
        return False
    if is_platform_admin(user):
        return True
    if asset.owner_id == user.id:
        return True
    org_id = asset.organization_id
    if not org_id:
        return False
    return user.organization_memberships.filter(
        organization_id=org_id,
        role__in=[
            OrganizationMembership.Role.OWNER,
            OrganizationMembership.Role.ADMIN,
            OrganizationMembership.Role.MANAGER,  # CORRECTIF CAT-13 : MANAGER inclus
        ],
        is_active=True,
        organization__is_active=True,
    ).exists()


# --- Cours : portée de visibilité instructeur -----------------------------

def get_instructor_courses_qs(
    user,
    *,
    current_organization_id: Optional[int] = None,
    organization_ids: Optional[Iterable[int]] = None,
) -> QuerySet:
    qs = Course.objects.select_related("category", "instructor", "company")
    if not user or not user.is_authenticated:
        return qs.none()
    if is_platform_admin(user):
        if current_organization_id:
            return qs.filter(
                Q(instructor=user) | Q(company_id=current_organization_id)
            ).distinct()
        return qs
    if organization_ids is None:
        organization_ids = get_user_organization_ids(user)
    organization_ids = list(organization_ids or [])
    if current_organization_id:
        if current_organization_id not in organization_ids:
            return qs.filter(instructor=user)
        return qs.filter(
            Q(instructor=user) | Q(company_id=current_organization_id)
        ).distinct()
    scope = Q(instructor=user)
    if organization_ids:
        scope |= Q(company_id__in=organization_ids)
    return qs.filter(scope).distinct()
