"""
formations/instructor_lifecycle_views.py — P1.3 : vues template POST pour
les transitions de cycle de vie d'un cours côté instructor.

Pourquoi un module séparé ?
  - Les vues API DRF (best_epargne/apis/views.py) sont JSON-only et
    consomment du DRF auth/throttling.
  - Les forms HTML CSRF de l'UI instructor ont besoin de vues classiques
    Django qui :
      * acceptent un POST avec ``{% csrf_token %}``,
      * appellent ``catalog.lifecycle.*`` (même source de vérité),
      * ajoutent un message flash via ``django.contrib.messages``,
      * redirigent vers la page détail.
  - Ce module reste mince (≈ 30 lignes par action) — la logique métier
    est dans ``catalog/lifecycle.py``.

Toutes les vues sont protégées par :
  - ``LoginRequiredMixin`` (auth obligatoire)
  - ``require_POST`` (refuse GET pour ces actions side-effectful)
  - les permissions internes du service (PermissionDenied → 403)
"""
from __future__ import annotations

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.core.exceptions import PermissionDenied, ValidationError
from django.http import HttpResponseForbidden
from django.shortcuts import get_object_or_404, redirect
from django.urls import reverse
from django.views.decorators.http import require_POST

from catalog.lifecycle import (
    archive_course,
    publish_course,
    restore_course,
    unpublish_course,
)
from catalog.models import Course


def _redirect_to_detail(course_id: int):
    """Redirige vers la page détail du cours côté instructor."""
    try:
        return redirect(reverse("instructor:course_detail", kwargs={"course_id": course_id}))
    except Exception:
        return redirect("/")


def _format_validation_errors(exc: ValidationError) -> str:
    """Concatène les messages d'un ValidationError pour affichage flash."""
    msgs = getattr(exc, "messages", None) or [str(exc)]
    if isinstance(msgs, dict):
        msgs = [m for vals in msgs.values() for m in (vals if isinstance(vals, list) else [vals])]
    return " ".join(str(m) for m in msgs)


def _handle_transition(request, course_id: int, action_fn, success_label: str):
    """
    Pattern commun à toutes les transitions :
      1. Récupère le cours (404 si absent).
      2. Appelle action_fn(course, actor=request.user, note=…).
      3. Catch ValidationError → messages.error
              PermissionDenied  → 403
      4. messages.success + redirect vers détail.
    """
    course = get_object_or_404(Course, pk=course_id)
    note = request.POST.get("note", "")[:500]
    try:
        action_fn(course, actor=request.user, note=note)
    except PermissionDenied as e:
        return HttpResponseForbidden(str(e))
    except ValidationError as e:
        messages.error(request, _format_validation_errors(e))
        return _redirect_to_detail(course_id)
    except Exception as e:
        # Filet de sécurité : on log pas en clair côté utilisateur.
        messages.error(
            request,
            "Une erreur inattendue est survenue lors de la transition. Réessayez.",
        )
        # Le service log déjà côté serveur via les exceptions Django standard.
        return _redirect_to_detail(course_id)
    messages.success(request, f"Cours {success_label} avec succès.")
    return _redirect_to_detail(course_id)


# ─── Endpoints POST exposés ──────────────────────────────────────────

@login_required
@require_POST
def course_publish_view(request, course_id: int):
    """POST /instructor/courses/<id>/publish/ — DRAFT/REVIEW → PUBLISHED."""
    return _handle_transition(request, course_id, publish_course, "publié")


@login_required
@require_POST
def course_unpublish_view(request, course_id: int):
    """POST /instructor/courses/<id>/unpublish/ — PUBLISHED → DRAFT."""
    return _handle_transition(request, course_id, unpublish_course, "dépublié")


@login_required
@require_POST
def course_archive_view(request, course_id: int):
    """POST /instructor/courses/<id>/archive/ — any → ARCHIVED."""
    return _handle_transition(request, course_id, archive_course, "archivé")


@login_required
@require_POST
def course_restore_view(request, course_id: int):
    """POST /instructor/courses/<id>/restore/ — ARCHIVED → DRAFT."""
    return _handle_transition(request, course_id, restore_course, "restauré")
