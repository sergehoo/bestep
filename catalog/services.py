"""Services applicatifs catalog (cours et médias).

Ce module centralise les règles métier qui dépassent le simple CRUD :
- résolution de l'organisation par défaut d'un utilisateur,
- portée (queryset scoping) de la bibliothèque média selon le rôle,
- portée des cours visibles par un instructeur.

Les vues template ET les vues API doivent passer par ces services pour
éviter toute divergence de logique entre les deux.
"""
from __future__ import annotations

from typing import Iterable, Optional

from django.db.models import Q, QuerySet

from catalog.models import Course, MediaAsset
from organizations.models import Organization, OrganizationMembership


# --- Organisation par défaut ------------------------------------------------

# Rôles qui justifient un rattachement automatique d'un nouveau média
# à l'organisation. INSTRUCTOR / MANAGER / ADMIN / OWNER : oui. LEARNER :
# non (les médias d'un learner sont par défaut personnels).
_AUTO_ATTACH_ROLES = (
    OrganizationMembership.Role.OWNER,
    OrganizationMembership.Role.ADMIN,
    OrganizationMembership.Role.MANAGER,
    OrganizationMembership.Role.INSTRUCTOR,
)


def resolve_default_organization_for_user(user) -> Optional[Organization]:
    """Retourne l'organisation à laquelle rattacher un nouveau contenu créé
    par ``user``, ou ``None`` si la décision est ambiguë.

    Règles :
    1. ``user`` non authentifié → None.
    2. Le user a *exactement* une organisation active dont le rôle est
       INSTRUCTOR/MANAGER/ADMIN/OWNER → cette organisation.
    3. Plusieurs organisations possibles → None (on laisse l'UI demander).
    4. Aucune → None.

    Cette fonction n'écrit rien, elle se contente de lire.
    """
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
    """IDs des organisations actives auxquelles ``user`` appartient
    (n'importe quel rôle). Utilisé pour le scoping des querysets."""
    if not user or not user.is_authenticated:
        return []
    return list(
        user.organization_memberships
        .filter(is_active=True, organization__is_active=True)
        .values_list("organization_id", flat=True)
    )


# --- Bibliothèque média : portée de visibilité -----------------------------

def get_visible_media_qs(user, *, current_organization_id: Optional[int] = None) -> QuerySet:
    """Médias visibles par ``user``.

    Règles de visibilité (lecture) :
    - admin plateforme : tous les médias ;
    - sinon : médias dont il est ``owner``, OU médias rattachés à une org
      où il est membre actif (``MediaAsset.organization`` ∈ ses orgs).

    Si ``current_organization_id`` est fourni (espace org actif), on
    restreint à ``owner=user`` + ``organization=current_organization_id``.
    """
    qs = MediaAsset.objects.select_related("owner", "organization")

    if not user or not user.is_authenticated:
        return qs.none()

    if getattr(user, "is_platform_admin", False):
        if current_organization_id:
            return qs.filter(
                Q(owner=user) | Q(organization_id=current_organization_id)
            ).distinct()
        return qs

    org_ids = get_user_organization_ids(user)

    if current_organization_id:
        if current_organization_id not in org_ids:
            # L'user n'appartient pas à cette org → ne retourner que ses
            # médias personnels (ne pas leak l'existence des autres).
            return qs.filter(owner=user)
        return qs.filter(
            Q(owner=user) | Q(organization_id=current_organization_id)
        ).distinct()

    scope = Q(owner=user)
    if org_ids:
        scope |= Q(organization_id__in=org_ids)
    return qs.filter(scope).distinct()


def can_modify_media(user, asset: MediaAsset) -> bool:
    """Vrai si ``user`` peut modifier/supprimer ``asset``.

    Règles :
    - admin plateforme : oui ;
    - owner (auteur) : oui ;
    - admin de l'organisation à laquelle l'asset est rattaché : oui ;
    - sinon : non.
    """
    if not user or not user.is_authenticated or asset is None:
        return False
    if getattr(user, "is_platform_admin", False):
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
        ],
        is_active=True,
    ).exists()


# --- Cours : portée de visibilité instructeur ------------------------------

def get_instructor_courses_qs(
    user,
    *,
    current_organization_id: Optional[int] = None,
    organization_ids: Optional[Iterable[int]] = None,
) -> QuerySet:
    """Cours qu'un instructeur peut voir dans son espace.

    Règles :
    - admin plateforme : tous les cours ;
    - sinon : cours dont il est ``instructor`` OU cours dont
      ``Course.company`` est l'une de ses organisations actives.

    Si ``current_organization_id`` est fourni, on restreint au scope de
    cette organisation (cours dont ``company == current_organization_id``,
    plus ses propres cours s'il en a). Cela permet à l'espace org de
    n'afficher que ses cours.
    """
    qs = Course.objects.select_related("category", "instructor", "company")

    if not user or not user.is_authenticated:
        return qs.none()

    if getattr(user, "is_platform_admin", False):
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
