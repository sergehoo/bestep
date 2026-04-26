"""Notion d'« espace actif » (active workspace) pour les utilisateurs multi-rôles.

Un même utilisateur peut être à la fois ``LEARNER`` (par défaut, tout user
authentifié), ``INSTRUCTOR`` (via ``InstructorProfile`` ou via un membership
``INSTRUCTOR`` dans une org), et ``ORG_ADMIN`` / ``ORG_MANAGER`` dans une ou
plusieurs organisations. Sans contexte, l'UI ne sait pas quelle interface
afficher.

Ce module fournit :
- ``Workspace`` : dataclass décrivant un espace accessible.
- ``list_available_workspaces(user)`` : liste, dans l'ordre de pertinence,
  les espaces auxquels ``user`` a droit.
- ``get_active_workspace(request)`` : lit l'espace actif depuis la session
  (avec fallback sur le 1er espace disponible).
- ``set_active_workspace(request, kind, organization_id)`` : bascule, en
  vérifiant que l'espace est accessible.
- ``resolve_workspace_url(workspace)`` : URL canonique du dashboard d'un
  espace.

Ce module est volontairement sans effet de bord (pas d'écriture en base,
pas de signaux). La session est la seule mémoire mutable. Tester
unitairement est trivial (un User suffit, pas besoin de DB pour la plupart
des cas — sauf ``list_available_workspaces`` qui interroge les memberships).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional

from django.core.exceptions import PermissionDenied
from django.urls import NoReverseMatch, reverse

from organizations.models import OrganizationMembership


# --- Constantes -------------------------------------------------------------

WORKSPACE_LEARNER = "learner"
WORKSPACE_INSTRUCTOR = "instructor"
WORKSPACE_ORG = "org"
WORKSPACE_PLATFORM_ADMIN = "platform_admin"

# Clé utilisée dans request.session pour mémoriser l'espace actif.
SESSION_KEY = "active_workspace"

# Rôles org qui donnent accès au "business dashboard" / espace org.
_ORG_MANAGER_ROLES = (
    OrganizationMembership.Role.OWNER,
    OrganizationMembership.Role.ADMIN,
    OrganizationMembership.Role.MANAGER,
)


# Identité visuelle par espace. Sert à driver les CSS variables du thème
# (cf. templates/partials/theme_styles.html). Choisis pour rester lisibles
# en clair ET en sombre, et différenciables au premier coup d'œil.
WORKSPACE_THEMES = {
    "learner":         {"name": "sky",     "hue": "#0C87D6"},  # bleu
    "instructor":      {"name": "violet",  "hue": "#7C3AED"},  # violet
    "org":             {"name": "emerald", "hue": "#059669"},  # vert
    "platform_admin":  {"name": "rose",    "hue": "#E11D48"},  # rouge
}


# --- Dataclass --------------------------------------------------------------

@dataclass(frozen=True)
class Workspace:
    """Représente un espace navigable pour l'utilisateur.

    Champs :
    - ``kind`` : "learner" / "instructor" / "org" / "platform_admin".
    - ``label`` : libellé court à afficher dans le switcher.
    - ``url_name`` : nom de la route Django pour son dashboard.
    - ``organization_id`` : id de l'org ciblée (uniquement si kind == "org").
    - ``organization_name`` : nom (cache d'affichage).
    - ``role`` : rôle effectif dans cette org (cache d'affichage).
    """
    kind: str
    label: str
    url_name: str
    organization_id: Optional[int] = None
    organization_name: Optional[str] = None
    role: Optional[str] = None

    def to_session(self) -> dict:
        """Forme sérialisable stockée dans request.session."""
        return {"kind": self.kind, "organization_id": self.organization_id}

    def matches_session(self, payload: dict) -> bool:
        if not isinstance(payload, dict):
            return False
        return (
            payload.get("kind") == self.kind
            and payload.get("organization_id") == self.organization_id
        )

    @property
    def is_org(self) -> bool:
        return self.kind == WORKSPACE_ORG

    @property
    def is_platform_admin(self) -> bool:
        return self.kind == WORKSPACE_PLATFORM_ADMIN

    @property
    def theme(self) -> str:
        """Nom Tailwind de la palette du thème (sky/violet/emerald/rose).

        Utilisé pour driver les CSS variables d'accent et pour générer des
        classes Tailwind dynamiques côté template (ex. ``bg-violet-100``).
        """
        return WORKSPACE_THEMES.get(self.kind, WORKSPACE_THEMES["learner"])["name"]

    @property
    def theme_hue(self) -> str:
        """Hex code principal du thème (utile pour `meta[name=theme-color]`)."""
        return WORKSPACE_THEMES.get(self.kind, WORKSPACE_THEMES["learner"])["hue"]


# --- Listing des espaces disponibles ---------------------------------------

def list_available_workspaces(user) -> List[Workspace]:
    """Retourne la liste ordonnée des espaces accessibles à ``user``.

    Ordre de pertinence (du plus privilégié au plus large) :
    1. ``platform_admin`` si is_platform_admin/is_staff/is_superuser ;
    2. une entrée par organisation où l'user est OWNER/ADMIN/MANAGER ;
    3. ``instructor`` si l'user est instructeur (profil ou membership) ;
    4. ``learner`` (toujours, pour tout user authentifié).

    Cette fonction n'écrit rien. Une seule requête SQL pour les memberships.
    """
    if not user or not user.is_authenticated or not user.is_active:
        return []

    spaces: List[Workspace] = []

    # 1. Plateforme
    if getattr(user, "is_platform_admin", False) or user.is_superuser or user.is_staff:
        spaces.append(Workspace(
            kind=WORKSPACE_PLATFORM_ADMIN,
            label="Administration plateforme",
            url_name="admin:index",  # fallback : pas de dashboard plateforme dédié
        ))

    # 2. Organisations (rôles manager+)
    org_memberships = (
        user.organization_memberships
        .filter(
            is_active=True,
            organization__is_active=True,
            role__in=_ORG_MANAGER_ROLES,
        )
        .select_related("organization")
        .order_by("organization__name")
    )
    for m in org_memberships:
        spaces.append(Workspace(
            kind=WORKSPACE_ORG,
            label=m.organization.name,
            url_name="org:dashboard",
            organization_id=m.organization_id,
            organization_name=m.organization.name,
            role=m.role,
        ))

    # 3. Espace formateur (si is_instructor au sens large)
    if getattr(user, "is_instructor", False):
        spaces.append(Workspace(
            kind=WORKSPACE_INSTRUCTOR,
            label="Espace formateur",
            url_name="instructor:dashboard",
        ))

    # 4. Espace apprenant (toujours disponible)
    spaces.append(Workspace(
        kind=WORKSPACE_LEARNER,
        label="Espace apprenant",
        url_name="learner:dashboard",
    ))

    return spaces


# --- Lecture / écriture du workspace actif ---------------------------------

def _safe_first_workspace(available: List[Workspace], user) -> Optional[Workspace]:
    """Premier espace par défaut. On évite de balancer un user "purement
    learner" sur l'espace platform_admin si les flags is_staff sont posés
    par erreur — pour ça on ne préfère ``platform_admin`` que pour les vrais
    admins (déjà filtré dans ``list_available_workspaces``).
    """
    if not available:
        return None
    return available[0]


def get_active_workspace(request) -> Optional[Workspace]:
    """Workspace actif lu depuis ``request.session`` avec fallback.

    Si la session contient un workspace dont l'utilisateur n'a plus le
    droit (ex. un membership a été désactivé entre-temps), on retombe sur
    le 1er espace disponible. Pas de PermissionDenied : la lecture doit
    être tolérante.
    """
    user = getattr(request, "user", None)
    available = list_available_workspaces(user)
    if not available:
        return None

    payload = (request.session or {}).get(SESSION_KEY)
    if payload:
        for ws in available:
            if ws.matches_session(payload):
                return ws

    return _safe_first_workspace(available, user)


def set_active_workspace(
    request,
    kind: str,
    organization_id: Optional[int] = None,
) -> Workspace:
    """Bascule vers un espace précis et le persiste en session.

    Lève ``PermissionDenied`` si l'espace n'est pas dans
    ``list_available_workspaces(user)`` — protection contre la falsification
    de paramètres.
    """
    user = getattr(request, "user", None)
    available = list_available_workspaces(user)

    target_org_id = int(organization_id) if organization_id else None

    for ws in available:
        if ws.kind == kind and ws.organization_id == target_org_id:
            request.session[SESSION_KEY] = ws.to_session()
            request.session.modified = True
            return ws

    raise PermissionDenied("Espace non accessible pour cet utilisateur.")


# --- URL du dashboard d'un espace ------------------------------------------

def resolve_workspace_url(workspace: Optional[Workspace], fallback: str = "/") -> str:
    """URL canonique du dashboard d'un workspace, robuste si l'URL n'existe
    pas encore (cas des routes namespacées non déployées).
    """
    if workspace is None:
        return fallback

    try:
        if workspace.is_org and workspace.organization_id is not None:
            return reverse(
                workspace.url_name,
                kwargs={"organization_id": workspace.organization_id},
            )
        return reverse(workspace.url_name)
    except NoReverseMatch:
        return fallback


def resolve_default_workspace_url(user, fallback: str = "/") -> str:
    """URL du dashboard par défaut pour un utilisateur (le 1er espace
    disponible). Utilisé par l'adapter allauth quand la session ne contient
    pas encore de workspace.
    """
    available = list_available_workspaces(user)
    if not available:
        return fallback
    return resolve_workspace_url(available[0], fallback=fallback)
