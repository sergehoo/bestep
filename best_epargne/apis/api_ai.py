"""best_epargne/apis/api_ai.py — Phase 1 des endpoints IA.

Endpoints :
    GET    /api/ai/conversations/              Liste conversations user
    POST   /api/ai/conversations/              Créer une conversation
    GET    /api/ai/conversations/<id>/         Détail (+ messages)
    PATCH  /api/ai/conversations/<id>/         Renommer / archiver
    DELETE /api/ai/conversations/<id>/         Supprimer
    POST   /api/ai/conversations/<id>/messages/   Poster un message (SSE stream)
    POST   /api/ai/messages/<id>/feedback/     Feedback +1/-1
    GET    /api/ai/usage/                      Consommation user (compte + tokens)
    GET    /api/ai/config/                     Config front (purpose défauts, features)

Toutes les vues sont IsAuthenticated + gate ``user_can_use_assistant``.
"""
from __future__ import annotations

import json
from typing import Optional

from django.http import StreamingHttpResponse
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.renderers import BaseRenderer, JSONRenderer
from rest_framework.response import Response
from rest_framework.views import APIView


# ─────────────────────────────────────────────────────────────
# BUG-AI-02 — Content negotiation pour SSE
# ─────────────────────────────────────────────────────────────
#
# Le frontend envoie ``Accept: text/event-stream`` sur POST /messages/.
# Sans renderer enregistré pour ce mime type, DRF renvoie 406 Not
# Acceptable ("L'en-tête « Accept » n'a pas pu être satisfaite.").
#
# On ajoute un renderer pass-through qui expose ``text/event-stream``.
# La vue retourne directement un ``StreamingHttpResponse`` — le renderer
# n'a donc jamais besoin de rendre quoi que ce soit, il sert uniquement
# à satisfaire la content negotiation DRF.


class EventStreamRenderer(BaseRenderer):
    """Pass-through renderer pour ``text/event-stream`` (SSE)."""

    media_type = "text/event-stream"
    format = "sse"
    charset = "utf-8"

    def render(self, data, accepted_media_type=None, renderer_context=None):
        # Jamais appelé en pratique : la vue retourne un
        # StreamingHttpResponse et n'invoque pas ce renderer. On garde
        # une implémentation par défaut au cas où.
        if isinstance(data, (bytes, str)):
            return data
        return b""

from ai.models import (
    AIAuditLog,
    AIConversation,
    AIMessage,
    AIUsageRecord,
)
from ai.permissions import (
    user_can_access_conversation,
    user_can_delete_conversation,
    user_can_use_assistant,
)
from ai.services import (
    guess_title_from_first_message,
    stream_assistant_turn,
)


# ─────────────────────────────────────────────────────────────
# Serializers
# ─────────────────────────────────────────────────────────────


class AIConversationSummarySerializer(serializers.ModelSerializer):
    message_count = serializers.SerializerMethodField()

    class Meta:
        model = AIConversation
        fields = [
            "id",
            "title",
            "default_purpose",
            "is_archived",
            "created_at",
            "updated_at",
            "last_message_at",
            "message_count",
        ]

    def get_message_count(self, obj) -> int:
        return obj.messages.count()


class AIMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = AIMessage
        fields = [
            "id",
            "role",
            "content",
            "metadata",
            "page_context",
            "model_used",
            "input_tokens",
            "output_tokens",
            "latency_ms",
            "feedback_score",
            "feedback_note",
            "created_at",
        ]


class AIConversationDetailSerializer(AIConversationSummarySerializer):
    messages = AIMessageSerializer(many=True, read_only=True)
    context = serializers.JSONField(read_only=True)

    class Meta(AIConversationSummarySerializer.Meta):
        fields = AIConversationSummarySerializer.Meta.fields + [
            "context",
            "messages",
        ]


class AIConversationCreateSerializer(serializers.Serializer):
    title = serializers.CharField(required=False, allow_blank=True, max_length=200)
    default_purpose = serializers.ChoiceField(
        choices=[
            "chat_fast",
            "chat_advanced",
            "analysis",
            "image",
            "embedding",
        ],
        required=False,
        default="chat_fast",
    )
    context = serializers.JSONField(required=False, default=dict)


class AIConversationPatchSerializer(serializers.Serializer):
    title = serializers.CharField(required=False, max_length=200)
    is_archived = serializers.BooleanField(required=False)
    default_purpose = serializers.ChoiceField(
        choices=[
            "chat_fast",
            "chat_advanced",
            "analysis",
            "image",
            "embedding",
        ],
        required=False,
    )


class AIMessageInputSerializer(serializers.Serializer):
    content = serializers.CharField(min_length=1, max_length=8000)
    page_context = serializers.JSONField(required=False, default=dict)


class AIMessageFeedbackSerializer(serializers.Serializer):
    score = serializers.IntegerField(min_value=-1, max_value=1)
    note = serializers.CharField(required=False, allow_blank=True, max_length=280)


# ─────────────────────────────────────────────────────────────
# Vues
# ─────────────────────────────────────────────────────────────


def _forbidden(user=None):
    # SECURITE-05 — délègue à ai.http.forbidden_for pour émettre un ``code``.
    from ai.http import forbidden_for
    return forbidden_for(user)


def _client_ip(request) -> Optional[str]:
    x_forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded:
        return x_forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR") or None


class AIConversationListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Liste des conversations IA de l'utilisateur")
    def get(self, request):
        if not user_can_use_assistant(request.user):
            return _forbidden(request.user)
        qs = (
            AIConversation.objects.filter(user=request.user, is_archived=False)
            .order_by("-last_message_at", "-id")
        )
        paginator = PageNumberPagination()
        paginator.page_size = 30
        paginator.max_page_size = 100
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response(
            AIConversationSummarySerializer(page, many=True).data
        )

    @extend_schema(
        summary="Créer une conversation IA",
        request=AIConversationCreateSerializer,
        responses=AIConversationDetailSerializer,
    )
    def post(self, request):
        if not user_can_use_assistant(request.user):
            return _forbidden(request.user)
        s = AIConversationCreateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        data = s.validated_data

        conversation = AIConversation.objects.create(
            user=request.user,
            title=(data.get("title") or "Nouvelle conversation").strip(),
            default_purpose=data.get("default_purpose") or "chat_fast",
            context=data.get("context") or {},
        )
        AIAuditLog.objects.create(
            user=request.user,
            conversation_id_snapshot=conversation.id,
            kind=AIAuditLog.Kind.CONVERSATION_CREATED,
            payload={"title": conversation.title},
            ip=_client_ip(request),
        )
        return Response(
            AIConversationDetailSerializer(conversation).data,
            status=status.HTTP_201_CREATED,
        )


class AIConversationDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get(self, request, conversation_id):
        try:
            conversation = AIConversation.objects.get(pk=conversation_id)
        except AIConversation.DoesNotExist:
            return None, Response({"detail": "Introuvable."}, status=404)
        if not user_can_access_conversation(request.user, conversation):
            return None, _forbidden()
        return conversation, None

    @extend_schema(summary="Détail d'une conversation IA")
    def get(self, request, conversation_id: int):
        conversation, err = self._get(request, conversation_id)
        if err:
            return err
        return Response(AIConversationDetailSerializer(conversation).data)

    @extend_schema(
        summary="Renommer / archiver une conversation IA",
        request=AIConversationPatchSerializer,
    )
    def patch(self, request, conversation_id: int):
        conversation, err = self._get(request, conversation_id)
        if err:
            return err
        s = AIConversationPatchSerializer(data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        for field, value in s.validated_data.items():
            setattr(conversation, field, value)
        conversation.save()
        return Response(AIConversationDetailSerializer(conversation).data)

    @extend_schema(summary="Supprimer une conversation IA")
    def delete(self, request, conversation_id: int):
        conversation, err = self._get(request, conversation_id)
        if err:
            return err
        if not user_can_delete_conversation(request.user, conversation):
            return _forbidden(request.user)
        conv_id = conversation.id
        title = conversation.title
        conversation.delete()
        AIAuditLog.objects.create(
            user=request.user,
            conversation_id_snapshot=conv_id,
            kind=AIAuditLog.Kind.CONVERSATION_DELETED,
            payload={"title": title},
            ip=_client_ip(request),
        )
        return Response(status=204)


class AIMessagePostView(APIView):
    """POST /api/ai/conversations/<id>/messages/ — SSE streaming."""

    permission_classes = [IsAuthenticated]
    # BUG-AI-02 — Le client envoie Accept: text/event-stream. Sans
    # renderer déclaré pour ce mime type, DRF refuse la requête en 406.
    # On expose EventStream + JSON (JSON reste utile pour les réponses
    # d'erreur 400/403/404 qui ne sont pas des streams).
    renderer_classes = [EventStreamRenderer, JSONRenderer]

    @extend_schema(
        summary="Envoyer un message (streaming SSE)",
        request=AIMessageInputSerializer,
    )
    def post(self, request, conversation_id: int):
        if not user_can_use_assistant(request.user):
            return _forbidden(request.user)
        try:
            conversation = AIConversation.objects.get(
                pk=conversation_id, user=request.user
            )
        except AIConversation.DoesNotExist:
            return Response({"detail": "Introuvable."}, status=404)

        s = AIMessageInputSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        content = s.validated_data["content"]
        page_context = s.validated_data.get("page_context") or {}

        # Auto-titre à la première interaction (si titre par défaut)
        if (
            not conversation.messages.exists()
            and conversation.title in ("", "Nouvelle conversation")
        ):
            conversation.title = guess_title_from_first_message(content)
            conversation.save(update_fields=["title"])

        ip = _client_ip(request)

        def event_stream():
            for event in stream_assistant_turn(
                conversation=conversation,
                user_message=content,
                page_context=page_context,
                request_ip=ip,
            ):
                yield "data: " + json.dumps(event, ensure_ascii=False) + "\n\n"

        response = StreamingHttpResponse(
            event_stream(),
            content_type="text/event-stream",
        )
        response["Cache-Control"] = "no-cache, no-transform"
        response["X-Accel-Buffering"] = "no"
        return response


class AIMessageFeedbackView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        summary="Feedback (+1/-1) sur un message assistant",
        request=AIMessageFeedbackSerializer,
    )
    def post(self, request, message_id: int):
        try:
            message = AIMessage.objects.select_related("conversation").get(pk=message_id)
        except AIMessage.DoesNotExist:
            return Response({"detail": "Introuvable."}, status=404)
        if not user_can_access_conversation(request.user, message.conversation):
            return _forbidden(request.user)
        s = AIMessageFeedbackSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        message.feedback_score = s.validated_data["score"]
        message.feedback_note = s.validated_data.get("note", "") or ""
        message.save(update_fields=["feedback_score", "feedback_note"])
        AIAuditLog.objects.create(
            user=request.user,
            conversation_id_snapshot=message.conversation_id,
            kind=AIAuditLog.Kind.FEEDBACK_SUBMITTED,
            payload={
                "message_id": message.id,
                "score": message.feedback_score,
            },
            ip=_client_ip(request),
        )
        return Response(AIMessageSerializer(message).data)


class AIUsageView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Consommation IA de l'utilisateur (compte + tokens)")
    def get(self, request):
        if not user_can_use_assistant(request.user):
            return _forbidden(request.user)
        from django.db.models import Count, Sum

        qs = AIUsageRecord.objects.filter(user=request.user)
        agg = qs.aggregate(
            calls=Count("id"),
            input_tokens=Sum("input_tokens"),
            output_tokens=Sum("output_tokens"),
        )
        return Response(
            {
                "calls": agg["calls"] or 0,
                "input_tokens": agg["input_tokens"] or 0,
                "output_tokens": agg["output_tokens"] or 0,
            }
        )


class AIConfigView(APIView):
    """GET /api/ai/config/ — infos pour le panel (features, purposes disponibles)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Configuration front du panel IA")
    def get(self, request):
        if not user_can_use_assistant(request.user):
            return _forbidden(request.user)
        return Response(
            {
                "purposes": [
                    {"key": "chat_fast", "label": "Chat rapide"},
                    {"key": "chat_advanced", "label": "Chat avancé"},
                    {"key": "analysis", "label": "Analyse"},
                ],
                "default_purpose": "chat_fast",
                "features": {
                    "streaming": True,
                    "attachments": False,   # Phase 5
                    "web_search": False,    # Phase 5
                    "tools": False,         # Phase 4
                    "image_generation": False,  # Phase 6
                },
            }
        )
