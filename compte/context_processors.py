"""Context processors compte — V4.C (audit COMPTE-05).

Avant : ``workspaces`` appelait à la fois ``list_available_workspaces(user)``
ET ``get_active_workspace(request)``. La seconde refaisait la première en
interne → 2 fois la requête memberships pour CHAQUE rendu de page
authentifiée. Cumulé avec les properties is_org_* du User, on atteignait
4-6 requêtes SQL avant le rendu de toute page.

Après : on ne calcule ``available_workspaces`` qu'UNE seule fois, on
résout le workspace actif depuis cette liste matérialisée, et on cache
le résultat sur ``request`` pour les multiples context processors / tags
qui en dépendent (idempotent par request HTTP).
"""
from __future__ import annotations

from compte.workspaces import (
    SESSION_KEY,
    _safe_first_workspace,
    list_available_workspaces,
    resolve_workspace_url,
)

_REQUEST_CACHE_ATTR = "_workspaces_ctx_cache"


def workspaces(request):
    """Expose available_workspaces / active_workspace aux templates.

    Mémoïsé par requête HTTP (1 hit DB max).
    """
    cached = getattr(request, _REQUEST_CACHE_ATTR, None)
    if cached is not None:
        return cached

    user = getattr(request, "user", None)
    if user is None or not user.is_authenticated:
        payload = {
            "available_workspaces": [],
            "active_workspace": None,
            "active_workspace_url": "",
            "active_workspace_theme": "sky",
            "active_workspace_hue": "#0C87D6",
        }
        setattr(request, _REQUEST_CACHE_ATTR, payload)
        return payload

    # CORRECTIF COMPTE-05 : un seul appel à list_available_workspaces.
    available = list_available_workspaces(user)

    # Résolution de l'active depuis la liste matérialisée (au lieu de
    # rappeler get_active_workspace qui ré-itère sur list_available_workspaces).
    payload_session = (request.session or {}).get(SESSION_KEY)
    active = None
    if available and payload_session:
        for ws in available:
            if ws.matches_session(payload_session):
                active = ws
                break
    if active is None and available:
        active = _safe_first_workspace(available, user)

    payload = {
        "available_workspaces": available,
        "active_workspace": active,
        "active_workspace_url": resolve_workspace_url(active),
        "active_workspace_theme": active.theme if active else "sky",
        "active_workspace_hue": active.theme_hue if active else "#0C87D6",
    }
    setattr(request, _REQUEST_CACHE_ATTR, payload)
    return payload


# ---------------------------------------------------------------------------
# Badges sidebar (UX_IMPROVEMENTS §P3) — compteurs avec cache court.
# ---------------------------------------------------------------------------

_BADGES_CACHE_TTL = 60  # secondes — fraîcheur suffisante pour des badges.


def sidebar_badges(request):
    """Compteurs affichés en pastille dans les sidebars.

    - ``unread_notification_count`` : notifications non lues (tous espaces).
    - ``instructor_new_reviews_count`` : avis publics reçus ces 7 derniers
      jours sur les cours du formateur (espace instructor uniquement).
    - ``org_pending_invitations_count`` : invitations en attente de
      l'organisation active (espace org uniquement).

    Mis en cache 60 s par (user, workspace) pour ne pas requêter à chaque
    rendu de page.
    """
    user = getattr(request, "user", None)
    if user is None or not user.is_authenticated:
        return {}

    ws_ctx = workspaces(request)
    active = ws_ctx.get("active_workspace")
    kind = getattr(active, "kind", "") or ""
    org_id = getattr(active, "organization_id", None)

    from django.core.cache import cache

    cache_key = f"sidebar_badges:{user.pk}:{kind}:{org_id or ''}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    from django.utils import timezone

    from notifications.models import Notification

    badges = {
        "unread_notification_count": Notification.objects.filter(
            user=user, read_at__isnull=True
        ).count(),
        "instructor_new_reviews_count": 0,
        "org_pending_invitations_count": 0,
    }

    if kind == "instructor":
        from reviews.models import CourseReview

        badges["instructor_new_reviews_count"] = CourseReview.objects.filter(
            course__instructor=user,
            is_public=True,
            created_at__gte=timezone.now() - timezone.timedelta(days=7),
        ).count()

    if kind == "org" and org_id:
        from organizations.models import OrganizationInvitation

        badges["org_pending_invitations_count"] = OrganizationInvitation.objects.filter(
            organization_id=org_id,
            accepted_at__isnull=True,
            expires_at__gt=timezone.now(),
        ).count()

    cache.set(cache_key, badges, _BADGES_CACHE_TTL)
    return badges
