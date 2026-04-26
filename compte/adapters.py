"""Adapters django-allauth pour Best Epargne.

Ce module centralise la logique de redirection après login / signup.

Architecture des rôles :
- ``User.platform_role`` : rôle plateforme (USER ou PLATFORM_ADMIN).
- ``OrganizationMembership.role`` : rôle au sein d'une organisation
  (OWNER, ADMIN, MANAGER, INSTRUCTOR, LEARNER).

Un utilisateur peut cumuler plusieurs appartenances (ex. INSTRUCTOR dans une
organisation ET LEARNER dans une autre). La redirection doit donc appliquer
une priorité stricte pour éviter les comportements ambigus :

    1. Admin plateforme          → admin_dashboard
    2. Org owner / admin         → business_dashboard
    3. Org manager               → business_dashboard
    4. Formateur (indé. ou org)  → instructor_dashboard
    5. Apprenant                 → learner_dashboard
                                   (avec onboarding si jamais complété)
"""

from __future__ import annotations

from allauth.account.adapter import DefaultAccountAdapter
from django.urls import NoReverseMatch, reverse

from compte.workspaces import (
    SESSION_KEY as WORKSPACE_SESSION_KEY,
    get_active_workspace,
    list_available_workspaces,
    resolve_workspace_url,
)
from organizations.models import OrganizationMembership


# Rôles org considérés comme "admin" au sens métier (accès business dashboard).
_ORG_ADMIN_ROLES = (
    OrganizationMembership.Role.OWNER,
    OrganizationMembership.Role.ADMIN,
)

# Rôles org donnant accès à la gestion (dashboard business étendu).
_ORG_MANAGER_ROLES = _ORG_ADMIN_ROLES + (OrganizationMembership.Role.MANAGER,)


def _safe_reverse(url_name: str, fallback: str = "/") -> str:
    """reverse() robuste : renvoie un fallback si l'URL n'existe pas."""
    try:
        return reverse(url_name)
    except NoReverseMatch:
        return fallback


def _has_active_org_role(user, roles) -> bool:
    """True si l'utilisateur possède au moins une appartenance active
    correspondant à l'un des rôles donnés.
    """
    if not user or not user.is_authenticated:
        return False
    memberships = getattr(user, "organization_memberships", None)
    if memberships is None:
        return False
    return memberships.filter(is_active=True, role__in=roles).exists()


def _has_completed_onboarding(user) -> bool:
    """True si l'apprenant a soumis au moins un quiz d'onboarding.

    Import local pour éviter les imports circulaires au démarrage (le module
    ``assessments`` dépend lui-même de ``compte`` via le User).
    """
    try:
        from assessments.models import Attempt
    except Exception:  # pragma: no cover - app absente / migrations partielles
        return True  # on ne bloque pas si l'app n'est pas dispo

    return Attempt.objects.filter(
        user=user,
        quiz__is_onboarding=True,
        submitted_at__isnull=False,
    ).exists()


def resolve_user_dashboard_url(user) -> str:
    """Retourne l'URL du dashboard le plus pertinent pour un utilisateur.

    Strictement ordonné : plateforme > org admin > org manager > instructor >
    learner. Ne suppose rien sur l'existence des URLs cibles (fallback safe).
    """
    if not user or not user.is_authenticated:
        return _safe_reverse("account_login", fallback="/accounts/login/")

    if getattr(user, "is_platform_admin", False):
        return _safe_reverse("admin_dashboard")

    if _has_active_org_role(user, _ORG_ADMIN_ROLES):
        return _safe_reverse("business_dashboard")

    if _has_active_org_role(user, (OrganizationMembership.Role.MANAGER,)):
        return _safe_reverse("business_dashboard")

    if getattr(user, "is_instructor", False):
        return _safe_reverse("instructor:dashboard")

    return _safe_reverse("learner:dashboard")


class AccountAdapter(DefaultAccountAdapter):
    """Adapter django-allauth customisé pour Best Epargne.

    - ``get_login_redirect_url`` : redirige vers le dashboard correspondant
      au rôle le plus élevé de l'utilisateur.
    - ``get_signup_redirect_url`` : idem, avec un détour par l'onboarding
      quiz si l'utilisateur nouvellement inscrit est un apprenant pur.
    """

    def get_login_redirect_url(self, request):
        """Redirection après connexion.

        Stratégie :
        1. Si la session contient un ``active_workspace`` toujours valide
           (l'user n'a pas perdu le rôle), on respecte ce choix — confort
           pour l'utilisateur multi-rôles qui revient.
        2. Sinon, on retombe sur le 1er espace pertinent dans
           ``list_available_workspaces`` (= la priorité historique).
        3. Sinon, fallback ``learner_dashboard`` puis "/".
        """
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return _safe_reverse("account_login", fallback="/accounts/login/")

        active = get_active_workspace(request)
        if active is not None:
            url = resolve_workspace_url(active, fallback="")
            if url:
                # On persiste l'espace actif (utile au tout premier login
                # quand la session ne contient encore rien).
                request.session[WORKSPACE_SESSION_KEY] = active.to_session()
                return url

        # Fallback historique (compatible avec les anciennes URLs/tests).
        return resolve_user_dashboard_url(user)

    def get_signup_redirect_url(self, request):
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return _safe_reverse("account_login", fallback="/accounts/login/")

        # Si l'utilisateur nouvellement inscrit a déjà un rôle élevé (parce
        # qu'un admin org lui a pré-créé un compte formateur/admin org par
        # ex.), on le redirige vers son dashboard métier.
        if getattr(user, "is_platform_admin", False):
            return _safe_reverse("admin_dashboard")

        if _has_active_org_role(user, _ORG_MANAGER_ROLES):
            return _safe_reverse("business_dashboard")

        if getattr(user, "is_instructor", False):
            return _safe_reverse("instructor:dashboard")

        # Apprenant : on force l'onboarding quiz s'il n'a pas encore été
        # complété. Le middleware OnboardingRequiredMiddleware assure de
        # toute façon le blocage, mais on évite un premier hop inutile.
        if not _has_completed_onboarding(user):
            onboarding_url = _safe_reverse(
                "assessments:onboarding_quiz",
                fallback="",
            )
            if onboarding_url:
                return onboarding_url

        return _safe_reverse("learner:dashboard")
