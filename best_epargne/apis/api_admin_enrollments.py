"""
best_epargne/apis/api_admin_enrollments.py — R28.5

Endpoint admin pour superviser toutes les inscriptions de la plateforme.

    GET /api/admin/enrollments/[?status=X&course_id=Y&user_id=Z]

Nécessite ``is_platform_admin``. Retourne une liste paginée avec
progression et statut.
"""
from __future__ import annotations

from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from enrollments.models import Enrollment


class _EnrollmentSerializer(serializers.ModelSerializer):
    course_id = serializers.IntegerField(source="course.id", read_only=True)
    course_slug = serializers.CharField(source="course.slug", read_only=True)
    course_title = serializers.CharField(source="course.title", read_only=True)
    user_id = serializers.IntegerField(source="user.id", read_only=True)
    user_email = serializers.CharField(source="user.email", read_only=True)
    user_full_name = serializers.SerializerMethodField()

    class Meta:
        model = Enrollment
        fields = [
            "id",
            "user_id",
            "user_email",
            "user_full_name",
            "course_id",
            "course_slug",
            "course_title",
            "status",
            "progress_percent",
            "enrolled_at",
            "completed_at",
            "updated_at",
        ]

    def get_user_full_name(self, obj) -> str:
        u = obj.user
        return getattr(u, "full_name", None) or getattr(u, "email", "")


class _Pagination(PageNumberPagination):
    page_size = 30
    page_size_query_param = "page_size"
    max_page_size = 100


class AdminEnrollmentsListView(APIView):
    """Liste paginée + filtres des inscriptions."""
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Admin — toutes les inscriptions plateforme")
    def get(self, request):
        if not getattr(request.user, "is_platform_admin", False):
            return Response(
                {"detail": "Réservé aux administrateurs plateforme."},
                status=status.HTTP_403_FORBIDDEN,
            )

        qs = (
            Enrollment.objects.select_related("user", "course")
            .order_by("-enrolled_at")
        )

        status_ = request.query_params.get("status")
        if status_:
            qs = qs.filter(status=status_.upper())

        course_id = request.query_params.get("course_id")
        if course_id:
            qs = qs.filter(course_id=course_id)

        user_id = request.query_params.get("user_id")
        if user_id:
            qs = qs.filter(user_id=user_id)

        q = request.query_params.get("q")
        if q:
            qs = qs.filter(
                # Recherche sur email user ou titre cours
                # (index déjà en place sur course.title côté catalog).
                user__email__icontains=q,
            )

        paginator = _Pagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        ser = _EnrollmentSerializer(page, many=True)

        # Stats agrégées (headers optionnels pour la page front)
        aggregated = {
            "total": qs.count(),
        }
        response = paginator.get_paginated_response(ser.data)
        response.data["aggregated"] = aggregated
        return response
