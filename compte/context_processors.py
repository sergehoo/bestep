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
