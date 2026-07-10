"""
best_epargne/apis/api_admin_audit.py — R28.4

Endpoint admin pour le journal d'audit lifecycle des cours.
Réservé aux ``is_platform_admin``.

    GET /api/admin/audit/course-lifecycle/[?action=X&course_id=Y&actor_id=Z]

Retourne une liste paginée d'événements ``CourseLifecycleEvent`` (déjà
existant depuis P1.1), enrichie de champs snapshot pour ne pas casser
si le cours ou l'acteur est supprimé.
"""
from __future__ import annotations

from django.utils.dateparse import parse_datetime
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from catalog.models import CourseLifecycleEvent


class _EventSerializer(serializers.ModelSerializer):
    course_title = serializers.SerializerMethodField()
    course_id = serializers.SerializerMethodField()
    actor_name = serializers.SerializerMethodField()
    actor_email = serializers.SerializerMethodField()
    action_label = serializers.CharField(source="get_action_display", read_only=True)

    class Meta:
        model = CourseLifecycleEvent
        fields = [
            "id",
            "course_id",
            "course_title",
            "actor_id",
            "actor_name",
            "actor_email",
            "action",
            "action_label",
            "from_status",
            "to_status",
            "note",
            "created_at",
        ]

    def get_course_title(self, obj):
        return obj.course_title_snapshot or (obj.course.title if obj.course_id else "—")

    def get_course_id(self, obj):
        return obj.course_id or obj.course_id_snapshot

    def get_actor_name(self, obj):
        if not obj.actor_id:
            return "Système"
        return getattr(obj.actor, "full_name", None) or getattr(obj.actor, "email", "—")

    def get_actor_email(self, obj):
        return getattr(obj.actor, "email", "") if obj.actor_id else ""


class _Pagination(PageNumberPagination):
    page_size = 30
    page_size_query_param = "page_size"
    max_page_size = 100


class AdminAuditCourseLifecycleView(APIView):
    """Liste paginée + filtres du journal d'audit cours."""
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Journal d'audit — lifecycle cours")
    def get(self, request):
        if not getattr(request.user, "is_platform_admin", False):
            return Response(
                {"detail": "Réservé aux administrateurs plateforme."},
                status=status.HTTP_403_FORBIDDEN,
            )

        qs = (
            CourseLifecycleEvent.objects.all()
            .select_related("course", "actor")
            .order_by("-created_at")
        )

        # Filtres
        action = request.query_params.get("action")
        if action:
            qs = qs.filter(action=action.upper())

        course_id = request.query_params.get("course_id")
        if course_id:
            qs = qs.filter(course_id=course_id)

        actor_id = request.query_params.get("actor_id")
        if actor_id:
            qs = qs.filter(actor_id=actor_id)

        since = request.query_params.get("since")
        if since:
            dt = parse_datetime(since)
            if dt:
                qs = qs.filter(created_at__gte=dt)

        paginator = _Pagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        ser = _EventSerializer(page, many=True)
        return paginator.get_paginated_response(ser.data)
