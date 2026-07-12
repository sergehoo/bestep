"""
best_epargne/apis/api_admin_notifications.py — R40

Endpoint admin — supervision des notifications plateforme.
Utilisé comme MVP de « journal support » en attendant l'implémentation
complète du module Ticket (roadmap R41+).

    GET /api/admin/notifications/[?kind=&user_id=&unread=]

Réservé ``is_platform_admin``.
"""
from __future__ import annotations

from django.db.models import Q
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from notifications.models import Notification


class _NotifSerializer(serializers.ModelSerializer):
    user_email = serializers.CharField(source="user.email", read_only=True)
    user_full_name = serializers.SerializerMethodField()
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)
    is_read = serializers.BooleanField(read_only=True)

    class Meta:
        model = Notification
        fields = [
            "id",
            "user",
            "user_email",
            "user_full_name",
            "kind",
            "kind_label",
            "title",
            "body",
            "url",
            "payload",
            "created_at",
            "read_at",
            "is_read",
        ]

    def get_user_full_name(self, obj):
        u = obj.user
        return getattr(u, "full_name", "") or getattr(u, "email", "")


class _Pagination(PageNumberPagination):
    page_size = 30
    page_size_query_param = "page_size"
    max_page_size = 100


class AdminNotificationsListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Admin — supervision notifications")
    def get(self, request):
        if not getattr(request.user, "is_platform_admin", False):
            return Response(
                {"detail": "Réservé aux administrateurs plateforme."},
                status=status.HTTP_403_FORBIDDEN,
            )

        qs = Notification.objects.select_related("user").order_by("-created_at")

        kind = request.query_params.get("kind")
        if kind:
            qs = qs.filter(kind=kind)

        user_id = request.query_params.get("user_id")
        if user_id and user_id.isdigit():
            qs = qs.filter(user_id=int(user_id))

        unread = request.query_params.get("unread")
        if unread in ("true", "1"):
            qs = qs.filter(read_at__isnull=True)
        elif unread in ("false", "0"):
            qs = qs.filter(read_at__isnull=False)

        q = request.query_params.get("q")
        if q:
            qs = qs.filter(
                Q(title__icontains=q)
                | Q(body__icontains=q)
                | Q(user__email__icontains=q),
            )

        paginator = _Pagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        ser = _NotifSerializer(page, many=True)

        aggregated = {
            "total": qs.count(),
            "unread": qs.filter(read_at__isnull=True).count(),
            "system": qs.filter(kind="system").count(),
        }
        response = paginator.get_paginated_response(ser.data)
        response.data["aggregated"] = aggregated
        return response
