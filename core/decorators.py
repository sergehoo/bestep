"""core/decorators.py — Decorators de sécurité (V_FIN.C).

Helpers pour protéger les vues admin métier (dashboard plateforme,
gestion users plateforme, organizations admin plateforme). Couvre :

- ``@platform_admin_required`` : 403 sauf si ``is_platform_admin`` (strict).
- ``@platform_admin_otp_required`` : idem + exige une device OTP vérifiée.
- ``@org_admin_required`` : 403 sauf si OWNER/ADMIN d'au moins une org active.
- ``@org_admin_required_for_id`` : version paramétrée par ``organization_id``.

Tous logguent les tentatives refusées en WARNING avec ``request_id``.

Exemple :

    from core.decorators import platform_admin_required, platform_admin_otp_required

    @method_decorator(platform_admin_otp_required, name="dispatch")
    class PlatformAdminDashboard(TemplateView):
        ...
"""
from __future__ import annotations

import functools
import logging
from collections.abc import Callable

from django.core.exceptions import PermissionDenied
from django.http import HttpResponseRedirect
from django.urls import NoReverseMatch, reverse

from core.permissions import (
    can_manage_org,
    is_platform_admin,
)

logger = logging.getLogger(__name__)


def _redirect_to_login(request):
    """Helper : redirige vers le login (allauth ou two_factor selon settings)."""
    try:
        url = reverse("account_login")
    except NoReverseMatch:
        url = "/account/login/"
    next_url = request.get_full_path() if hasattr(request, "get_full_path") else "/"
    return HttpResponseRedirect(f"{url}?next={next_url}")


def platform_admin_required(view_func: Callable) -> Callable:
    """Exige ``core.permissions.is_platform_admin(user)`` (strict)."""
    @functools.wraps(view_func)
    def _wrapped(request, *args, **kwargs):
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return _redirect_to_login(request)
        if not is_platform_admin(user):
            logger.warning(
                "decorator.platform_admin_required.denied",
                extra={"user_id": user.id, "path": request.path},
            )
            raise PermissionDenied("Réservé aux administrateurs plateforme.")
        return view_func(request, *args, **kwargs)
    return _wrapped


def platform_admin_otp_required(view_func: Callable) -> Callable:
    """Idem + exige ``user.is_verified()`` (device OTP confirmée).

    Si django-otp n'est pas chargé/dispo, on retombe sur
    ``platform_admin_required`` seul (mode dégradé, loggué).
    """
    base = platform_admin_required(view_func)

    @functools.wraps(view_func)
    def _wrapped(request, *args, **kwargs):
        try:
            from django_otp import user_has_device
        except ImportError:
            logger.warning("decorator.otp_required.django_otp_missing")
            return base(request, *args, **kwargs)

        user = getattr(request, "user", None)
        if user and user.is_authenticated and is_platform_admin(user):
            # django-otp pose ``user.is_verified()`` via le middleware.
            is_verified = getattr(user, "is_verified", None)
            if callable(is_verified) and not is_verified():
                if user_has_device(user):
                    # L'user a un device → on l'envoie vers la page d'OTP.
                    try:
                        url = reverse("two_factor:login")
                    except NoReverseMatch:
                        url = "/account/two-factor/login/"
                    return HttpResponseRedirect(f"{url}?next={request.get_full_path()}")
                # Pas de device → on force la configuration.
                try:
                    url = reverse("two_factor:setup")
                except NoReverseMatch:
                    url = "/account/two-factor/setup/"
                return HttpResponseRedirect(url)
        return base(request, *args, **kwargs)
    return _wrapped


def org_admin_required(view_func: Callable) -> Callable:
    """Exige que l'user soit OWNER/ADMIN d'au moins une org active.

    Pour scoping fin par organization_id, utiliser
    ``org_admin_required_for_id`` à la place.
    """
    @functools.wraps(view_func)
    def _wrapped(request, *args, **kwargs):
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return _redirect_to_login(request)
        if is_platform_admin(user):
            return view_func(request, *args, **kwargs)
        from organizations.models import OrganizationMembership
        if not user.organization_memberships.filter(
            role__in=[
                OrganizationMembership.Role.OWNER,
                OrganizationMembership.Role.ADMIN,
            ],
            is_active=True,
            organization__is_active=True,
        ).exists():
            logger.warning(
                "decorator.org_admin_required.denied",
                extra={"user_id": user.id, "path": request.path},
            )
            raise PermissionDenied("Vous n'êtes administrateur d'aucune organisation active.")
        return view_func(request, *args, **kwargs)
    return _wrapped


def org_admin_required_for_id(kwarg_name: str = "organization_id") -> Callable:
    """Decorator factory : exige que l'user soit admin de l'org dont l'ID
    est passé en URL kwarg (``organization_id`` par défaut).

    Usage :

        @org_admin_required_for_id("organization_id")
        def my_view(request, organization_id):
            ...
    """
    def decorator(view_func):
        @functools.wraps(view_func)
        def _wrapped(request, *args, **kwargs):
            user = getattr(request, "user", None)
            if not user or not user.is_authenticated:
                return _redirect_to_login(request)

            org_id = kwargs.get(kwarg_name)
            if not org_id:
                raise PermissionDenied(f"Paramètre {kwarg_name} manquant.")

            from organizations.models import Organization
            try:
                org = Organization.objects.get(pk=org_id)
            except Organization.DoesNotExist as exc:
                raise PermissionDenied("Organisation introuvable.") from exc

            if not can_manage_org(user, org):
                logger.warning(
                    "decorator.org_admin_required_for_id.denied",
                    extra={"user_id": user.id, "org_id": org_id, "path": request.path},
                )
                raise PermissionDenied("Vous n'êtes pas administrateur de cette organisation.")
            return view_func(request, *args, **kwargs)
        return _wrapped
    return decorator


def instructor_required(view_func: Callable) -> Callable:
    """
    P3.2 — Exige que l'user soit formateur.

    Acceptable comme formateur :
      - User.is_instructor == True (a un InstructorProfile OU rôle INSTRUCTOR
        dans au moins une org active)
      - is_platform_admin (les admins ont accès à tout)

    Refus :
      - Anonymous → redirect login
      - User authentifié sans profil instructor → 403
    """
    @functools.wraps(view_func)
    def _wrapped(request, *args, **kwargs):
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return _redirect_to_login(request)
        if is_platform_admin(user):
            return view_func(request, *args, **kwargs)
        if not getattr(user, "is_instructor", False):
            logger.warning(
                "decorator.instructor_required.denied",
                extra={"user_id": user.id, "path": request.path},
            )
            raise PermissionDenied("Réservé aux formateurs.")
        return view_func(request, *args, **kwargs)
    return _wrapped


def learner_required(view_func: Callable) -> Callable:
    """
    P3.2 — Exige que l'user soit apprenant (ou rôle supérieur).

    Acceptable comme apprenant :
      - User.is_learner (a un LearnerProfile OU rôle LEARNER dans une org)
      - User authentifié quelconque (par défaut tout user est implicitement
        un apprenant — on ne bloque pas l'accès aux dashboards apprenant)
      - is_platform_admin

    Pourquoi si laxiste ? Le rôle apprenant est implicite à l'inscription —
    un utilisateur qui veut s'inscrire à un cours n'a pas besoin d'avoir
    un LearnerProfile explicite. Le décorateur sert surtout à exclure les
    utilisateurs anonymes (et à logguer les accès).
    """
    @functools.wraps(view_func)
    def _wrapped(request, *args, **kwargs):
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return _redirect_to_login(request)
        # Tout user authentifié actif peut accéder à l'espace apprenant.
        if not getattr(user, "is_active", False):
            logger.warning(
                "decorator.learner_required.inactive",
                extra={"user_id": user.id, "path": request.path},
            )
            raise PermissionDenied("Compte inactif.")
        return view_func(request, *args, **kwargs)
    return _wrapped


def org_role_required(*roles: str) -> Callable:
    """
    P3.2 — Decorator factory : exige UN des rôles passés en argument
    sur AU MOINS UNE organisation active.

    Usage :

        @org_role_required("OWNER", "ADMIN", "MANAGER")
        def my_view(request):
            ...

        # Équivalent à @org_admin_required + MANAGER
        @org_role_required("OWNER", "ADMIN")
        def admin_only(request):
            ...

    Pour scoping par ID d'org, utiliser ``org_admin_required_for_id``.
    Les admins plateforme passent toujours.
    """
    if not roles:
        raise ValueError("org_role_required requiert au moins un rôle.")

    def decorator(view_func: Callable) -> Callable:
        @functools.wraps(view_func)
        def _wrapped(request, *args, **kwargs):
            user = getattr(request, "user", None)
            if not user or not user.is_authenticated:
                return _redirect_to_login(request)
            if is_platform_admin(user):
                return view_func(request, *args, **kwargs)
            from organizations.models import OrganizationMembership
            qs = user.organization_memberships.filter(
                role__in=list(roles),
                is_active=True,
                organization__is_active=True,
            )
            if not qs.exists():
                logger.warning(
                    "decorator.org_role_required.denied",
                    extra={
                        "user_id": user.id,
                        "required_roles": list(roles),
                        "path": request.path,
                    },
                )
                raise PermissionDenied(
                    "Vous n'avez pas le rôle requis dans une organisation active."
                )
            return view_func(request, *args, **kwargs)
        return _wrapped
    return decorator
