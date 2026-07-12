"""Tool : deactivate_user — désactivation d'un compte (L2 — confirmation renforcée).

Action très sensible : le compte ne peut plus se connecter jusqu'à
réactivation manuelle. Réservé aux platform_admins. L'utilisateur ne
peut pas se désactiver lui-même via ce tool (protection).
"""
from __future__ import annotations

from django.contrib.auth import get_user_model

from .base import AbstractAITool, ToolPreview, ToolResult, register


User = get_user_model()


@register
class DeactivateUserTool(AbstractAITool):
    key = "deactivate_user"
    title = "Désactiver un utilisateur"
    description = (
        "Désactive un compte utilisateur (bloque la connexion). "
        "Action réservée aux administrateurs plateforme."
    )
    allowed_roles = ["platform_admin"]
    confirmation_level = 2
    params_schema = {
        "user_id": {"type": "integer", "required": True},
        "reason": {"type": "string", "required": False, "max_length": 280},
    }

    def build_preview(self, user, params: dict) -> ToolPreview:
        target = User.objects.filter(pk=params.get("user_id")).first()
        return ToolPreview(
            summary=(
                f"Désactiver le compte {target.email if target else 'inconnu'}"
            ),
            impact=(
                "Le compte sera immédiatement bloqué à la connexion. Les "
                "cours en cours d'apprentissage restent en base (données "
                "préservées) mais l'utilisateur ne pourra plus accéder à la "
                "plateforme jusqu'à réactivation manuelle. Cette action est "
                "réversible via l'interface admin."
            ),
            affected_items=[
                {
                    "type": "user",
                    "id": target.id if target else None,
                    "email": target.email if target else "?",
                    "full_name": getattr(target, "full_name", "") if target else "",
                    "is_active_before": target.is_active if target else None,
                    "is_active_after": False,
                }
            ],
            permissions_used=["compte.change_user"],
        )

    def run(self, user, params: dict) -> ToolResult:
        target = User.objects.filter(pk=params.get("user_id")).first()
        if not target:
            return ToolResult(ok=False, detail="Utilisateur introuvable.")
        if target.id == user.id:
            return ToolResult(
                ok=False,
                detail="Vous ne pouvez pas vous désactiver vous-même via ce tool.",
            )
        if not target.is_active:
            return ToolResult(
                ok=False,
                detail=f"{target.email} est déjà désactivé.",
                data={"user_id": target.id},
            )
        target.is_active = False
        target.save(update_fields=["is_active"])
        return ToolResult(
            ok=True,
            detail=f"Compte {target.email} désactivé.",
            data={"user_id": target.id, "is_active": False},
        )
