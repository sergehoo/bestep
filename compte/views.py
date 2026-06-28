"""Vues compte (HTTP).

CORRECTIFS P1.I (audit COMPTE-17) :
- ``next`` validé via ``url_has_allowed_host_and_scheme`` (anti open-redirect).
"""
from __future__ import annotations

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.contrib.auth.mixins import LoginRequiredMixin
from django.core.exceptions import PermissionDenied
from django.http import HttpResponseRedirect
from django.urls import reverse_lazy
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.decorators.http import require_POST
from django.views.generic import UpdateView

from compte.forms import UserProfileForm
from compte.workspaces import (
    WORKSPACE_INSTRUCTOR,
    WORKSPACE_LEARNER,
    WORKSPACE_ORG,
    WORKSPACE_PLATFORM_ADMIN,
    resolve_workspace_url,
    set_active_workspace,
)

_VALID_KINDS = {
    WORKSPACE_LEARNER,
    WORKSPACE_INSTRUCTOR,
    WORKSPACE_ORG,
    WORKSPACE_PLATFORM_ADMIN,
}


def _safe_next(request, raw_next: str) -> str | None:
    """CORRECTIF COMPTE-17 : valide une URL ``next`` contre l'host courant.

    Refuse :
    - URLs absolues vers un autre domaine,
    - URLs schemaless `//evil.com`,
    - chemins encodés malicieusement (`/\evil.com`, `/%2F%2Fevil`).
    """
    if not raw_next:
        return None
    if url_has_allowed_host_and_scheme(
        url=raw_next,
        allowed_hosts={request.get_host()},
        require_https=request.is_secure(),
    ):
        return raw_next
    return None


class UserProfileView(LoginRequiredMixin, UpdateView):
    """
    Page profil utilisateur unifiée avec onglets (P3.4).

    Sections (gérées via paramètre POST ``form_section`` ou URL distincts) :
      - ``info``        : nom, téléphone, e-mail (UserProfileForm)
      - ``avatar``      : upload photo de profil (AvatarUploadForm)
      - ``preferences`` : thème, langue, notifications (UserPreferencesForm)
      - ``password``    : redirection vers allauth /account/password/change/

    UX :
      - L'utilisateur reste sur la même page après chaque submit,
        l'onglet actif est préservé via ?tab=<section>.
      - Tous les messages flash apparaissent en haut de page.
    """

    form_class    = UserProfileForm
    template_name = "compte/profile.html"
    success_url   = reverse_lazy("compte:profile")

    # ─── Helpers ──────────────────────────────────────────────────

    def get_object(self, queryset=None):
        return self.request.user

    def _section(self) -> str:
        """Section actuellement éditée (depuis POST ou query ?tab)."""
        return (
            self.request.POST.get("form_section")
            or self.request.GET.get("tab")
            or "info"
        ).strip().lower()

    def _redirect_to_tab(self, tab: str):
        return HttpResponseRedirect(f"{self.success_url}?tab={tab}")

    # ─── GET ──────────────────────────────────────────────────────

    def get_context_data(self, **kwargs):
        from compte.forms import AvatarUploadForm, UserPreferencesForm
        from compte.models import UserPreferences

        ctx = super().get_context_data(**kwargs)
        user = self.request.user
        prefs = UserPreferences.get_or_create_for(user)

        # Onglet actif (depuis ?tab= ou défaut "info")
        tab = (self.request.GET.get("tab") or "info").strip().lower()
        if tab not in {"info", "avatar", "preferences", "security"}:
            tab = "info"

        ctx.update({
            "active_tab": tab,
            # Forms instanciés pour chaque onglet (sans bind si GET).
            "info_form": ctx.get("form") or UserProfileForm(instance=user),
            "avatar_form": AvatarUploadForm(instance=user),
            "preferences_form": UserPreferencesForm(instance=prefs),
            # URLs
            "password_change_url": "/account/password/change/",
            "two_factor_setup_url": "/account/two-factor/setup/",
            # Données affichées (badges rôles, etc.)
            "preferences": prefs,
        })
        return ctx

    # ─── POST dispatch par section ────────────────────────────────

    def post(self, request, *args, **kwargs):
        section = self._section()
        if section == "avatar":
            return self._post_avatar(request)
        if section == "preferences":
            return self._post_preferences(request)
        # Défaut = info
        return self._post_info(request)

    # ─── Handlers section ─────────────────────────────────────────

    def _post_info(self, request):
        form = UserProfileForm(request.POST, instance=request.user)
        if form.is_valid():
            form.save()
            messages.success(request, "Informations personnelles mises à jour.")
            return self._redirect_to_tab("info")
        # Erreur : on re-render avec le form bound pour afficher les erreurs.
        self.object = request.user
        ctx = self.get_context_data(form=form)
        ctx["active_tab"] = "info"
        ctx["info_form"] = form
        messages.error(request, "Veuillez corriger les erreurs ci-dessous.")
        return self.render_to_response(ctx)

    def _post_avatar(self, request):
        from compte.forms import AvatarUploadForm
        # Suppression explicite si la case "supprimer" est cochée.
        if request.POST.get("avatar_clear") == "1":
            user = request.user
            if user.avatar:
                user.avatar.delete(save=False)
                user.avatar = None
                user.save(update_fields=["avatar", "updated_at"])
                messages.success(request, "Photo de profil supprimée.")
            return self._redirect_to_tab("avatar")

        form = AvatarUploadForm(request.POST, request.FILES, instance=request.user)
        if form.is_valid():
            form.save()
            messages.success(request, "Photo de profil mise à jour.")
            return self._redirect_to_tab("avatar")

        self.object = request.user
        ctx = self.get_context_data()
        ctx["active_tab"] = "avatar"
        ctx["avatar_form"] = form
        messages.error(request, "Le fichier n'a pas pu être uploadé.")
        return self.render_to_response(ctx)

    def _post_preferences(self, request):
        from compte.forms import UserPreferencesForm
        from compte.models import UserPreferences

        prefs = UserPreferences.get_or_create_for(request.user)
        form = UserPreferencesForm(request.POST, instance=prefs)
        if form.is_valid():
            form.save()
            messages.success(request, "Préférences enregistrées.")
            return self._redirect_to_tab("preferences")

        self.object = request.user
        ctx = self.get_context_data()
        ctx["active_tab"] = "preferences"
        ctx["preferences_form"] = form
        messages.error(request, "Veuillez corriger les erreurs ci-dessous.")
        return self.render_to_response(ctx)


@login_required
@require_POST
def switch_workspace(request):
    """Bascule l'espace actif puis redirige vers son dashboard."""
    kind = (request.POST.get("kind") or "").strip()

    if kind not in _VALID_KINDS:
        messages.error(request, "Espace de travail inconnu.")
        return HttpResponseRedirect(_safe_next(request, request.META.get("HTTP_REFERER")) or "/")

    org_id_raw = request.POST.get("organization_id") or ""
    organization_id = None
    if kind == WORKSPACE_ORG:
        if not org_id_raw.isdigit():
            messages.error(request, "Aucune organisation sélectionnée pour cet espace.")
            return HttpResponseRedirect(_safe_next(request, request.META.get("HTTP_REFERER")) or "/")
        organization_id = int(org_id_raw)

    try:
        ws = set_active_workspace(request, kind=kind, organization_id=organization_id)
    except PermissionDenied:
        messages.error(request, "Vous n'avez pas accès à cet espace.")
        return HttpResponseRedirect(_safe_next(request, request.META.get("HTTP_REFERER")) or "/")

    messages.success(request, f"Espace actif : {ws.label}.")

    # CORRECTIF COMPTE-17 : ``next`` validé strictement.
    next_url = _safe_next(request, request.POST.get("next"))
    if next_url:
        return HttpResponseRedirect(next_url)

    return HttpResponseRedirect(resolve_workspace_url(ws, fallback="/"))
