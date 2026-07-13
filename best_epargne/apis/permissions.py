"""Permissions DRF réutilisables pour l'API Best Épargne.

Architecture visée :
- User = identité + rôle plateforme éventuel
- OrganizationMembership = rôle dans une organisation
- LearnerProfile / InstructorProfile = rôle métier pédagogique

Cette couche de permissions :
- centralise les vérifications d'accès
- réduit le couplage au modèle exact
- renforce la sécurité côté API
"""

from __future__ import annotations

from collections.abc import Iterable

from rest_framework.permissions import SAFE_METHODS, BasePermission

from core.permissions import is_platform_admin
from organizations.models import OrganizationMembership


class PermissionUtils:
    """Helpers statiques partagés pour éviter la duplication."""

    ORG_ADMIN_ROLES = {
        OrganizationMembership.Role.OWNER,
        OrganizationMembership.Role.ADMIN,
    }

    ORG_MANAGER_ROLES = {
        OrganizationMembership.Role.OWNER,
        OrganizationMembership.Role.ADMIN,
        OrganizationMembership.Role.MANAGER,
    }

    ORG_TEACHING_ROLES = {
        OrganizationMembership.Role.INSTRUCTOR,
    }

    ORG_LEARNING_ROLES = {
        OrganizationMembership.Role.LEARNER,
    }

    @staticmethod
    def is_authenticated_and_active(user) -> bool:
        return bool(user and user.is_authenticated and user.is_active)

    @staticmethod
    def is_platform_admin(user) -> bool:
        return is_platform_admin(user)

    @staticmethod
    def has_active_membership(user) -> bool:
        if not PermissionUtils.is_authenticated_and_active(user):
            return False
        memberships = getattr(user, "organization_memberships", None)
        if memberships is None:
            return False
        return memberships.filter(is_active=True).exists()

    @staticmethod
    def has_org_role(
        user,
        roles: Iterable[str],
        organization=None,
        organization_id: int | None = None,
    ) -> bool:
        if not PermissionUtils.is_authenticated_and_active(user):
            return False

        if PermissionUtils.is_platform_admin(user):
            return True

        memberships = getattr(user, "organization_memberships", None)
        if memberships is None:
            return False

        qs = memberships.filter(is_active=True, role__in=list(roles))

        if organization is not None:
            qs = qs.filter(organization=organization)
        elif organization_id is not None:
            qs = qs.filter(organization_id=organization_id)

        return qs.exists()

    @staticmethod
    def extract_organization_from_view(view):
        """
        Tente de récupérer l'identifiant d'organisation depuis les kwargs usuels.
        """
        candidate_keys = (
            "organization_id",
            "org_id",
            "company_id",
            "pk_org",
        )
        for key in candidate_keys:
            value = view.kwargs.get(key)
            if value:
                return value
        return None

    @staticmethod
    def extract_organization_from_object(obj):
        """
        Tente de retrouver l'organisation liée à un objet.
        Compatible avec plusieurs conventions de nommage.
        """
        if obj is None:
            return None

        if hasattr(obj, "organization"):
            return obj.organization

        if hasattr(obj, "company"):
            return obj.company

        if hasattr(obj, "org"):
            return obj.org

        if hasattr(obj, "organization_id"):
            org_id = obj.organization_id
            if org_id:
                class _OrgStub:
                    def __init__(self, pk):
                        self.pk = pk

                return _OrgStub(org_id)

        if hasattr(obj, "company_id"):
            org_id = obj.company_id
            if org_id:
                class _OrgStub:
                    def __init__(self, pk):
                        self.pk = pk

                return _OrgStub(org_id)

        return None

    @staticmethod
    def user_owns_object(user, obj) -> bool:
        """
        Vérifie si l'utilisateur est propriétaire logique de l'objet.
        Champs testés par convention.
        """
        if not PermissionUtils.is_authenticated_and_active(user) or obj is None:
            return False

        candidate_fields = (
            "user",
            "owner",
            "created_by",
            "author",
            "instructor",
            "learner",
        )

        for field in candidate_fields:
            if hasattr(obj, field):
                value = getattr(obj, field)
                if value == user:
                    return True

        return False

    @staticmethod
    def is_instructor(user) -> bool:
        if not PermissionUtils.is_authenticated_and_active(user):
            return False

        if PermissionUtils.is_platform_admin(user):
            return True

        if bool(getattr(user, "is_instructor", False)):
            return True

        # Un OWNER / ADMIN / MANAGER d'organisation a, par construction,
        # le droit de produire du contenu pédagogique pour son
        # organisation (cours, sections, leçons, quiz). Sans cette
        # extension les vues ``InstructorQuiz*`` rejetaient les org
        # admins, ce qui les empêchait d'enrichir leurs cours internes.
        if PermissionUtils.has_org_role(
            user,
            PermissionUtils.ORG_MANAGER_ROLES,
        ):
            return True

        return PermissionUtils.has_org_role(
            user,
            PermissionUtils.ORG_TEACHING_ROLES,
        )

    @staticmethod
    def is_learner(user) -> bool:
        if not PermissionUtils.is_authenticated_and_active(user):
            return False

        if bool(getattr(user, "is_learner", False)):
            return True

        return PermissionUtils.has_org_role(
            user,
            PermissionUtils.ORG_LEARNING_ROLES,
        )

    @staticmethod
    def is_org_admin(user, organization=None, organization_id=None) -> bool:
        return PermissionUtils.has_org_role(
            user,
            PermissionUtils.ORG_ADMIN_ROLES,
            organization=organization,
            organization_id=organization_id,
        )

    @staticmethod
    def is_org_manager(user, organization=None, organization_id=None) -> bool:
        return PermissionUtils.has_org_role(
            user,
            PermissionUtils.ORG_MANAGER_ROLES,
            organization=organization,
            organization_id=organization_id,
        )


class BaseActivePermission(BasePermission):
    """Base commune : utilisateur authentifié + actif + e-mail vérifié.

    SECURITE-05 — cette classe est le point unique de vérité pour la
    vérification d'e-mail sur toute l'API métier (Instructor, Learner,
    Organization, Enrollments…). Les sous-classes qui override
    ``has_permission`` doivent penser à appeler ``super().has_permission``
    OU respecter la même règle en local.

    Les administrateurs plateforme (``is_platform_admin``) sont
    exemptés de la vérif e-mail (leur compte peut être créé via
    ``createsuperuser`` avant migration).

    Une sous-classe peut désactiver la vérif e-mail en positionnant
    ``require_email_verified = False`` (utile pour les vues d'onboarding
    qui doivent rester accessibles avant vérification).
    """

    require_email_verified: bool = True

    def is_valid_user(self, request) -> bool:
        user = request.user
        if not PermissionUtils.is_authenticated_and_active(user):
            return False
        if not self.require_email_verified:
            return True
        # Bypass pour les admins plateforme (compte technique historique).
        if PermissionUtils.is_platform_admin(user):
            return True
        return bool(getattr(user, "is_email_verified", True))

    def has_permission(self, request, view) -> bool:
        return self.is_valid_user(request)


class IsAuthenticatedAndActive(BaseActivePermission):
    """L'utilisateur doit être authentifié ET actif."""
    pass


class IsPlatformAdmin(BaseActivePermission):
    """Accès réservé aux admins plateforme."""

    # Les admins plateforme n'ont pas de contrainte de vérif e-mail
    # (createsuperuser).
    require_email_verified = False

    def has_permission(self, request, view) -> bool:
        return (
            self.is_valid_user(request)
            and PermissionUtils.is_platform_admin(request.user)
        )


class IsInstructor(BaseActivePermission):
    """Accès réservé aux formateurs et admins plateforme.

    SECURITE-05 — inclut la vérification d'e-mail via ``is_valid_user``.
    """

    def has_permission(self, request, view) -> bool:
        return (
            self.is_valid_user(request)
            and PermissionUtils.is_instructor(request.user)
        )


class IsLearner(BaseActivePermission):
    """Accès réservé aux apprenants."""

    def has_permission(self, request, view) -> bool:
        return (
            self.is_valid_user(request)
            and PermissionUtils.is_learner(request.user)
        )


class IsOrganizationMember(BaseActivePermission):
    """
    Vérifie que l'utilisateur appartient à l'organisation visée par la route.

    Attendu dans l'URL :
    - organization_id
    - org_id
    - company_id
    """

    def has_permission(self, request, view) -> bool:
        if not self.is_valid_user(request):
            return False

        if PermissionUtils.is_platform_admin(request.user):
            return True

        organization_id = PermissionUtils.extract_organization_from_view(view)
        if not organization_id:
            return False

        return request.user.organization_memberships.filter(
            organization_id=organization_id,
            is_active=True,
        ).exists()


class IsOrganizationAdmin(BaseActivePermission):
    """
    Vérifie que l'utilisateur est admin d'au moins une organisation,
    ou de l'organisation ciblée si l'URL en contient une.
    """

    def has_permission(self, request, view) -> bool:
        if not self.is_valid_user(request):
            return False

        if PermissionUtils.is_platform_admin(request.user):
            return True

        organization_id = PermissionUtils.extract_organization_from_view(view)
        if organization_id:
            return PermissionUtils.is_org_admin(
                request.user,
                organization_id=organization_id,
            )

        return PermissionUtils.is_org_admin(request.user)


class IsOrganizationManager(BaseActivePermission):
    """
    OWNER / ADMIN / MANAGER d'organisation.
    """

    def has_permission(self, request, view) -> bool:
        if not self.is_valid_user(request):
            return False

        if PermissionUtils.is_platform_admin(request.user):
            return True

        organization_id = PermissionUtils.extract_organization_from_view(view)
        if organization_id:
            return PermissionUtils.is_org_manager(
                request.user,
                organization_id=organization_id,
            )

        return PermissionUtils.is_org_manager(request.user)


class IsInstructorOwnerOrReadOnly(BasePermission):
    """
    Lecture autorisée.
    Écriture réservée à :
    - l'owner logique de l'objet
    - ou un admin plateforme
    """

    def has_permission(self, request, view) -> bool:
        if request.method in SAFE_METHODS:
            return True

        return PermissionUtils.is_authenticated_and_active(request.user)

    def has_object_permission(self, request, view, obj) -> bool:
        if request.method in SAFE_METHODS:
            return True

        user = request.user

        if PermissionUtils.is_platform_admin(user):
            return True

        if not PermissionUtils.is_instructor(user):
            return False

        return PermissionUtils.user_owns_object(user, obj)


class IsOwnerOrReadOnly(BasePermission):
    """
    Permission générique :
    - lecture autorisée
    - écriture réservée au propriétaire logique
    - admin plateforme autorisé
    """

    def has_permission(self, request, view) -> bool:
        if request.method in SAFE_METHODS:
            return True
        return PermissionUtils.is_authenticated_and_active(request.user)

    def has_object_permission(self, request, view, obj) -> bool:
        if request.method in SAFE_METHODS:
            return True

        user = request.user

        if PermissionUtils.is_platform_admin(user):
            return True

        return PermissionUtils.user_owns_object(user, obj)


class IsOrganizationAdminForObject(BasePermission):
    """
    Vérifie qu'un objet appartient à une organisation administrée par l'utilisateur.
    """

    def has_permission(self, request, view) -> bool:
        return PermissionUtils.is_authenticated_and_active(request.user)

    def has_object_permission(self, request, view, obj) -> bool:
        user = request.user

        if not PermissionUtils.is_authenticated_and_active(user):
            return False

        if PermissionUtils.is_platform_admin(user):
            return True

        organization = PermissionUtils.extract_organization_from_object(obj)
        if not organization:
            return False

        org_id = getattr(organization, "pk", None) or getattr(organization, "id", None)
        if not org_id:
            return False

        return PermissionUtils.is_org_admin(user, organization_id=org_id)


class IsOrganizationManagerForObject(BasePermission):
    """
    Vérifie qu'un objet appartient à une organisation managée par l'utilisateur.
    """

    def has_permission(self, request, view) -> bool:
        return PermissionUtils.is_authenticated_and_active(request.user)

    def has_object_permission(self, request, view, obj) -> bool:
        user = request.user

        if not PermissionUtils.is_authenticated_and_active(user):
            return False

        if PermissionUtils.is_platform_admin(user):
            return True

        organization = PermissionUtils.extract_organization_from_object(obj)
        if not organization:
            return False

        org_id = getattr(organization, "pk", None) or getattr(organization, "id", None)
        if not org_id:
            return False

        return PermissionUtils.is_org_manager(user, organization_id=org_id)


class IsInstructorOrOrgAdminOwner(BasePermission):
    """
    Lecture autorisée.
    Écriture autorisée si :
    - admin plateforme
    - propriétaire logique
    - admin de l'organisation liée à l'objet
    """

    def has_permission(self, request, view) -> bool:
        if request.method in SAFE_METHODS:
            return True
        return PermissionUtils.is_authenticated_and_active(request.user)

    def has_object_permission(self, request, view, obj) -> bool:
        if request.method in SAFE_METHODS:
            return True

        user = request.user

        if not PermissionUtils.is_authenticated_and_active(user):
            return False

        if PermissionUtils.is_platform_admin(user):
            return True

        if PermissionUtils.user_owns_object(user, obj):
            return True

        organization = PermissionUtils.extract_organization_from_object(obj)
        if organization:
            org_id = getattr(organization, "pk", None) or getattr(organization, "id", None)
            if org_id and PermissionUtils.is_org_admin(user, organization_id=org_id):
                return True

        return False


class IsSelfOrPlatformAdmin(BasePermission):
    """
    Accès à ses propres données utilisateur, ou admin plateforme.
    Compatible avec obj User ou obj lié à un user.
    """

    def has_permission(self, request, view) -> bool:
        return PermissionUtils.is_authenticated_and_active(request.user)

    def has_object_permission(self, request, view, obj) -> bool:
        user = request.user

        if PermissionUtils.is_platform_admin(user):
            return True

        if obj == user:
            return True

        linked_user = getattr(obj, "user", None)
        return linked_user == user


class IsSelfOrOrganizationAdmin(BasePermission):
    """
    Accès à soi-même, ou à un admin d'organisation si la cible est dans la même organisation.
    """

    def has_permission(self, request, view) -> bool:
        return PermissionUtils.is_authenticated_and_active(request.user)

    def has_object_permission(self, request, view, obj) -> bool:
        actor = request.user

        if PermissionUtils.is_platform_admin(actor):
            return True

        target_user = obj if hasattr(obj, "email") else getattr(obj, "user", None)
        if not target_user:
            return False

        if target_user == actor:
            return True

        target_memberships = getattr(target_user, "organization_memberships", None)
        if target_memberships is None:
            return False

        target_org_ids = list(
            target_memberships.filter(is_active=True).values_list("organization_id", flat=True)
        )
        if not target_org_ids:
            return False

        return actor.organization_memberships.filter(
            organization_id__in=target_org_ids,
            role__in=list(PermissionUtils.ORG_ADMIN_ROLES),
            is_active=True,
        ).exists()


class ReadOnly(BasePermission):
    """Permission lecture seule."""

    def has_permission(self, request, view) -> bool:
        return request.method in SAFE_METHODS


class DenyAll(BasePermission):
    """Interdit tout accès."""

    def has_permission(self, request, view) -> bool:
        return False

    def has_object_permission(self, request, view, obj) -> bool:
        return False
