"""Policy layer métier centralisé.

Ce module est l'API publique à utiliser par les vues, serializers et services
pour les décisions d'autorisation. Les implémentations historiques restent dans
``core.permissions`` pour compatibilité, mais le code applicatif doit importer
depuis ce module afin d'éviter de recréer des règles inline.
"""
from __future__ import annotations

from organizations.models import OrganizationMembership

from .permissions import (
    can_access_media,
    can_edit_course,
    can_manage_org,
    can_modify_media,
    can_view_course,
    has_org_role,
    is_platform_admin,
)


def can_publish_course(user, course) -> bool:
    """Publication d'un cours.

    Pour l'instant, publier est équivalent à éditer. Cette fonction existe pour
    permettre un workflow enterprise ultérieur : review, approbation org,
    modération plateforme.
    """
    return can_edit_course(user, course)


def can_manage_platform(user) -> bool:
    """Alias métier explicite pour l'administration plateforme SaaS."""
    return is_platform_admin(user)


def can_create_org_course(user, organization) -> bool:
    """Création de cours dans un workspace organisation."""
    if organization is None:
        return False
    return has_org_role(
        user,
        organization_id=organization.id,
        roles=(
            OrganizationMembership.Role.OWNER,
            OrganizationMembership.Role.ADMIN,
            OrganizationMembership.Role.MANAGER,
            OrganizationMembership.Role.INSTRUCTOR,
        ),
    )


__all__ = [
    "can_access_media",
    "can_create_org_course",
    "can_edit_course",
    "can_manage_org",
    "can_manage_platform",
    "can_modify_media",
    "can_publish_course",
    "can_view_course",
    "has_org_role",
    "is_platform_admin",
]
