"""
best_epargne/apis/api_admin_reports.py — R43

Endpoints d'export CSV synchrones pour les rapports plateforme.

    GET /api/admin/reports/users.csv[?active=&role=]
    GET /api/admin/reports/courses.csv[?status=&category=]
    GET /api/admin/reports/enrollments.csv[?status=&since=&until=]
    GET /api/admin/reports/orders.csv[?status=&since=&until=]
    GET /api/admin/reports/payouts.csv[?status=]

Réservé ``is_platform_admin``. Retourne un ``StreamingHttpResponse``
CSV (UTF-8 BOM pour Excel). Limite implicite à 10 000 lignes par export
— au-delà, un job asynchrone Celery sera nécessaire (roadmap R45+).
"""
from __future__ import annotations

import csv
from datetime import datetime, date
from typing import Iterable, List

from django.contrib.auth import get_user_model
from django.http import StreamingHttpResponse
from django.utils.dateparse import parse_date
from drf_spectacular.utils import extend_schema
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from catalog.models import Course
from commerce.models import Order, Payout
from enrollments.models import Enrollment


User = get_user_model()

# Limite prudente pour éviter l'OOM sur des exports gigantesques.
MAX_EXPORT_ROWS = 10_000


def _admin_guard(request):
    if not getattr(request.user, "is_platform_admin", False):
        return Response(
            {"detail": "Réservé aux administrateurs plateforme."},
            status=403,
        )
    return None


class _Echo:
    """Buffer-like objet qui renvoie ce qu'on lui écrit — pour csv.writer."""

    def write(self, value):
        return value


def _csv_response(
    filename: str,
    header: List[str],
    row_iter: Iterable[List[object]],
) -> StreamingHttpResponse:
    """Retourne un StreamingHttpResponse CSV avec BOM UTF-8 pour Excel."""
    pseudo_buffer = _Echo()
    writer = csv.writer(pseudo_buffer, delimiter=";", quoting=csv.QUOTE_MINIMAL)

    def _stream():
        # BOM UTF-8 pour Excel Windows
        yield "﻿"
        yield writer.writerow(header)
        count = 0
        for row in row_iter:
            if count >= MAX_EXPORT_ROWS:
                yield writer.writerow(
                    ["…", f"Export tronqué à {MAX_EXPORT_ROWS} lignes."]
                )
                break
            # Convertit dates/datetimes en ISO
            yield writer.writerow(
                [
                    (
                        c.isoformat()
                        if isinstance(c, (date, datetime))
                        else ("" if c is None else str(c))
                    )
                    for c in row
                ]
            )
            count += 1

    response = StreamingHttpResponse(_stream(), content_type="text/csv; charset=utf-8")
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    response["Content-Disposition"] = (
        f'attachment; filename="{filename}_{ts}.csv"'
    )
    return response


# ─────────────────────────────────────────────────────────────
# 1) Users
# ─────────────────────────────────────────────────────────────

class ReportUsersCSVView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Rapport users CSV")
    def get(self, request):
        g = _admin_guard(request)
        if g:
            return g
        qs = User.objects.order_by("-date_joined")

        active = request.query_params.get("active")
        if active in ("true", "false", "1", "0"):
            qs = qs.filter(is_active=active in ("true", "1"))

        role = request.query_params.get("role")
        if role == "instructor":
            qs = qs.filter(instructor_profile__isnull=False)
        elif role == "learner":
            qs = qs.filter(learner_profile__isnull=False)
        elif role == "admin":
            qs = qs.filter(is_platform_admin=True)

        header = [
            "id",
            "email",
            "full_name",
            "phone",
            "is_active",
            "is_platform_admin",
            "date_joined",
            "last_login",
        ]
        rows = (
            [
                u.id,
                u.email,
                getattr(u, "full_name", "") or "",
                getattr(u, "phone", "") or "",
                u.is_active,
                getattr(u, "is_platform_admin", False),
                u.date_joined,
                u.last_login,
            ]
            for u in qs.iterator(chunk_size=500)
        )
        return _csv_response("users", header, rows)


# ─────────────────────────────────────────────────────────────
# 2) Courses
# ─────────────────────────────────────────────────────────────

class ReportCoursesCSVView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Rapport cours CSV")
    def get(self, request):
        g = _admin_guard(request)
        if g:
            return g
        qs = (
            Course.objects.select_related("category", "instructor")
            .order_by("-created_at" if hasattr(Course, "created_at") else "-id")
        )
        status = request.query_params.get("status")
        if status:
            qs = qs.filter(status=status.upper())
        category = request.query_params.get("category")
        if category and category.isdigit():
            qs = qs.filter(category_id=int(category))

        header = [
            "id",
            "title",
            "slug",
            "status",
            "course_type",
            "pricing_type",
            "price",
            "currency",
            "category",
            "instructor_email",
            "published_at",
        ]
        rows = (
            [
                c.id,
                c.title,
                c.slug,
                c.status,
                c.course_type,
                c.pricing_type,
                c.price,
                c.currency,
                getattr(c.category, "name", "") if c.category_id else "",
                getattr(c.instructor, "email", "") if c.instructor_id else "",
                c.published_at,
            ]
            for c in qs.iterator(chunk_size=500)
        )
        return _csv_response("courses", header, rows)


# ─────────────────────────────────────────────────────────────
# 3) Enrollments
# ─────────────────────────────────────────────────────────────

class ReportEnrollmentsCSVView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Rapport inscriptions CSV")
    def get(self, request):
        g = _admin_guard(request)
        if g:
            return g
        qs = (
            Enrollment.objects.select_related("user", "course")
            .order_by("-enrolled_at")
        )
        status = request.query_params.get("status")
        if status:
            qs = qs.filter(status=status.upper())
        since = request.query_params.get("since")
        if since:
            d = parse_date(since)
            if d:
                qs = qs.filter(enrolled_at__date__gte=d)
        until = request.query_params.get("until")
        if until:
            d = parse_date(until)
            if d:
                qs = qs.filter(enrolled_at__date__lte=d)

        header = [
            "id",
            "user_email",
            "user_full_name",
            "course_id",
            "course_title",
            "status",
            "progress_percent",
            "enrolled_at",
            "completed_at",
        ]
        rows = (
            [
                e.id,
                e.user.email if e.user_id else "",
                (getattr(e.user, "full_name", "") if e.user_id else ""),
                e.course_id,
                e.course.title if e.course_id else "",
                e.status,
                e.progress_percent,
                e.enrolled_at,
                e.completed_at,
            ]
            for e in qs.iterator(chunk_size=500)
        )
        return _csv_response("enrollments", header, rows)


# ─────────────────────────────────────────────────────────────
# 4) Orders (paiements)
# ─────────────────────────────────────────────────────────────

class ReportOrdersCSVView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Rapport commandes CSV")
    def get(self, request):
        g = _admin_guard(request)
        if g:
            return g
        qs = (
            Order.objects.select_related("user", "company", "coupon")
            .order_by("-created_at")
        )
        status = request.query_params.get("status")
        if status:
            qs = qs.filter(status=status.upper())
        since = request.query_params.get("since")
        if since:
            d = parse_date(since)
            if d:
                qs = qs.filter(created_at__date__gte=d)
        until = request.query_params.get("until")
        if until:
            d = parse_date(until)
            if d:
                qs = qs.filter(created_at__date__lte=d)

        header = [
            "id",
            "user_email",
            "company_name",
            "status",
            "currency",
            "subtotal",
            "discount_total",
            "total",
            "coupon_code",
            "created_at",
            "paid_at",
        ]
        rows = (
            [
                o.id,
                o.user.email if o.user_id else "",
                o.company.name if o.company_id else "",
                o.status,
                o.currency,
                o.subtotal,
                o.discount_total,
                o.total,
                o.coupon.code if o.coupon_id else "",
                o.created_at,
                o.paid_at,
            ]
            for o in qs.iterator(chunk_size=500)
        )
        return _csv_response("orders", header, rows)


# ─────────────────────────────────────────────────────────────
# 5) Payouts (reversements)
# ─────────────────────────────────────────────────────────────

class ReportPayoutsCSVView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Rapport reversements CSV")
    def get(self, request):
        g = _admin_guard(request)
        if g:
            return g
        qs = (
            Payout.objects.select_related("instructor", "validated_by")
            .order_by("-period_end")
        )
        status = request.query_params.get("status")
        if status:
            qs = qs.filter(status=status.upper())

        header = [
            "id",
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
            "payment_method",
            "payment_reference",
            "validated_by",
            "validated_at",
            "paid_at",
        ]
        rows = (
            [
                p.id,
                p.instructor.email if p.instructor_id else "",
                (getattr(p.instructor, "full_name", "") if p.instructor_id else ""),
                p.period_start,
                p.period_end,
                p.currency,
                p.gross_amount,
                p.commission_amount,
                p.tax_amount,
                p.refund_amount,
                p.net_amount,
                p.status,
                p.payment_method,
                p.payment_reference,
                p.validated_by.email if p.validated_by_id else "",
                p.validated_at,
                p.paid_at,
            ]
            for p in qs.iterator(chunk_size=500)
        )
        return _csv_response("payouts", header, rows)
