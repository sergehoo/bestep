"""
best_epargne/apis/api_admin_marketing.py — R38

Endpoints admin — Marketing / Coupons (commerce.Coupon existant).

    GET  /api/admin/marketing/coupons/[?q=&is_active=]
    POST /api/admin/marketing/coupons/
    PATCH  /api/admin/marketing/coupons/<id>/    → toggle is_active
    DELETE /api/admin/marketing/coupons/<id>/

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

from commerce.models import Coupon


class _CouponSerializer(serializers.ModelSerializer):
    class Meta:
        model = Coupon
        fields = [
            "id",
            "code",
            "is_active",
            "percent_off",
            "amount_off",
            "currency",
            "valid_from",
            "valid_to",
            "usage_limit",
            "used_count",
            "created_at",
        ]


class _Pagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100


def _admin_guard(request):
    if not getattr(request.user, "is_platform_admin", False):
        return Response(
            {"detail": "Réservé aux administrateurs plateforme."},
            status=status.HTTP_403_FORBIDDEN,
        )
    return None


class AdminCouponsListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Admin — coupons plateforme")
    def get(self, request):
        g = _admin_guard(request)
        if g:
            return g

        qs = Coupon.objects.all().order_by("-created_at")

        q = request.query_params.get("q")
        if q:
            qs = qs.filter(code__icontains=q)

        is_active = request.query_params.get("is_active")
        if is_active in ("true", "false", "1", "0"):
            qs = qs.filter(is_active=is_active in ("true", "1"))

        paginator = _Pagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        ser = _CouponSerializer(page, many=True)
        aggregated = {
            "total": qs.count(),
            "active": qs.filter(is_active=True).count(),
            "used": sum(qs.values_list("used_count", flat=True)),
        }
        response = paginator.get_paginated_response(ser.data)
        response.data["aggregated"] = aggregated
        return response

    @extend_schema(summary="Créer un coupon")
    def post(self, request):
        g = _admin_guard(request)
        if g:
            return g
        ser = _CouponSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        # Validation métier : percent_off XOR amount_off
        vd = ser.validated_data
        if not vd.get("percent_off") and not vd.get("amount_off"):
            return Response(
                {"detail": "percent_off ou amount_off requis."},
                status=400,
            )
        if vd.get("percent_off") and vd.get("amount_off"):
            return Response(
                {"detail": "Un seul de percent_off / amount_off à la fois."},
                status=400,
            )
        coupon = ser.save(created_by=request.user)
        return Response(_CouponSerializer(coupon).data, status=201)


class AdminCouponDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, coupon_id: int):
        g = _admin_guard(request)
        if g:
            return g
        try:
            c = Coupon.objects.get(pk=coupon_id)
        except Coupon.DoesNotExist:
            return Response({"detail": "Introuvable."}, status=404)
        ser = _CouponSerializer(c, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)

    def delete(self, request, coupon_id: int):
        g = _admin_guard(request)
        if g:
            return g
        try:
            c = Coupon.objects.get(pk=coupon_id)
        except Coupon.DoesNotExist:
            return Response(status=204)
        if c.used_count > 0:
            return Response(
                {"detail": "Impossible de supprimer un coupon déjà utilisé. Désactivez-le."},
                status=409,
            )
        c.delete()
        return Response(status=204)
