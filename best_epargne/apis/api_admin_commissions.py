"""
best_epargne/apis/api_admin_commissions.py — R41.2

CRUD des règles de commission plateforme + simulateur.

    GET    /api/admin/commissions/
    POST   /api/admin/commissions/
    PATCH  /api/admin/commissions/<id>/
    DELETE /api/admin/commissions/<id>/
    POST   /api/admin/commissions/simulate/  body: {course_id?, instructor_id?, amount}

Réservé ``is_platform_admin``.
"""
from __future__ import annotations

from decimal import Decimal

from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from catalog.models import Category, Course
from commerce.models import CommissionRule


def _guard(request):
    if not getattr(request.user, "is_platform_admin", False):
        return Response(
            {"detail": "Réservé aux administrateurs plateforme."},
            status=status.HTTP_403_FORBIDDEN,
        )
    return None


class _RuleSerializer(serializers.ModelSerializer):
    instructor_email = serializers.CharField(
        source="instructor.email", read_only=True, allow_null=True
    )
    instructor_name = serializers.SerializerMethodField()
    category_name = serializers.CharField(
        source="category.name", read_only=True, allow_null=True
    )
    course_title = serializers.CharField(
        source="course.title", read_only=True, allow_null=True
    )
    course_slug = serializers.CharField(
        source="course.slug", read_only=True, allow_null=True
    )
    scope_label = serializers.CharField(
        source="get_scope_display", read_only=True
    )

    class Meta:
        model = CommissionRule
        fields = [
            "id",
            "name",
            "scope",
            "scope_label",
            "percent",
            "instructor",
            "instructor_email",
            "instructor_name",
            "category",
            "category_name",
            "course",
            "course_title",
            "course_slug",
            "is_active",
            "note",
            "created_at",
            "updated_at",
        ]

    def get_instructor_name(self, obj):
        if not obj.instructor_id:
            return None
        u = obj.instructor
        return getattr(u, "full_name", "") or getattr(u, "email", "")

    def validate(self, attrs):
        scope = attrs.get("scope", getattr(self.instance, "scope", None))
        instructor = attrs.get("instructor")
        category = attrs.get("category")
        course = attrs.get("course")

        # Cohérence scope / FK
        expectations = {
            "DEFAULT": (None, None, None),
            "INSTRUCTOR": ("required", None, None),
            "CATEGORY": (None, "required", None),
            "COURSE": (None, None, "required"),
        }.get(scope)
        if expectations is None:
            raise serializers.ValidationError({"scope": "Scope invalide."})
        exp_i, exp_c, exp_co = expectations
        if exp_i == "required" and not instructor:
            raise serializers.ValidationError(
                {"instructor": "Requis pour scope INSTRUCTOR."}
            )
        if exp_c == "required" and not category:
            raise serializers.ValidationError(
                {"category": "Requis pour scope CATEGORY."}
            )
        if exp_co == "required" and not course:
            raise serializers.ValidationError(
                {"course": "Requis pour scope COURSE."}
            )
        # Efface les FK non-utilisées selon le scope
        if scope == "DEFAULT":
            attrs["instructor"] = None
            attrs["category"] = None
            attrs["course"] = None
        elif scope == "INSTRUCTOR":
            attrs["category"] = None
            attrs["course"] = None
        elif scope == "CATEGORY":
            attrs["instructor"] = None
            attrs["course"] = None
        elif scope == "COURSE":
            attrs["instructor"] = None
            attrs["category"] = None

        return attrs


class _Pagination(PageNumberPagination):
    page_size = 30
    page_size_query_param = "page_size"
    max_page_size = 100


class AdminCommissionsListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Admin — liste des règles de commission")
    def get(self, request):
        g = _guard(request)
        if g:
            return g

        qs = CommissionRule.objects.select_related(
            "instructor", "category", "course"
        ).order_by("scope", "-created_at")

        scope = request.query_params.get("scope")
        if scope:
            qs = qs.filter(scope=scope.upper())

        active = request.query_params.get("is_active")
        if active in ("true", "false", "1", "0"):
            qs = qs.filter(is_active=active in ("true", "1"))

        paginator = _Pagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        ser = _RuleSerializer(page, many=True)

        # Stats globales
        active_qs = CommissionRule.objects.filter(is_active=True)
        default_rule = active_qs.filter(scope="DEFAULT").first()
        aggregated = {
            "total": qs.count(),
            "active": active_qs.count(),
            "default_percent": (
                float(default_rule.percent) if default_rule else None
            ),
            "by_scope": {
                s: active_qs.filter(scope=s).count()
                for s in ["DEFAULT", "INSTRUCTOR", "CATEGORY", "COURSE"]
            },
        }
        response = paginator.get_paginated_response(ser.data)
        response.data["aggregated"] = aggregated
        return response

    @extend_schema(summary="Créer une règle de commission")
    def post(self, request):
        g = _guard(request)
        if g:
            return g
        ser = _RuleSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        rule = ser.save()
        return Response(_RuleSerializer(rule).data, status=201)


class AdminCommissionDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, rule_id: int):
        g = _guard(request)
        if g:
            return g
        try:
            rule = CommissionRule.objects.get(pk=rule_id)
        except CommissionRule.DoesNotExist:
            return Response({"detail": "Introuvable."}, status=404)
        ser = _RuleSerializer(rule, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)

    def delete(self, request, rule_id: int):
        g = _guard(request)
        if g:
            return g
        try:
            rule = CommissionRule.objects.get(pk=rule_id)
        except CommissionRule.DoesNotExist:
            return Response(status=204)
        if rule.scope == "DEFAULT" and CommissionRule.objects.filter(
            scope="DEFAULT", is_active=True
        ).count() <= 1:
            return Response(
                {
                    "detail": "Impossible de supprimer la dernière règle DEFAULT active. "
                    "Créez d'abord une nouvelle règle par défaut."
                },
                status=409,
            )
        rule.delete()
        return Response(status=204)


class AdminCommissionSimulateView(APIView):
    """Simule le calcul commission/reversement pour un montant + cours."""

    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Admin — simuler un calcul de commission")
    def post(self, request):
        g = _guard(request)
        if g:
            return g

        amount = request.data.get("amount")
        if amount is None:
            return Response({"detail": "amount requis."}, status=400)
        try:
            amount_dec = Decimal(str(amount))
            if amount_dec < 0:
                raise ValueError
        except Exception:
            return Response({"detail": "amount invalide."}, status=400)

        course = None
        instructor = None
        course_id = request.data.get("course_id")
        if course_id:
            try:
                course = Course.objects.select_related("category", "instructor").get(
                    pk=course_id
                )
                if not instructor:
                    instructor = getattr(course, "instructor", None)
            except Course.DoesNotExist:
                return Response({"detail": "Cours introuvable."}, status=404)

        instructor_id = request.data.get("instructor_id")
        if instructor_id and not instructor:
            from django.contrib.auth import get_user_model

            User = get_user_model()
            try:
                instructor = User.objects.get(pk=instructor_id)
            except User.DoesNotExist:
                return Response({"detail": "Formateur introuvable."}, status=404)

        rule = CommissionRule.resolve_for(course=course, instructor=instructor)
        if not rule:
            return Response(
                {
                    "detail": "Aucune règle DEFAULT active — configurez au moins "
                    "une règle de commission avant de vendre.",
                },
                status=409,
            )

        percent = rule.percent
        platform_share = (amount_dec * percent) / Decimal(100)
        instructor_share = amount_dec - platform_share

        return Response(
            {
                "rule": _RuleSerializer(rule).data,
                "amount": str(amount_dec),
                "percent": str(percent),
                "platform_share": str(platform_share.quantize(Decimal("0.01"))),
                "instructor_share": str(instructor_share.quantize(Decimal("0.01"))),
            }
        )
