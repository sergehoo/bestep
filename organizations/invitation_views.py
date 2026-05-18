"""organizations/invitation_views.py — Vues HTTP pour le workflow invitation.

CORRECTIF V2.B (audit ORG-02).

- ``GET /organisation/invitations/accept/<token>/`` : si l'user est anonyme,
  redirige vers la page de login (avec ``next`` pointant ici). Sinon, affiche
  une page de confirmation.
- ``POST /organisation/invitations/accept/<token>/`` : consomme le token via
  ``OrganizationMemberService.accept_invitation`` puis redirige vers le
  dashboard org correspondant.

Pas d'IDOR : le service compare ``request.user.email`` à l'invitation et
refuse les emails non-correspondants.
"""
from __future__ import annotations

import logging

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.core.exceptions import PermissionDenied, ValidationError
from django.shortcuts import redirect, render
from django.urls import reverse
from django.views.decorators.http import require_http_methods

from organizations.services import OrganizationMemberManagementService

logger = logging.getLogger(__name__)


@login_required
@require_http_methods(["GET", "POST"])
def accept_invitation(request, token):
    """Vue d'acceptation d'une invitation org via token."""
    if request.method == "GET":
        # On résout l'invitation pour la prévisualiser (sans la consommer).
        from organizations.models import OrganizationInvitation
        invitation = (
            OrganizationInvitation.objects.select_related("organization", "invited_by")
            .filter(token=token)
            .first()
        )
        if invitation is None:
            messages.error(request, "Invitation introuvable.")
            return redirect("home")
        return render(
            request,
            "organization/invitation_accept.html",
            {"invitation": invitation},
        )

    # POST → consommation.
    try:
        membership = OrganizationMemberManagementService.accept_invitation(
            user=request.user, token=token
        )
    except PermissionDenied as exc:
        messages.error(request, str(exc) or "Accès refusé.")
        return redirect("home")
    except ValidationError as exc:
        msgs = exc.messages if hasattr(exc, "messages") else [str(exc)]
        for m in msgs:
            messages.error(request, m)
        return redirect("home")
    except Exception as exc:  # noqa: BLE001
        logger.exception("invitation.accept.unexpected", extra={"token": str(token)})
        messages.error(request, "Une erreur inattendue est survenue.")
        return redirect("home")

    messages.success(
        request,
        f"Bienvenue dans {membership.organization.name} ({membership.get_role_display()}).",
    )
    try:
        url = reverse("org:dashboard", kwargs={"organization_id": membership.organization_id})
    except Exception:  # pragma: no cover
        url = "/"
    return redirect(url)
