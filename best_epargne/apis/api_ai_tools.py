"""best_epargne/apis/api_ai_tools.py — Agent outillé (AI Phase 4).

    GET  /api/ai/tools/                              Liste des outils disponibles pour l'utilisateur
    POST /api/ai/tools/execute/                      Demande d'exécution d'un tool
    GET  /api/ai/tools/approvals/                    Approbations en attente (utilisateur courant)
    POST /api/ai/tools/approvals/<id>/confirm/       Confirmer et exécuter
    POST /api/ai/tools/approvals/<id>/cancel/        Annuler
    GET  /api/ai/tools/executions/                   Historique des exécutions (utilisateur courant)

Sécurité :
    - IsAuthenticated + RBAC par tool (déclaré dans le tool lui-même).
    - Chaque appel est journalisé (AIToolExecution + AIAuditLog).
    - Confirmation obligatoire pour les tools L1/L2.
"""
from __future__ import annotations

from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ai.models import AIActionApproval, AIToolExecution
from ai.permissions import user_can_use_assistant
from ai.tools import (
    cancel_execution,
    confirm_execution,
    list_tools_for_user,
    request_execution,
)


def _forbidden(user=None):
    # SECURITE-05 — délègue à ai.http.forbidden_for
    from ai.http import forbidden_for
    return forbidden_for(user)


def _client_ip(request):
    x = request.META.get("HTTP_X_FORWARDED_FOR")
    if x:
        return x.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


# ─────────────────────────────────────────────────────────────
# Serializers
# ─────────────────────────────────────────────────────────────


class ExecuteToolInput(serializers.Serializer):
    tool_key = serializers.CharField(max_length=80)
    params = serializers.JSONField(required=False, default=dict)
    conversation_id = serializers.IntegerField(required=False, allow_null=True)


class ApprovalSerializer(serializers.ModelSerializer):
    class Meta:
        model = AIActionApproval
        fields = [
            "id",
            "tool_key",
            "level",
            "status",
            "summary",
            "impact",
            "affected_items",
            "permissions_used",
            "input_payload",
            "created_at",
            "resolved_at",
        ]


class ExecutionSerializer(serializers.ModelSerializer):
    class Meta:
        model = AIToolExecution
        fields = [
            "id",
            "tool_key",
            "status",
            "input_payload",
            "output_payload",
            "latency_ms",
            "error_detail",
            "created_at",
            "completed_at",
        ]


# ─────────────────────────────────────────────────────────────
# Views
# ─────────────────────────────────────────────────────────────


class AIToolsListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Liste des outils IA disponibles pour l'utilisateur")
    def get(self, request):
        if not user_can_use_assistant(request.user):
            return _forbidden(request.user)
        return Response({"tools": list_tools_for_user(request.user)})


class AIToolExecuteView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        summary="Demander l'exécution d'un tool",
        request=ExecuteToolInput,
    )
    def post(self, request):
        if not user_can_use_assistant(request.user):
            return _forbidden(request.user)
        s = ExecuteToolInput(data=request.data)
        s.is_valid(raise_exception=True)
        payload = request_execution(
            user=request.user,
            tool_key=s.validated_data["tool_key"],
            params=s.validated_data.get("params") or {},
            conversation_id=s.validated_data.get("conversation_id") or None,
            ip=_client_ip(request),
        )
        http_status = 200 if payload.get("status") != "denied" else 403
        return Response(payload, status=http_status)


class AIToolApprovalListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Approbations d'action en attente (utilisateur courant)")
    def get(self, request):
        if not user_can_use_assistant(request.user):
            return _forbidden(request.user)
        state = (request.query_params.get("status") or "PENDING").upper()
        qs = AIActionApproval.objects.filter(user=request.user)
        if state in {"PENDING", "CONFIRMED", "CANCELLED", "EXPIRED"}:
            qs = qs.filter(status=state)
        qs = qs.order_by("-created_at")
        paginator = PageNumberPagination()
        paginator.page_size = 20
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response(
            ApprovalSerializer(page, many=True).data
        )


class AIToolApprovalConfirmView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Confirmer une approbation et exécuter le tool")
    def post(self, request, approval_id: int):
        if not user_can_use_assistant(request.user):
            return _forbidden(request.user)
        payload = confirm_execution(
            user=request.user,
            approval_id=approval_id,
            ip=_client_ip(request),
        )
        code = 200 if payload.get("status") != "denied" else 403
        return Response(payload, status=code)


class AIToolApprovalCancelView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Annuler une approbation en attente")
    def post(self, request, approval_id: int):
        if not user_can_use_assistant(request.user):
            return _forbidden(request.user)
        payload = cancel_execution(
            user=request.user,
            approval_id=approval_id,
            ip=_client_ip(request),
        )
        code = 200 if payload.get("status") != "denied" else 403
        return Response(payload, status=code)


class AIToolExecutionsView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Historique des exécutions de tools (utilisateur courant)")
    def get(self, request):
        if not user_can_use_assistant(request.user):
            return _forbidden(request.user)
        qs = AIToolExecution.objects.filter(user=request.user).order_by("-created_at")
        paginator = PageNumberPagination()
        paginator.page_size = 25
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response(
            ExecutionSerializer(page, many=True).data
        )
