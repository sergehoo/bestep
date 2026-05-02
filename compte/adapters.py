"""Adapters django-allauth pour Best Epargne.

Ce module centralise la logique de redirection après login / signup.

Architecture des rôles :
- ``User.platform_role`` : rôle plateforme (USER ou PLATFORM_ADMIN).
- ``OrganizationMembership.role`` : rôle au sein d'une organisation
  (OWNER, ADMIN, MANAGER, INSTRUCTOR, LEARNER).

Un utilisateur peut cumuler plusieurs appartenances (ex. INSTRUCTOR dans une
organisation ET LEARNER dans une autre). La redirection doit donc appliquer
une priorité stricte pour éviter les comportements ambigus :

    1. Org owner / admin / manager → business_dashboard
    2. Admin plateforme            → admin_dashboard (vue dédiée)
    3. Formateur (indé. ou org)    → instructor:dashboard
    4. Apprenant                   → learner:dashboard
                                     (avec onboarding si jamais complété)

Notes importantes :

- L'org membership prime sur ``is_platform_admin``. Sinon un user qui
  est à la fois owner d'une organisation ET ``is_staff=True`` (ce qui
  active ``is_platform_admin`` côté modèle) atterrirait sur l'admin
  Django alors qu'il vient surtout pour piloter son organisation.

- ``admin_dashboard`` est une vue dédiée (cf. ``best_epargne.urls`` →
  ``PlatformAdminDashboard``). On NE redirige PLUS vers ``admin:index``
  pour le rôle plateforme : ``admin:index`` est réservé au staff
  technique (Django admin) et reste accessible depuis le dashboard
  plateforme via un raccourci.
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


def _is_pure_platform_admin_role(user) -> bool:
    """True si l'utilisateur a explicitement le rôle plateforme
    ``PLATFORM_ADMIN`` (ou est ``is_superuser``).

    On évite ``user.is_platform_admin`` qui matche aussi ``is_staff`` —
    un staff Django sans rôle métier plateforme n'a pas vocation à voir
    le dashboard métier ``admin_dashboard`` ; il a son admin technique.
    """
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    role_cls = getattr(user.__class__, "PlatformRole", None)
    if role_cls is None:
        return False
    return getattr(user, "platform_role", None) == role_cls.PLATFORM_ADMIN


def resolve_user_dashboard_url(user) -> str:
    """Retourne l'URL du dashboard le plus pertinent pour un utilisateur.

    Ordre (du plus métier au plus large) :
        org admin/manager > admin plateforme > instructor > learner.

    L'org membership prime volontairement sur ``is_platform_admin`` pour
    qu'un OWNER d'organisation qui est aussi ``is_staff`` n'atterrisse
    pas sur l'admin Django alors qu'il vient piloter son organisation.

    Ne suppose rien sur l'existence des URLs cibles (fallback safe).
    """
    if not user or not user.is_authenticated:
        return _safe_reverse("account_login", fallback="/account/login/")

    # 1. Rôle d'organisation (OWNER / ADMIN / MANAGER) — toujours prioritaire.
    if _has_active_org_role(user, _ORG_MANAGER_ROLES):
        return _safe_reverse("business_dashboard")

    # 2. Rôle plateforme (PLATFORM_ADMIN / superuser) → vue métier dédiée.
    #    ``admin:index`` n'est PAS la cible : il est réservé au staff
    #    technique. ``admin_dashboard`` existe désormais
    #    (cf. ``best_epargne.urls``).
    if _is_pure_platform_admin_role(user):
        return _safe_reverse("admin_dashboard")

    # 3. Formateur (profil ou rôle org INSTRUCTOR).
    if getattr(user, "is_instructor", False):
        return _safe_reverse("instructor:dashboard")

    # 4. Pur staff technique sans aucun rôle métier → admin Django.
    if user.is_staff:
        return _safe_reverse("admin:index")

    # 5. Apprenant (cas par défaut).
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
        0. Si l'utilisateur arrive avec un ``?next=`` sûr (URL relative,
           même host) — typiquement quand il a cliqué sur un lien protégé
           sans être logué — on respecte ce ``next``. C'est l'attente
           standard d'un utilisateur web.
        1. Si la session contient un ``active_workspace`` toujours valide
           (l'user n'a pas perdu le rôle), on respecte ce choix — confort
           pour l'utilisateur multi-rôles qui revient.
        2. Sinon, on retombe sur le 1er espace pertinent dans
           ``list_available_workspaces`` (= la priorité historique).
        3. Sinon, fallback dashboard métier puis "/".
        """
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return _safe_reverse("account_login", fallback="/account/login/")

        # 0. Honorer un éventuel ``?next=`` si — et seulement si — c'est
        # une URL relative qui pointe vers le même host. Un ``next``
        # vide / mal formé / externe est ignoré silencieusement.
        next_url = (
            request.POST.get("next")
            or request.GET.get("next")
            or ""
        ).strip()
        if next_url.startswith("/") and not next_url.startswith("//"):
            return next_url

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
            return _safe_reverse("account_login", fallback="/account/login/")

        # Si l'utilisateur nouvellement inscrit a déjà un rôle élevé (parce
        # qu'un admin org lui a pré-créé un compte formateur/admin org par
        # ex.), on le redirige vers son dashboard métier.
        # IMPORTANT : on garde la même priorité que le login — le rôle
        # d'organisation prime sur ``is_platform_admin`` pour ne jamais
        # router un org admin vers l'admin Django.
        if _has_active_org_role(user, _ORG_MANAGER_ROLES):
            return _safe_reverse("business_dashboard")

        if _is_pure_platform_admin_role(user):
            return _safe_reverse("admin_dashboard")

        if getattr(user, "is_instructor", False):
            return _safe_reverse("instructor:dashboard")

        # Pur staff technique → admin Django.
        if user.is_staff:
            return _safe_reverse("admin:index")

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
