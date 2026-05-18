"""Services applicatifs liés au compte utilisateur.

CORRECTIFS V3.A (audit FORMATIONS-22, AUDIT_MULTIROLE P2-2) :

Avant : ``_redirect_by_role`` était dupliqué dans
``formations/Rolemixin.py``, ``formations/views.py``, et
``compte/adapters.py`` avec des logiques divergentes. Aucune source unique.

Après : ``resolve_user_dashboard_url`` est l'unique fonction officielle.
Les autres modules doivent l'importer depuis ici.

Logique d'élection du dashboard par défaut :

1. Anonyme / désactivé → ``account_login``.
2. Admin plateforme (strict — pas is_staff) → ``admin_dashboard``.
3. Admin d'au moins une org active → ``business_dashboard``.
4. Instructeur (profile ou role org INSTRUCTOR) → ``instructor:dashboard``.
5. Sinon → ``learner:dashboard``.

La règle 2 utilise ``core.permissions.is_platform_admin`` (strict) ;
les règles 3-5 utilisent les helpers ``_has_active_org_role`` ci-dessous,
alignés sur ``catalog.services.get_user_organization_ids`` (filtre actif +
organization__is_active=True).
"""
from __future__ import annotations

from typing import Iterable, Optional

from django.contrib.auth import get_user_model

from core.permissions import is_platform_admin
from organizations.models import OrganizationMembership

User = get_user_model()


_ORG_ADMIN_ROLES = (
    OrganizationMembership.Role.OWNER,
    OrganizationMembership.Role.ADMIN,
)
_ORG_MANAGER_ROLES = (
    OrganizationMembership.Role.OWNER,
    OrganizationMembership.Role.ADMIN,
    OrganizationMembership.Role.MANAGER,
)
_ORG_INSTRUCTOR_ROLE = (OrganizationMembership.Role.INSTRUCTOR,)


def _has_active_org_role(user, roles: Iterable[str]) -> bool:
    if not user or not user.is_authenticated or not user.is_active:
        return False
    return user.organization_memberships.filter(
        is_active=True,
        organization__is_active=True,
        role__in=list(roles),
    ).exists()


def resolve_user_dashboard_url(user) -> str:
    """Retourne le **nom d'URL** (à passer à ``redirect``) du dashboard par
    défaut de l'utilisateur.

    Pas de redirection ici — caller libre de combiner avec un fallback.
    """
    if not user or not user.is_authenticated or not user.is_active:
        return "account_login"
    if is_platform_admin(user):
        return "admin_dashboard"
    if _has_active_org_role(user, _ORG_MANAGER_ROLES):
        return "business_dashboard"
    if getattr(user, "is_instructor", False) or _has_active_org_role(user, _ORG_INSTRUCTOR_ROLE):
        return "instructor:dashboard"
    return "learner:dashboard"


def resolve_user_dashboard_path(user, fallback: str = "/") -> str:
    """Helper qui retourne directement un *path* résolu (via reverse).

    Utile pour éviter les `NoReverseMatch` non gérés côté caller.
    """
    from django.urls import NoReverseMatch, reverse

    name = resolve_user_dashboard_url(user)
    try:
        return reverse(name)
    except NoReverseMatch:
        return fallback


# ---------------------------------------------------------------------------
# Compatibilité historique
# ---------------------------------------------------------------------------


class AccessService:
    """Conserve la surface d'AccessService originale pour ne pas casser les
    callers. La logique est alignée sur les helpers ci-dessus."""

    @staticmethod
    def can_access_platform_admin(user) -> bool:
        return is_platform_admin(user)

    @staticmethod
    def can_access_business_dashboard(user) -> bool:
        return _has_active_org_role(user, _ORG_ADMIN_ROLES)

    @staticmethod
    def can_access_instructor_dashboard(user) -> bool:
        return bool(
            user
            and user.is_authenticated
            and user.is_active
            and (
                getattr(user, "is_instructor", False)
                or _has_active_org_role(user, _ORG_INSTRUCTOR_ROLE)
            )
        )

    @staticmethod
    def can_access_learner_dashboard(user) -> bool:
        return bool(user and user.is_authenticated and user.is_active)

    @staticmethod
    def can_manage_organization_users(user, organization) -> bool:
        if not user or not user.is_authenticated:
            return False
        if is_platform_admin(user):
            return True
        return user.organization_memberships.filter(
            organization=organization,
            role__in=_ORG_ADMIN_ROLES,
            is_active=True,
            organization__is_active=True,
        ).exists()

    @staticmethod
    def can_create_org_instructor(user, organization) -> bool:
        return AccessService.can_manage_organization_users(user, organization)

    @staticmethod
    def can_create_org_learner(user, organization) -> bool:
        return AccessService.can_manage_organization_users(user, organization)


__all__ = [
    "resolve_user_dashboard_url",
    "resolve_user_dashboard_path",
    "AccessService",
]
