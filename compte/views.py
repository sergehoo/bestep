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
    """Page de profil utilisateur — accessible depuis tous les espaces."""
    form_class    = UserProfileForm
    template_name = "compte/profile.html"
    success_url   = reverse_lazy("compte:profile")

    def get_object(self, queryset=None):
        return self.request.user

    def form_valid(self, form):
        messages.success(self.request, "Votre profil a été mis à jour.")
        return super().form_valid(form)

    def form_invalid(self, form):
        messages.error(self.request, "Veuillez corriger les erreurs ci-dessous.")
        return super().form_invalid(form)

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["password_change_url"] = "/account/password/change/"
        return ctx


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
