"""
best_epargne/apis/api_admin_moderation.py — R32.1

Endpoints admin de modération des avis (`reviews.CourseReview`).

    GET    /api/admin/reviews/[?rating=&is_public=&q=]
    PATCH  /api/admin/reviews/<id>/    → toggle is_public (hide/restore)
    DELETE /api/admin/reviews/<id>/    → suppression définitive

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

from reviews.models import CourseReview


class _ReviewSerializer(serializers.ModelSerializer):
    user_email = serializers.CharField(source="user.email", read_only=True)
    user_full_name = serializers.SerializerMethodField()
    course_title = serializers.CharField(source="course.title", read_only=True)
    course_slug = serializers.CharField(source="course.slug", read_only=True)

    class Meta:
        model = CourseReview
        fields = [
            "id",
            "course",
            "course_title",
            "course_slug",
            "user",
            "user_email",
            "user_full_name",
            "rating",
            "comment",
            "is_public",
            "created_at",
            "updated_at",
        ]

    def get_user_full_name(self, obj):
        u = obj.user
        return getattr(u, "full_name", "") or getattr(u, "email", "")


class _Pagination(PageNumberPagination):
    page_size = 30
    page_size_query_param = "page_size"
    max_page_size = 100


class AdminReviewsListView(APIView):
    permission_classes = [IsAuthenticated]

    def _guard(self, request):
        if not getattr(request.user, "is_platform_admin", False):
            return Response(
                {"detail": "Réservé aux administrateurs plateforme."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return None

    @extend_schema(summary="Modération — liste des avis")
    def get(self, request):
        g = self._guard(request)
        if g:
            return g

        qs = CourseReview.objects.select_related("user", "course").order_by("-created_at")

        rating = request.query_params.get("rating")
        if rating and rating.isdigit():
            qs = qs.filter(rating=int(rating))

        is_public = request.query_params.get("is_public")
        if is_public in ("true", "false", "1", "0"):
            qs = qs.filter(is_public=is_public in ("true", "1"))

        q = request.query_params.get("q")
        if q:
            qs = qs.filter(
                Q(comment__icontains=q)
                | Q(user__email__icontains=q)
                | Q(course__title__icontains=q),
            )

        paginator = _Pagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        ser = _ReviewSerializer(page, many=True)
        aggregated = {
            "total": qs.count(),
            "hidden": qs.filter(is_public=False).count(),
            "low_rating": qs.filter(rating__lte=2).count(),
        }
        response = paginator.get_paginated_response(ser.data)
        response.data["aggregated"] = aggregated
        return response


class AdminReviewDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _guard(self, request):
        if not getattr(request.user, "is_platform_admin", False):
            return Response({"detail": "Réservé aux admins plateforme."}, status=403)
        return None

    def patch(self, request, review_id: int):
        g = self._guard(request)
        if g:
            return g
        try:
            r = CourseReview.objects.get(pk=review_id)
        except CourseReview.DoesNotExist:
            return Response({"detail": "Introuvable."}, status=404)
        if "is_public" in request.data:
            r.is_public = bool(request.data["is_public"])
            r.save(update_fields=["is_public", "updated_at"])
        return Response(_ReviewSerializer(r).data)

    def delete(self, request, review_id: int):
        g = self._guard(request)
        if g:
            return g
        try:
            r = CourseReview.objects.get(pk=review_id)
        except CourseReview.DoesNotExist:
            return Response(status=204)
        r.delete()
        return Response(status=204)
