"""ai.tools.base — Interfaces communes de l'agent outillé.

Contrat :
    - ``build_preview(user, params) -> ToolPreview`` construit un aperçu
      lisible AVANT exécution (impact, éléments concernés, permissions).
      Cet aperçu est ce qu'on montre à l'utilisateur pour confirmation.
    - ``run(user, params) -> ToolResult`` exécute réellement l'action.

Le dispatcher orchestre les deux appels. Les outils ne journalisent pas
eux-mêmes — c'est le dispatcher qui persiste ``AIToolExecution``.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class ToolPreview:
    summary: str
    impact: str
    affected_items: List[Dict[str, Any]] = field(default_factory=list)
    permissions_used: List[str] = field(default_factory=list)


@dataclass
class ToolResult:
    ok: bool
    detail: str = ""
    data: Dict[str, Any] = field(default_factory=dict)


class AbstractAITool:
    """Base de tout outil IA exécutable.

    Attributs à surcharger :
        key : identifiant stable ("search_courses"…)
        title : libellé humain
        description : phrase d'usage
        allowed_roles : list de rôles autorisés
            valeurs possibles : "learner", "instructor", "platform_admin", "any"
        confirmation_level : 0 (aucune), 1 (simple), 2 (renforcée)
        params_schema : dict décrivant les paramètres attendus
    """

    key: str = "abstract"
    title: str = ""
    description: str = ""
    allowed_roles: List[str] = []
    confirmation_level: int = 0
    params_schema: Dict[str, Any] = {}

    # ── Hooks à surcharger ────────────────────────────────────
    def build_preview(self, user, params: dict) -> ToolPreview:
        return ToolPreview(summary=self.title, impact="")

    def run(self, user, params: dict) -> ToolResult:
        return ToolResult(ok=False, detail="Tool non implémenté.")

    # ── RBAC ──────────────────────────────────────────────────
    def user_can_run(self, user) -> bool:
        if not user or not user.is_authenticated:
            return False
        if "any" in self.allowed_roles:
            return True
        role = self._role_of(user)
        return role in self.allowed_roles

    @staticmethod
    def _role_of(user) -> str:
        if getattr(user, "is_platform_admin", False):
            return "platform_admin"
        if getattr(user, "is_instructor", False):
            return "instructor"
        if getattr(user, "is_learner", False):
            return "learner"
        return "user"


# ── Registry ─────────────────────────────────────────────────

TOOL_REGISTRY: Dict[str, AbstractAITool] = {}


def register(tool_cls: type[AbstractAITool]) -> type[AbstractAITool]:
    """Décorateur d'enregistrement (utilisé par les modules d'outils)."""
    instance = tool_cls()
    TOOL_REGISTRY[instance.key] = instance
    return tool_cls


def get_tool(key: str) -> Optional[AbstractAITool]:
    return TOOL_REGISTRY.get(key)
