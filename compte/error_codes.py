"""compte/error_codes.py — Codes d'erreur normalisés API.

Objectif : donner au frontend un contrat stable pour piloter des
redirections et l'UX (page /verify-email, /account-suspended, modal
"formateur pas encore approuvé", etc.) sans dépendre de la copie du
champ ``detail`` qui reste un message humain.

Chaque helper renvoie un ``Response`` DRF prêt à retourner d'une view.
Le payload est toujours :

    {
        "detail": "<message humain>",
        "code": "<CODE_STABLE>",
        "extra": {...}  # optionnel, dépend du code
    }

Le code HTTP est piloté par la nature du problème (403 verrouillage
métier, 429 rate-limit, 400 données invalides).
"""
from __future__ import annotations

from typing import Any

from rest_framework import status
from rest_framework.response import Response


# ── Codes stables (contrat frontend) ─────────────────────────────
EMAIL_NOT_VERIFIED = "EMAIL_NOT_VERIFIED"
EMAIL_TOKEN_INVALID = "EMAIL_TOKEN_INVALID"
EMAIL_RESEND_COOLDOWN = "EMAIL_RESEND_COOLDOWN"
EMAIL_ALREADY_VERIFIED = "EMAIL_ALREADY_VERIFIED"

ACCOUNT_SUSPENDED = "ACCOUNT_SUSPENDED"

INSTRUCTOR_APPROVAL_PENDING = "INSTRUCTOR_APPROVAL_PENDING"
INSTRUCTOR_NOT_APPROVED = "INSTRUCTOR_NOT_APPROVED"

ROLE_FORBIDDEN = "ROLE_FORBIDDEN"
PERMISSION_DENIED = "PERMISSION_DENIED"


def error_response(
    *,
    code: str,
    detail: str,
    http_status: int = status.HTTP_403_FORBIDDEN,
    extra: dict[str, Any] | None = None,
) -> Response:
    payload: dict[str, Any] = {"detail": detail, "code": code}
    if extra:
        payload["extra"] = extra
    return Response(payload, status=http_status)


# ── Raccourcis pour les cas récurrents ──────────────────────────


def email_not_verified() -> Response:
    return error_response(
        code=EMAIL_NOT_VERIFIED,
        detail="Adresse e-mail non vérifiée.",
        http_status=status.HTTP_403_FORBIDDEN,
    )


def account_suspended() -> Response:
    return error_response(
        code=ACCOUNT_SUSPENDED,
        detail="Compte suspendu par l'administration.",
        http_status=status.HTTP_403_FORBIDDEN,
    )


def instructor_not_approved() -> Response:
    return error_response(
        code=INSTRUCTOR_NOT_APPROVED,
        detail="Compte formateur en attente d'approbation.",
        http_status=status.HTTP_403_FORBIDDEN,
    )


def role_forbidden(needed_roles: list[str]) -> Response:
    return error_response(
        code=ROLE_FORBIDDEN,
        detail="Accès refusé pour votre rôle.",
        http_status=status.HTTP_403_FORBIDDEN,
        extra={"needed_roles": needed_roles},
    )
