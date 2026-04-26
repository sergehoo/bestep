"""Context processors compte.

Expose aux templates :
- ``available_workspaces`` : liste des espaces accessibles à l'user (pour
  le switcher de la topbar).
- ``active_workspace`` : espace actif courant (pour la sidebar / la pastille
  d'identification de la topbar).

Ce processor est intentionnellement lazy :
- aucun travail si l'user n'est pas authentifié ;
- les listes/objets renvoyés sont vides/None pour ne pas casser les
  templates existants qui ne consomment pas encore ces variables.
"""
from __future__ import annotations

from compte.workspaces import (
    get_active_workspace,
    list_available_workspaces,
    resolve_workspace_url,
)


def workspaces(request):
    user = getattr(request, "user", None)
    if user is None or not user.is_authenticated:
        return {
            "available_workspaces": [],
            "active_workspace": None,
            "active_workspace_url": "",
        }

    available = list_available_workspaces(user)
    active = get_active_workspace(request)

    return {
        "available_workspaces": available,
        "active_workspace": active,
        "active_workspace_url": resolve_workspace_url(active),
        # Couleur d'accent (palette Tailwind) du thème de l'espace courant.
        # Sert à driver les CSS variables (cf. partials/theme_styles.html).
        "active_workspace_theme": active.theme if active else "sky",
        "active_workspace_hue": active.theme_hue if active else "#0C87D6",
    }
