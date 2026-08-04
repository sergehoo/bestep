"""
best_epargne/apis/api_admin_organizations.py — R31.1

Endpoint admin de supervision des organisations clientes.

    GET   /api/admin/organizations/[?q=X&active=true]
    PATCH /api/admin/organizations/<id>/    → toggle is_active

Réservé ``is_platform_admin``.
"""
from __future__ import annotations

from django.db.models import Count, Q
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from organizations.models import Organization


class _OrgSerializer(serializers.ModelSerializer):
    members_count = serializers.IntegerField(read_only=True)
    active_members_count = serializers.IntegerField(read_only=True)
    courses_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Organization
        fields = [
            "id",
            "name",
            "slug",
            "legal_name",
            "email",
            "phone",
            "country",
            "city",
            "is_active",
            "created_at",
            "updated_at",
            "members_count",
            "active_members_count",
            "courses_count",
        ]


class _Pagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100


class AdminOrganizationsListView(APIView):
    permission_classes = [IsAuthenticated]

    def _check(self, request):
        if not getattr(request.user, "is_platform_admin", False):
            return Response(
                {"detail": "Réservé aux administrateurs plateforme."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return None

    @extend_schema(summary="Liste des organisations plateforme")
    def get(self, request):
        guard = self._check(request)
        if guard:
            return guard

        qs = (
            Organization.objects.annotate(
                members_count=Count("memberships", distinct=True),
                active_members_count=Count(
                    "memberships",
                    filter=Q(memberships__is_active=True),
                    distinct=True,
                ),
                # Le related_name de Course vers Organization est
                # `internal_courses` (catalog/models.py:83), pas `courses`.
                # `Count("courses")` levait un FieldError et renvoyait un 500
                # sur toute la page /admin/organizations.
                courses_count=Count("internal_courses", distinct=True),
            )
            .order_by("name")
        )

        q = request.query_params.get("q")
        if q:
            qs = qs.filter(Q(name__icontains=q) | Q(legal_name__icontains=q) | Q(email__icontains=q))

        active = request.query_params.get("active")
        if active in ("true", "false", "1", "0"):
            qs = qs.filter(is_active=active in ("true", "1"))

        paginator = _Pagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        ser = _OrgSerializer(page, many=True)
        aggregated = {
            "total": qs.count(),
            "active": qs.filter(is_active=True).count(),
        }
        response = paginator.get_paginated_response(ser.data)
        response.data["aggregated"] = aggregated
        return response


class AdminOrganizationDetailView(APIView):
    """Toggle is_active pour une organisation."""

    permission_classes = [IsAuthenticated]

    def patch(self, request, org_id: int):
        if not getattr(request.user, "is_platform_admin", False):
            return Response({"detail": "Réservé aux admins plateforme."}, status=403)
        try:
            org = Organization.objects.get(pk=org_id)
        except Organization.DoesNotExist:
            return Response({"detail": "Introuvable."}, status=404)

        if "is_active" in request.data:
            org.is_active = bool(request.data["is_active"])
            org.save(update_fields=["is_active", "updated_at"])

        return Response({"id": org.id, "is_active": org.is_active})
