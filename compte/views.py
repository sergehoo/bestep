"""Vues compte (HTTP).

Pour l'instant ce module contient uniquement la vue ``switch_workspace``
qui assure la bascule entre les espaces (Learner / Instructor / Org X /
Org Y / Platform admin) pour les utilisateurs multi-rôles.

La vue est exclusivement POST — un GET déclencherait un risque CSRF
trivialement exploitable via un lien bookmarké, et un POST nous force à
faire passer le token CSRF.
"""
from __future__ import annotations

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.core.exceptions import PermissionDenied
from django.http import HttpResponseBadRequest, HttpResponseRedirect
from django.urls import reverse
from django.views.decorators.http import require_POST

from compte.workspaces import (
    WORKSPACE_LEARNER,
    WORKSPACE_INSTRUCTOR,
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


@login_required
@require_POST
def switch_workspace(request):
    """Bascule l'espace actif puis redirige vers son dashboard.

    Paramètres POST :
    - ``kind`` (requis) : "learner" / "instructor" / "org" / "platform_admin".
    - ``organization_id`` (requis si kind == "org") : id de l'organisation.
    - ``next`` (optionnel) : URL relative de retour. Si fournie ET sûre,
      on redirige là plutôt que vers le dashboard de l'espace.
    """
    kind = (request.POST.get("kind") or "").strip()
    if kind not in _VALID_KINDS:
        return HttpResponseBadRequest("Invalid workspace kind.")

    org_id_raw = request.POST.get("organization_id") or ""
    organization_id = None
    if kind == WORKSPACE_ORG:
        if not org_id_raw.isdigit():
            return HttpResponseBadRequest("organization_id required for org workspace.")
        organization_id = int(org_id_raw)

    try:
        ws = set_active_workspace(request, kind=kind, organization_id=organization_id)
    except PermissionDenied:
        # On ne révèle pas la raison exacte (l'org peut exister mais sans
        # membership actif côté user).
        messages.error(request, "Vous n'avez pas accès à cet espace.")
        return HttpResponseRedirect(request.META.get("HTTP_REFERER") or "/")

    # Redirection : ``next`` si fourni et plausible (même host), sinon le
    # dashboard de l'espace.
    next_url = (request.POST.get("next") or "").strip()
    if next_url.startswith("/") and not next_url.startswith("//"):
        return HttpResponseRedirect(next_url)

    return HttpResponseRedirect(resolve_workspace_url(ws, fallback="/"))
