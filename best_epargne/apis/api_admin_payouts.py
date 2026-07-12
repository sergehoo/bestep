"""
best_epargne/apis/api_admin_payouts.py — R42.2

Endpoints admin des reversements formateurs (`commerce.Payout`).

    GET    /api/admin/payouts/[?status=&instructor_id=]
    POST   /api/admin/payouts/                          → créer manuellement
    PATCH  /api/admin/payouts/<id>/                     → update partiel
    POST   /api/admin/payouts/<id>/validate/            → PENDING → VALIDATED
    POST   /api/admin/payouts/<id>/mark_paid/           → VALIDATED → PAID
    POST   /api/admin/payouts/<id>/cancel/              → * → CANCELED

Réservé ``is_platform_admin``. Le workflow strict (PENDING→VALIDATED→PAID)
est appliqué côté vue. La génération automatique d'un batch mensuel est
prévue R43 (Celery Beat).
"""
from __future__ import annotations

from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status as drf_status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from commerce.models import Payout


def _guard(request):
    if not getattr(request.user, "is_platform_admin", False):
        return Response(
            {"detail": "Réservé aux administrateurs plateforme."},
            status=drf_status.HTTP_403_FORBIDDEN,
        )
    return None


class _PayoutSerializer(serializers.ModelSerializer):
    instructor_email = serializers.CharField(source="instructor.email", read_only=True)
    instructor_name = serializers.SerializerMethodField()
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    validated_by_email = serializers.CharField(
        source="validated_by.email", read_only=True, allow_null=True
    )

    class Meta:
        model = Payout
        fields = [
            "id",
            "instructor",
            "instructor_email",
            "instructor_name",
            "period_start",
            "period_end",
            "currency",
            "gross_amount",
            "commission_amount",
            "tax_amount",
            "refund_amount",
            "net_amount",
            "status",
            "status_label",
            "payment_method",
            "payment_reference",
            "validated_by",
            "validated_by_email",
            "validated_at",
            "paid_at",
            "note",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "validated_by",
            "validated_at",
            "paid_at",
        ]

    def get_instructor_name(self, obj):
        u = obj.instructor
        return getattr(u, "full_name", "") or getattr(u, "email", "")

    def validate(self, attrs):
        # Cohérence période
        ps = attrs.get("period_start", getattr(self.instance, "period_start", None))
        pe = attrs.get("period_end", getattr(self.instance, "period_end", None))
        if ps and pe and pe < ps:
            raise serializers.ValidationError(
                {"period_end": "La fin de période doit être ≥ au début."}
            )

        # Recalcul net_amount si non fourni explicitement
        if "net_amount" not in attrs:
            gross = attrs.get("gross_amount", getattr(self.instance, "gross_amount", Decimal("0")))
            commission = attrs.get(
                "commission_amount", getattr(self.instance, "commission_amount", Decimal("0"))
            )
            tax = attrs.get("tax_amount", getattr(self.instance, "tax_amount", Decimal("0")))
            refund = attrs.get(
                "refund_amount", getattr(self.instance, "refund_amount", Decimal("0"))
            )
            attrs["net_amount"] = Decimal(gross) - Decimal(commission) - Decimal(tax) - Decimal(refund)
        return attrs


class _Pagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100


class AdminPayoutsListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Admin — liste des reversements")
    def get(self, request):
        g = _guard(request)
        if g:
            return g

        qs = (
            Payout.objects.select_related("instructor", "validated_by")
            .order_by("-period_end", "-created_at")
        )

        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter.upper())

        instructor_id = request.query_params.get("instructor_id")
        if instructor_id and instructor_id.isdigit():
            qs = qs.filter(instructor_id=int(instructor_id))

        paginator = _Pagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        ser = _PayoutSerializer(page, many=True)

        # Stats agrégées
        agg = qs.aggregate(
            total_gross=Sum("gross_amount"),
            total_commission=Sum("commission_amount"),
            total_net=Sum("net_amount"),
        )
        aggregated = {
            "total": qs.count(),
            "by_status": {
                s: qs.filter(status=s).count()
                for s in ["PENDING", "VALIDATED", "PAID", "FAILED", "CANCELED"]
            },
            "total_gross": float(agg["total_gross"] or 0),
            "total_commission": float(agg["total_commission"] or 0),
            "total_net": float(agg["total_net"] or 0),
        }
        response = paginator.get_paginated_response(ser.data)
        response.data["aggregated"] = aggregated
        return response

    @extend_schema(summary="Créer un reversement (manuel)")
    def post(self, request):
        g = _guard(request)
        if g:
            return g
        ser = _PayoutSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        payout = ser.save()
        return Response(_PayoutSerializer(payout).data, status=201)


class AdminPayoutDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get(self, request, payout_id):
        try:
            return Payout.objects.get(pk=payout_id), None
        except Payout.DoesNotExist:
            return None, Response({"detail": "Introuvable."}, status=404)

    def patch(self, request, payout_id: int):
        g = _guard(request)
        if g:
            return g
        payout, err = self._get(request, payout_id)
        if err:
            return err
        if payout.status in ("PAID",):
            return Response(
                {"detail": "Impossible de modifier un reversement déjà payé."},
                status=409,
            )
        ser = _PayoutSerializer(payout, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)


class AdminPayoutValidateView(APIView):
    """PENDING → VALIDATED. Set validated_by + validated_at."""
    permission_classes = [IsAuthenticated]

    def post(self, request, payout_id: int):
        g = _guard(request)
        if g:
            return g
        try:
            payout = Payout.objects.get(pk=payout_id)
        except Payout.DoesNotExist:
            return Response({"detail": "Introuvable."}, status=404)
        if payout.status != Payout.Status.PENDING:
            return Response(
                {"detail": f"Transition invalide depuis {payout.status}."},
                status=409,
            )
        payout.status = Payout.Status.VALIDATED
        payout.validated_by = request.user
        payout.validated_at = timezone.now()
        payout.save(update_fields=["status", "validated_by", "validated_at", "updated_at"])
        return Response(_PayoutSerializer(payout).data)


class AdminPayoutMarkPaidView(APIView):
    """VALIDATED → PAID. Requiert payment_method + payment_reference."""
    permission_classes = [IsAuthenticated]

    def post(self, request, payout_id: int):
        g = _guard(request)
        if g:
            return g
        try:
            payout = Payout.objects.get(pk=payout_id)
        except Payout.DoesNotExist:
            return Response({"detail": "Introuvable."}, status=404)
        if payout.status != Payout.Status.VALIDATED:
            return Response(
                {"detail": f"Transition invalide depuis {payout.status}. Validez d'abord."},
                status=409,
            )

        method = request.data.get("payment_method", "").strip()
        reference = request.data.get("payment_reference", "").strip()
        if not method or not reference:
            return Response(
                {"detail": "payment_method et payment_reference sont requis."},
                status=400,
            )
        payout.status = Payout.Status.PAID
        payout.payment_method = method
        payout.payment_reference = reference
        payout.paid_at = timezone.now()
        payout.save(
            update_fields=[
                "status",
                "payment_method",
                "payment_reference",
                "paid_at",
                "updated_at",
            ]
        )
        return Response(_PayoutSerializer(payout).data)


class AdminPayoutCancelView(APIView):
    """Annule un reversement (sauf s'il est déjà payé)."""
    permission_classes = [IsAuthenticated]

    def post(self, request, payout_id: int):
        g = _guard(request)
        if g:
            return g
        try:
            payout = Payout.objects.get(pk=payout_id)
        except Payout.DoesNotExist:
            return Response({"detail": "Introuvable."}, status=404)
        if payout.status == Payout.Status.PAID:
            return Response(
                {"detail": "Impossible d'annuler un reversement déjà payé."},
                status=409,
            )
        payout.status = Payout.Status.CANCELED
        payout.save(update_fields=["status", "updated_at"])
        return Response(_PayoutSerializer(payout).data)
