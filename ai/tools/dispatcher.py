"""ai.tools.dispatcher — orchestration des exécutions.

3 chemins :
    - Confirmation 0 → exécution immédiate.
    - Confirmation 1 (simple) → ``AIActionApproval`` créée, l'utilisateur
      confirme dans l'UI.
    - Confirmation 2 (renforcée) → même chose, avec impact affiché
      obligatoirement.

Journalisation systématique dans ``AIToolExecution`` (state machine
PENDING_APPROVAL → RUNNING → SUCCESS|FAILED|CANCELLED|DENIED) et
``AIAuditLog`` pour l'audit inter-modules.
"""
from __future__ import annotations

import time
from typing import Optional

from django.utils import timezone

from ..models import (
    AIActionApproval,
    AIAuditLog,
    AIToolExecution,
)
from .base import AbstractAITool, TOOL_REGISTRY, ToolResult


# ─────────────────────────────────────────────────────────────
# Enumération pour le front
# ─────────────────────────────────────────────────────────────


def list_tools_for_user(user) -> list[dict]:
    """Liste des outils dispo pour cet utilisateur, avec métadonnées."""
    out = []
    for tool in TOOL_REGISTRY.values():
        if not tool.user_can_run(user):
            continue
        out.append(
            {
                "key": tool.key,
                "title": tool.title,
                "description": tool.description,
                "confirmation_level": tool.confirmation_level,
                "params_schema": tool.params_schema,
                "allowed_roles": tool.allowed_roles,
            }
        )
    return out


# ─────────────────────────────────────────────────────────────
# Cycle d'exécution
# ─────────────────────────────────────────────────────────────


def _create_execution(
    *, tool: AbstractAITool, user, params: dict, conversation_id: Optional[int], ip: Optional[str]
) -> AIToolExecution:
    return AIToolExecution.objects.create(
        tool_key=tool.key,
        user=user,
        conversation_id=conversation_id,
        input_payload=params,
        status=AIToolExecution.Status.PENDING_APPROVAL,
        ip=ip,
    )


def _run_and_persist(execution: AIToolExecution, tool: AbstractAITool, user, params: dict) -> ToolResult:
    """Exécute réellement le tool et persiste le résultat."""
    execution.status = AIToolExecution.Status.RUNNING
    execution.save(update_fields=["status"])

    start = time.time()
    try:
        result = tool.run(user, params) or ToolResult(ok=False, detail="Retour vide.")
        ok = bool(result.ok)
        execution.output_payload = {
            "detail": result.detail or "",
            "data": result.data or {},
        }
        execution.status = (
            AIToolExecution.Status.SUCCESS if ok else AIToolExecution.Status.FAILED
        )
        if not ok:
            execution.error_detail = (result.detail or "")[:500]
    except Exception as exc:  # noqa: BLE001
        result = ToolResult(ok=False, detail=str(exc)[:280])
        execution.status = AIToolExecution.Status.FAILED
        execution.error_detail = str(exc)[:500]

    execution.latency_ms = int((time.time() - start) * 1000)
    execution.completed_at = timezone.now()
    execution.save()

    AIAuditLog.objects.create(
        user=execution.user,
        conversation_id_snapshot=execution.conversation_id,
        kind=AIAuditLog.Kind.TOOL_EXECUTION,
        payload={
            "tool_key": execution.tool_key,
            "status": execution.status,
            "latency_ms": execution.latency_ms,
        },
        ip=execution.ip,
        ok=execution.status == AIToolExecution.Status.SUCCESS,
        error_type=execution.error_detail[:80],
    )
    return result


def request_execution(
    *,
    user,
    tool_key: str,
    params: dict,
    conversation_id: Optional[int] = None,
    ip: Optional[str] = None,
) -> dict:
    """Point d'entrée depuis les vues DRF.

    Retourne un dict :
        {
          "status": "executed" | "pending_approval" | "denied",
          "execution": {...},
          "approval": {...} | null,
          "result": {...} | null,
        }
    """
    tool = TOOL_REGISTRY.get(tool_key)
    if tool is None:
        return {"status": "denied", "detail": "Outil inconnu."}
    if not tool.user_can_run(user):
        # On journalise quand même le refus.
        AIAuditLog.objects.create(
            user=user if user and user.is_authenticated else None,
            kind=AIAuditLog.Kind.TOOL_EXECUTION,
            payload={"tool_key": tool_key, "status": "denied"},
            ip=ip,
            ok=False,
            error_type="rbac_denied",
        )
        return {"status": "denied", "detail": "Vous n'êtes pas autorisé."}

    params = params or {}
    execution = _create_execution(
        tool=tool,
        user=user,
        params=params,
        conversation_id=conversation_id,
        ip=ip,
    )

    if tool.confirmation_level <= 0:
        result = _run_and_persist(execution, tool, user, params)
        return {
            "status": "executed",
            "execution": _serialize_execution(execution),
            "approval": None,
            "result": {"ok": result.ok, "detail": result.detail, "data": result.data},
        }

    # Sinon : on crée l'approval (pending).
    preview = tool.build_preview(user, params)
    approval = AIActionApproval.objects.create(
        execution=execution,
        user=user,
        tool_key=tool.key,
        level=tool.confirmation_level,
        summary=preview.summary or tool.title,
        impact=preview.impact,
        affected_items=preview.affected_items or [],
        permissions_used=preview.permissions_used or [],
        input_payload=params,
    )
    AIAuditLog.objects.create(
        user=user,
        kind=AIAuditLog.Kind.ACTION_APPROVAL,
        payload={
            "tool_key": tool.key,
            "approval_id": approval.id,
            "level": approval.level,
            "state": "pending",
        },
        ip=ip,
    )
    return {
        "status": "pending_approval",
        "execution": _serialize_execution(execution),
        "approval": _serialize_approval(approval),
        "result": None,
    }


def confirm_execution(*, user, approval_id: int, ip: Optional[str] = None) -> dict:
    try:
        approval = AIActionApproval.objects.select_related("execution").get(pk=approval_id)
    except AIActionApproval.DoesNotExist:
        return {"status": "denied", "detail": "Approbation introuvable."}
    if approval.user_id != user.id:
        return {"status": "denied", "detail": "Approbation d'un autre utilisateur."}
    if approval.status != AIActionApproval.Status.PENDING:
        return {"status": "denied", "detail": f"Approbation déjà {approval.status.lower()}."}

    tool = TOOL_REGISTRY.get(approval.tool_key)
    if tool is None:
        approval.status = AIActionApproval.Status.CANCELLED
        approval.resolved_at = timezone.now()
        approval.save(update_fields=["status", "resolved_at"])
        return {"status": "denied", "detail": "Outil devenu indisponible."}

    approval.status = AIActionApproval.Status.CONFIRMED
    approval.resolved_at = timezone.now()
    approval.save(update_fields=["status", "resolved_at"])

    execution = approval.execution
    result = _run_and_persist(execution, tool, user, approval.input_payload or {})

    AIAuditLog.objects.create(
        user=user,
        kind=AIAuditLog.Kind.ACTION_APPROVAL,
        payload={
            "tool_key": tool.key,
            "approval_id": approval.id,
            "state": "confirmed",
            "exec_status": execution.status,
        },
        ip=ip,
    )
    return {
        "status": "executed",
        "execution": _serialize_execution(execution),
        "approval": _serialize_approval(approval),
        "result": {"ok": result.ok, "detail": result.detail, "data": result.data},
    }


def cancel_execution(*, user, approval_id: int, ip: Optional[str] = None) -> dict:
    try:
        approval = AIActionApproval.objects.select_related("execution").get(pk=approval_id)
    except AIActionApproval.DoesNotExist:
        return {"status": "denied", "detail": "Approbation introuvable."}
    if approval.user_id != user.id:
        return {"status": "denied", "detail": "Approbation d'un autre utilisateur."}
    if approval.status != AIActionApproval.Status.PENDING:
        return {"status": "denied", "detail": f"Approbation déjà {approval.status.lower()}."}

    approval.status = AIActionApproval.Status.CANCELLED
    approval.resolved_at = timezone.now()
    approval.save(update_fields=["status", "resolved_at"])

    execution = approval.execution
    execution.status = AIToolExecution.Status.CANCELLED
    execution.completed_at = timezone.now()
    execution.save(update_fields=["status", "completed_at"])

    AIAuditLog.objects.create(
        user=user,
        kind=AIAuditLog.Kind.ACTION_APPROVAL,
        payload={
            "tool_key": approval.tool_key,
            "approval_id": approval.id,
            "state": "cancelled",
        },
        ip=ip,
    )
    return {
        "status": "cancelled",
        "execution": _serialize_execution(execution),
        "approval": _serialize_approval(approval),
    }


# ─────────────────────────────────────────────────────────────
# Serializers minces (dict) — évitent une dépendance croisée DRF
# ─────────────────────────────────────────────────────────────


def _serialize_execution(e: AIToolExecution) -> dict:
    return {
        "id": e.id,
        "tool_key": e.tool_key,
        "status": e.status,
        "input_payload": e.input_payload,
        "output_payload": e.output_payload,
        "latency_ms": e.latency_ms,
        "error_detail": e.error_detail,
        "created_at": e.created_at.isoformat(),
        "completed_at": e.completed_at.isoformat() if e.completed_at else None,
    }


def _serialize_approval(a: AIActionApproval) -> dict:
    return {
        "id": a.id,
        "tool_key": a.tool_key,
        "level": a.level,
        "status": a.status,
        "summary": a.summary,
        "impact": a.impact,
        "affected_items": a.affected_items,
        "permissions_used": a.permissions_used,
        "input_payload": a.input_payload,
        "created_at": a.created_at.isoformat(),
        "resolved_at": a.resolved_at.isoformat() if a.resolved_at else None,
    }
