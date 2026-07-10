"""
best_epargne/apis/api_admin_content.py — R35

Endpoint admin — vue transverse du contenu pédagogique.

    GET /api/admin/content/lessons/[?q=X&lesson_type=&course_id=]

Réservé ``is_platform_admin``. Retourne les leçons de tous les cours
avec titre + type + durée + cours + section.
"""
from __future__ import annotations

from django.db.models import Q
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from catalog.models import Lesson


class _LessonSerializer(serializers.ModelSerializer):
    course_id = serializers.IntegerField(source="section.course.id", read_only=True)
    course_title = serializers.CharField(source="section.course.title", read_only=True)
    course_slug = serializers.CharField(source="section.course.slug", read_only=True)
    section_title = serializers.CharField(source="section.title", read_only=True)
    section_order = serializers.IntegerField(source="section.order", read_only=True)
    lesson_type_label = serializers.CharField(source="get_lesson_type_display", read_only=True)

    class Meta:
        model = Lesson
        fields = [
            "id",
            "title",
            "order",
            "lesson_type",
            "lesson_type_label",
            "is_preview",
            "duration_sec",
            "course_id",
            "course_title",
            "course_slug",
            "section_title",
            "section_order",
        ]


class _Pagination(PageNumberPagination):
    page_size = 40
    page_size_query_param = "page_size"
    max_page_size = 100


class AdminContentLessonsView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Admin — leçons transverses plateforme")
    def get(self, request):
        if not getattr(request.user, "is_platform_admin", False):
            return Response(
                {"detail": "Réservé aux administrateurs plateforme."},
                status=status.HTTP_403_FORBIDDEN,
            )

        qs = (
            Lesson.objects.select_related("section", "section__course")
            .order_by("section__course__title", "section__order", "order")
        )

        q = request.query_params.get("q")
        if q:
            qs = qs.filter(
                Q(title__icontains=q)
                | Q(section__title__icontains=q)
                | Q(section__course__title__icontains=q),
            )

        lesson_type = request.query_params.get("lesson_type")
        if lesson_type:
            qs = qs.filter(lesson_type=lesson_type.upper())

        course_id = request.query_params.get("course_id")
        if course_id and course_id.isdigit():
            qs = qs.filter(section__course_id=int(course_id))

        paginator = _Pagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        ser = _LessonSerializer(page, many=True)

        # Stats agrégées par type de leçon
        from django.db.models import Count
        by_type = list(
            Lesson.objects.values("lesson_type").annotate(count=Count("id"))
        )
        aggregated = {
            "total": qs.count(),
            "by_type": {row["lesson_type"]: row["count"] for row in by_type},
        }
        response = paginator.get_paginated_response(ser.data)
        response.data["aggregated"] = aggregated
        return response
