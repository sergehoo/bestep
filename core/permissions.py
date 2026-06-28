"""
core/permissions.py — Permissions centralisées (NOUVEAU, fondation Phase 2).

Ce module est la source unique de vérité pour les questions du type :
``can_view_course(user, course)``, ``can_edit_course(user, course)``,
``can_manage_org(user, org)``, ``can_access_media(user, asset)``, etc.

Avant ce module, ces règles étaient dupliquées entre :
- ``best_epargne/apis/permissions.py`` (classes DRF),
- ``formations/Rolemixin.py`` (mixins template),
- ``compte/services.py`` (AccessService partiel et inutilisé),
- chaque vue/serializer qui réinventait le filtrage.

Convention :
- Les fonctions ``can_*`` retournent ``bool`` et n'effectuent JAMAIS d'écriture.
- Elles minimisent les requêtes (un ``.exists()`` au pire).
- Elles tolèrent les utilisateurs anonymes (retournent False).
- Pour les listes/querysets filtrés, on utilise plutôt
  ``catalog.services.get_visible_courses_qs`` et apparentés.

Les classes DRF de ``best_epargne/apis/permissions.py`` peuvent et devraient
s'appuyer sur ces helpers à terme.
"""
from __future__ import annotations

from django.contrib.auth import get_user_model

from organizations.models import OrganizationMembership

User = get_user_model()


# --- Helpers internes ------------------------------------------------------


_ORG_ADMIN_ROLES = (
    OrganizationMembership.Role.OWNER,
    OrganizationMembership.Role.ADMIN,
)
_ORG_MANAGER_ROLES = (
    OrganizationMembership.Role.OWNER,
    OrganizationMembership.Role.ADMIN,
    OrganizationMembership.Role.MANAGER,
)
_ORG_TEACHING_ROLES = (
    OrganizationMembership.Role.OWNER,
    OrganizationMembership.Role.ADMIN,
    OrganizationMembership.Role.MANAGER,
    OrganizationMembership.Role.INSTRUCTOR,
)


def _is_active(user) -> bool:
    return bool(user and user.is_authenticated and user.is_active)


def is_platform_admin(user) -> bool:
    """STRICT : True UNIQUEMENT si le user est un admin métier plateforme.

    Important : on n'inclut PAS ``is_staff`` ici (cf. audit COMPTE-02 / API-18).
    ``is_staff`` donne accès à l'admin Django, pas aux APIs métier
    privilégiées.
    """
    if not _is_active(user):
        return False
    return bool(
        getattr(user, "is_superuser", False)
        or getattr(user, "platform_role", None)
        == getattr(getattr(user, "PlatformRole", None), "PLATFORM_ADMIN", "PLATFORM_ADMIN")
    )


def has_org_role(user, *, organization_id: int, roles) -> bool:
    if not _is_active(user):
        return False
    if is_platform_admin(user):
        return True
    return user.organization_memberships.filter(
        organization_id=organization_id,
        role__in=list(roles),
        is_active=True,
        organization__is_active=True,
    ).exists()


def user_organization_ids(user, *, roles=None) -> list[int]:
    """IDs des organisations actives où le user a un rôle ∈ ``roles`` (ou tout
    rôle si ``roles`` est None)."""
    if not _is_active(user):
        return []
    qs = user.organization_memberships.filter(is_active=True, organization__is_active=True)
    if roles is not None:
        qs = qs.filter(role__in=list(roles))
    return list(qs.values_list("organization_id", flat=True))


# --- Cours -----------------------------------------------------------------


def can_view_course(user, course) -> bool:
    """Un utilisateur peut consulter ``course`` si :
    - il est admin plateforme,
    - OU le cours est PUBLISHED ET (non company_only OU il est membre de la company).
    """
    if course is None:
        return False
    if is_platform_admin(user):
        return True
    # Statut publié obligatoire pour la visibilité publique/learner.
    if getattr(course, "status", None) != course.Status.PUBLISHED:
        # Exceptions : auteur et admins org peuvent voir leur cours non publié.
        return can_edit_course(user, course)
    if not getattr(course, "company_only", False):
        return True
    # company_only=True : exiger un membership actif.
    company_id = getattr(course, "company_id", None)
    if not company_id:
        return False
    return has_org_role(user, organization_id=company_id, roles=[
        OrganizationMembership.Role.OWNER,
        OrganizationMembership.Role.ADMIN,
        OrganizationMembership.Role.MANAGER,
        OrganizationMembership.Role.INSTRUCTOR,
        OrganizationMembership.Role.LEARNER,
    ])


def can_edit_course(user, course) -> bool:
    """Un utilisateur peut modifier un cours si :
    - il est admin plateforme,
    - OU il est l'instructeur auteur,
    - OU il est OWNER/ADMIN/MANAGER de la company rattachée au cours.
    """
    if course is None or not _is_active(user):
        return False
    if is_platform_admin(user):
        return True
    if getattr(course, "instructor_id", None) == user.id:
        return True
    company_id = getattr(course, "company_id", None)
    if not company_id:
        return False
    return has_org_role(user, organization_id=company_id, roles=_ORG_MANAGER_ROLES)


# --- Organisations ---------------------------------------------------------


def can_manage_org(user, organization) -> bool:
    """OWNER ou ADMIN d'une org (ou admin plateforme) peut la gérer."""
    if organization is None or not _is_active(user):
        return False
    if is_platform_admin(user):
        return True
    return has_org_role(user, organization_id=organization.id, roles=_ORG_ADMIN_ROLES)


def can_invite_to_org(user, organization) -> bool:
    """Une invitation peut être créée par OWNER/ADMIN/MANAGER."""
    if organization is None or not _is_active(user):
        return False
    if is_platform_admin(user):
        return True
    return has_org_role(user, organization_id=organization.id, roles=_ORG_MANAGER_ROLES)


def can_view_org_content(user, organization) -> bool:
    """Tout membership actif voit le contenu de son org."""
    if organization is None or not _is_active(user):
        return False
    if is_platform_admin(user):
        return True
    return user.organization_memberships.filter(
        organization=organization,
        is_active=True,
        organization__is_active=True,
    ).exists()


# --- Médias ----------------------------------------------------------------


def can_access_media(user, asset) -> bool:
    """Lecture d'un asset : owner, admin plateforme, ou membre actif de la
    company rattachée à l'asset."""
    if asset is None or not _is_active(user):
        return False
    if is_platform_admin(user):
        return True
    if getattr(asset, "owner_id", None) == user.id:
        return True
    org_id = getattr(asset, "organization_id", None)
    if not org_id:
        return False
    return user.organization_memberships.filter(
        organization_id=org_id,
        is_active=True,
        organization__is_active=True,
    ).exists()


def can_modify_media(user, asset) -> bool:
    """Modification : owner, admin plateforme, ou OWNER/ADMIN/MANAGER de
    la company rattachée."""
    if asset is None or not _is_active(user):
        return False
    if is_platform_admin(user):
        return True
    if getattr(asset, "owner_id", None) == user.id:
        return True
    org_id = getattr(asset, "organization_id", None)
    if not org_id:
        return False
    return has_org_role(user, organization_id=org_id, roles=_ORG_MANAGER_ROLES)


# --- Plateforme ------------------------------------------------------------


def can_access_platform_admin(user) -> bool:
    """Accès aux dashboards d'administration plateforme métier (distinct
    de /admin/ Django)."""
    return is_platform_admin(user)


# --- Inscriptions ----------------------------------------------------------


def can_view_enrollment(user, enrollment) -> bool:
    if enrollment is None or not _is_active(user):
        return False
    if is_platform_admin(user):
        return True
    return enrollment.user_id == user.id


def can_modify_progress(user, lesson_progress) -> bool:
    """Un user ne peut modifier QUE sa propre progression."""
    if lesson_progress is None or not _is_active(user):
        return False
    return lesson_progress.enrollment.user_id == user.id


__all__ = [
    "is_platform_admin",
    "has_org_role",
    "user_organization_ids",
    "can_view_course",
    "can_edit_course",
    "can_manage_org",
    "can_invite_to_org",
    "can_view_org_content",
    "can_access_media",
    "can_modify_media",
    "can_access_platform_admin",
    "can_view_enrollment",
    "can_modify_progress",
]
