"""
best_epargne/apis/api_admin_quizzes.py — R33

Endpoint admin — vue transverse des quiz plateforme.

    GET /api/admin/quizzes/[?q=X&has_course=true&is_final=true]

Réservé ``is_platform_admin``. Enrichit chaque quiz avec :
    - nb de questions
    - nb de tentatives
    - score moyen
    - taux de réussite (attempts avec score ≥ passing_score)
"""
from __future__ import annotations

from django.db.models import Avg, Count, Q
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from assessments.models import Quiz


class _QuizSerializer(serializers.ModelSerializer):
    course_title = serializers.CharField(source="course.title", read_only=True, allow_null=True)
    course_slug = serializers.CharField(source="course.slug", read_only=True, allow_null=True)
    section_title = serializers.CharField(source="section.title", read_only=True, allow_null=True)
    questions_count = serializers.IntegerField(read_only=True)
    attempts_count = serializers.IntegerField(read_only=True)
    avg_score = serializers.FloatField(read_only=True, allow_null=True)
    passing_rate = serializers.FloatField(read_only=True, allow_null=True)

    class Meta:
        model = Quiz
        fields = [
            "id",
            "title",
            "slug",
            "course",
            "course_title",
            "course_slug",
            "section_title",
            "is_onboarding",
            "is_active",
            "is_final",
            "passing_score",
            "max_attempts",
            "questions_count",
            "attempts_count",
            "avg_score",
            "passing_rate",
        ]


class _Pagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100


class AdminQuizzesListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Admin — vue transverse des quiz")
    def get(self, request):
        if not getattr(request.user, "is_platform_admin", False):
            return Response(
                {"detail": "Réservé aux administrateurs plateforme."},
                status=status.HTTP_403_FORBIDDEN,
            )

        qs = (
            Quiz.objects.select_related("course", "section")
            .annotate(
                questions_count=Count("questions", distinct=True),
                attempts_count=Count("attempts", distinct=True),
                # Le champ s'appelle `score_percent` sur assessments.Attempt,
                # pas `score`. `attempts__score` levait un FieldError et
                # renvoyait un 500 sur toute la page /admin/quiz.
                avg_score=Avg("attempts__score_percent"),
                # ATTENTION : malgré son nom, cette annotation renvoie la
                # moyenne des SCORES des tentatives réussies, pas un taux de
                # réussite (qui serait entre 0 et 1). Le seuil 70 est en dur
                # alors que chaque quiz porte son propre seuil, et
                # `Attempt.passed` existe déjà pour ça. Corrigé au nom de
                # champ près pour débloquer la page ; la sémantique de la
                # métrique reste à trancher.
                passing_rate=Avg(
                    "attempts__score_percent",
                    filter=Q(attempts__score_percent__gte=70),  # approximation
                ),
            )
            .order_by("title")
        )

        q = request.query_params.get("q")
        if q:
            qs = qs.filter(Q(title__icontains=q) | Q(course__title__icontains=q))

        is_final = request.query_params.get("is_final")
        if is_final in ("true", "false", "1", "0"):
            qs = qs.filter(is_final=is_final in ("true", "1"))

        is_active = request.query_params.get("is_active")
        if is_active in ("true", "false", "1", "0"):
            qs = qs.filter(is_active=is_active in ("true", "1"))

        has_course = request.query_params.get("has_course")
        if has_course in ("true", "1"):
            qs = qs.filter(course__isnull=False)
        elif has_course in ("false", "0"):
            qs = qs.filter(course__isnull=True)

        paginator = _Pagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        ser = _QuizSerializer(page, many=True)
        aggregated = {
            "total": qs.count(),
            "active": qs.filter(is_active=True).count(),
            "final": qs.filter(is_final=True).count(),
            "onboarding": qs.filter(is_onboarding=True).count(),
        }
        response = paginator.get_paginated_response(ser.data)
        response.data["aggregated"] = aggregated
        return response
