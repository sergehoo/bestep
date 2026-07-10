"""
best_epargne/apis/api_admin_payments.py — R37.1

Endpoint admin — vue transverse des Orders (paiements) plateforme.

    GET /api/admin/payments/[?status=&user_id=&company_id=&q=]

Réservé ``is_platform_admin``. Retourne les Orders enrichies avec items
+ user + company + stats agrégées (total revenus, comptes par statut).
"""
from __future__ import annotations

from django.db.models import Q, Sum
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from commerce.models import Order


class _OrderSerializer(serializers.ModelSerializer):
    user_email = serializers.CharField(source="user.email", read_only=True, allow_null=True)
    user_full_name = serializers.SerializerMethodField()
    company_name = serializers.CharField(source="company.name", read_only=True, allow_null=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    items_count = serializers.IntegerField(read_only=True)
    coupon_code = serializers.CharField(source="coupon.code", read_only=True, allow_null=True)

    class Meta:
        model = Order
        fields = [
            "id",
            "user",
            "user_email",
            "user_full_name",
            "company",
            "company_name",
            "status",
            "status_label",
            "currency",
            "subtotal",
            "discount_total",
            "total",
            "coupon",
            "coupon_code",
            "items_count",
            "created_at",
            "paid_at",
        ]

    def get_user_full_name(self, obj):
        if not obj.user_id:
            return ""
        u = obj.user
        return getattr(u, "full_name", "") or getattr(u, "email", "")


class _Pagination(PageNumberPagination):
    page_size = 30
    page_size_query_param = "page_size"
    max_page_size = 100


class AdminPaymentsListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Admin — paiements plateforme")
    def get(self, request):
        if not getattr(request.user, "is_platform_admin", False):
            return Response(
                {"detail": "Réservé aux administrateurs plateforme."},
                status=status.HTTP_403_FORBIDDEN,
            )

        from django.db.models import Count

        qs = (
            Order.objects.select_related("user", "company", "coupon")
            .annotate(items_count=Count("items", distinct=True))
            .order_by("-created_at")
        )

        status_ = request.query_params.get("status")
        if status_:
            qs = qs.filter(status=status_.upper())

        user_id = request.query_params.get("user_id")
        if user_id and user_id.isdigit():
            qs = qs.filter(user_id=int(user_id))

        company_id = request.query_params.get("company_id")
        if company_id and company_id.isdigit():
            qs = qs.filter(company_id=int(company_id))

        q = request.query_params.get("q")
        if q:
            qs = qs.filter(
                Q(user__email__icontains=q)
                | Q(company__name__icontains=q)
                | Q(coupon__code__icontains=q),
            )

        paginator = _Pagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        ser = _OrderSerializer(page, many=True)

        # Stats agrégées (toute la QS filtrée)
        agg_qs = qs
        by_status = {}
        for row in agg_qs.values("status").annotate(count=Count("id"), total=Sum("total")):
            by_status[row["status"]] = {
                "count": row["count"],
                "total": float(row["total"] or 0),
            }
        revenue_paid = float(
            agg_qs.filter(status=Order.Status.PAID).aggregate(t=Sum("total"))["t"] or 0
        )
        aggregated = {
            "total_orders": agg_qs.count(),
            "revenue_paid": revenue_paid,
            "by_status": by_status,
        }
        response = paginator.get_paginated_response(ser.data)
        response.data["aggregated"] = aggregated
        return response
