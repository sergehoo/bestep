"""compte/permissions.py — Permissions DRF réutilisables par rôle.

Toutes ces permissions supposent ``IsAuthenticated`` en amont, mais
peuvent être utilisées seules (elles retournent False sans user).

Utilisation :

    class MonView(APIView):
        permission_classes = [IsAuthenticated, IsInstructor]

Ces classes sont volontairement légères et sans effet de bord :
elles ne journalisent pas, ne modifient rien, ne renvoient qu'un booléen.
La journalisation est déléguée à la couche métier (services / audit log).
"""
from __future__ import annotations

from rest_framework.permissions import BasePermission


def _authed(request) -> bool:
    return bool(request.user and request.user.is_authenticated)


class IsEmailVerified(BasePermission):
    """Bloque toute action tant que l'e-mail n'est pas vérifié.

    À utiliser après ``IsAuthenticated`` sur les endpoints métier (mais
    JAMAIS sur ``/api/auth/verify-email/`` ni ``/api/auth/resend-...``
    ni ``/api/auth/me/``).
    """
    message = "Adresse e-mail non vérifiée."

    def has_permission(self, request, view) -> bool:
        if not _authed(request):
            return False
        return bool(getattr(request.user, "is_email_verified", False))


class IsLearner(BasePermission):
    """Le user est un apprenant (a un LearnerProfile ou membership LEARNER)."""
    message = "Réservé aux apprenants."

    def has_permission(self, request, view) -> bool:
        return _authed(request) and bool(getattr(request.user, "is_learner", False))


class IsInstructor(BasePermission):
    """Le user est un formateur (a un InstructorProfile ou membership INSTRUCTOR)."""
    message = "Réservé aux formateurs."

    def has_permission(self, request, view) -> bool:
        return _authed(request) and bool(getattr(request.user, "is_instructor", False))


class IsApprovedInstructor(BasePermission):
    """Le formateur a été validé (``instructor_profile.is_verified``)."""
    message = "Compte formateur en attente d'approbation."

    def has_permission(self, request, view) -> bool:
        if not _authed(request):
            return False
        u = request.user
        prof = getattr(u, "instructor_profile", None)
        return bool(prof and getattr(prof, "is_verified", False))


class IsOrganizationAdmin(BasePermission):
    """Le user est administrateur (Owner/Admin) d'au moins une organisation."""
    message = "Réservé aux administrateurs d'organisation."

    def has_permission(self, request, view) -> bool:
        return _authed(request) and bool(getattr(request.user, "is_org_admin", False))


class IsPlatformAdmin(BasePermission):
    """Le user a ``is_platform_admin=True``."""
    message = "Réservé à l'administration plateforme."

    def has_permission(self, request, view) -> bool:
        return _authed(request) and bool(getattr(request.user, "is_platform_admin", False))


class IsOwnerOrPlatformAdmin(BasePermission):
    """Un user peut agir sur son propre objet, un admin plateforme sur tous.

    À utiliser conjointement avec ``has_object_permission``. L'objet
    doit exposer ``.user`` ou ``.owner`` ou ``.created_by``.
    """
    message = "Ressource non accessible."

    def has_permission(self, request, view) -> bool:
        return _authed(request)

    def has_object_permission(self, request, view, obj) -> bool:
        if not _authed(request):
            return False
        if getattr(request.user, "is_platform_admin", False):
            return True
        for attr in ("user", "owner", "created_by"):
            related = getattr(obj, attr, None)
            if related is not None and related == request.user:
                return True
        return False
