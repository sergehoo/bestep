"""best_epargne/apis/api_admin_audit_security.py — SECURITE-06.

Endpoint unifié listant tous les événements de sécurité admin :

    GET /api/admin/audit/security/[?kind=X&admin_id=N&days=30&page=1]

Kinds inclus :
    - INSTRUCTOR_APPROVED
    - INSTRUCTOR_REJECTED
    - USER_SUSPENDED
    - USER_REACTIVATED
    - USER_ROLE_CHANGED
    - EMAIL_FORCE_VERIFIED

Réservé aux administrateurs plateforme.
"""
from __future__ import annotations

import csv
from datetime import timedelta
from io import StringIO

from django.contrib.auth import get_user_model
from django.http import HttpResponse
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView


User = get_user_model()

SECURITY_KINDS = [
    "INSTRUCTOR_APPROVED",
    "INSTRUCTOR_REJECTED",
    "USER_SUSPENDED",
    "USER_REACTIVATED",
    "USER_ROLE_CHANGED",
    "EMAIL_FORCE_VERIFIED",
]


def _forbidden():
    return Response(
        {
            "detail": "Réservé aux administrateurs plateforme.",
            "code": "ROLE_FORBIDDEN",
        },
        status=status.HTTP_403_FORBIDDEN,
    )


class _Pagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100


class AdminSecurityAuditView(APIView):
    """Liste paginée des événements de sécurité, filtrable.

    Params :
        - kind        : restreint à un kind (parmi ``SECURITY_KINDS``)
        - admin_id    : événements générés par un admin donné
        - days        : fenêtre glissante en jours (défaut 90, max 365)
    """
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Admin — Audit des événements de sécurité")
    def get(self, request):
        if not getattr(request.user, "is_platform_admin", False):
            return _forbidden()
        try:
            from ai.models import AIAuditLog
        except Exception:
            return Response({"count": 0, "results": [], "aggregated": {}})

        qs = AIAuditLog.objects.filter(kind__in=SECURITY_KINDS).select_related("user")

        # Filtre par kind
        kind = (request.query_params.get("kind") or "").strip().upper()
        if kind and kind in SECURITY_KINDS:
            qs = qs.filter(kind=kind)

        # Filtre par admin auteur
        admin_id = request.query_params.get("admin_id")
        if admin_id and str(admin_id).isdigit():
            qs = qs.filter(user_id=int(admin_id))

        # Fenêtre temporelle
        try:
            days = int(request.query_params.get("days") or 90)
        except (TypeError, ValueError):
            days = 90
        days = max(1, min(days, 365))
        since = timezone.now() - timedelta(days=days)
        qs = qs.filter(created_at__gte=since).order_by("-created_at", "-id")

        # Agrégations pour le header
        aggregated = {"total": qs.count(), "by_kind": {}}
        for k in SECURITY_KINDS:
            aggregated["by_kind"][k] = qs.filter(kind=k).count()

        paginator = _Pagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        results = []
        for row in page:
            payload = row.payload or {}
            results.append({
                "id": row.id,
                "kind": row.kind,
                "created_at": row.created_at.isoformat(),
                "admin": {
                    "id": row.user_id,
                    "email": row.user.email if row.user else None,
                },
                "target": {
                    "user_id": payload.get("target_user_id"),
                    "email": payload.get("target_email"),
                },
                "payload": payload,
            })
        response = paginator.get_paginated_response(results)
        response.data["aggregated"] = aggregated
        response.data["window_days"] = days
        return response


class AdminSecurityAuditExportCSVView(APIView):
    """GET /api/admin/audit/security/export/ — Export CSV filtrable.

    Retourne un ``text/csv`` avec les mêmes filtres que la vue liste
    (``kind``, ``admin_id``, ``days``). Limité à 10 000 lignes pour
    éviter les gros dumps qui satureraient la mémoire.
    """
    permission_classes = [IsAuthenticated]
    MAX_ROWS = 10_000

    @extend_schema(summary="Admin — Export CSV audit sécurité")
    def get(self, request):
        if not getattr(request.user, "is_platform_admin", False):
            return _forbidden()
        try:
            from ai.models import AIAuditLog
        except Exception:
            return HttpResponse(
                "", content_type="text/csv",
                headers={
                    "Content-Disposition": "attachment; filename=audit-security.csv",
                },
            )

        qs = AIAuditLog.objects.filter(
            kind__in=SECURITY_KINDS
        ).select_related("user")

        kind = (request.query_params.get("kind") or "").strip().upper()
        if kind and kind in SECURITY_KINDS:
            qs = qs.filter(kind=kind)

        admin_id = request.query_params.get("admin_id")
        if admin_id and str(admin_id).isdigit():
            qs = qs.filter(user_id=int(admin_id))

        try:
            days = int(request.query_params.get("days") or 90)
        except (TypeError, ValueError):
            days = 90
        days = max(1, min(days, 365))
        since = timezone.now() - timedelta(days=days)
        qs = qs.filter(created_at__gte=since).order_by("-created_at", "-id")[
            : self.MAX_ROWS
        ]

        buf = StringIO()
        writer = csv.writer(buf, delimiter=",", quoting=csv.QUOTE_MINIMAL)
        writer.writerow([
            "id",
            "date_iso",
            "kind",
            "admin_id",
            "admin_email",
            "target_user_id",
            "target_email",
            "previous_role",
            "new_role",
            "previous_is_active",
            "new_is_active",
            "reason",
        ])
        for row in qs.iterator(chunk_size=500):
            payload = row.payload or {}
            writer.writerow([
                row.id,
                row.created_at.isoformat(),
                row.kind,
                row.user_id or "",
                (row.user.email if row.user else ""),
                payload.get("target_user_id", ""),
                payload.get("target_email", ""),
                payload.get("previous_role", ""),
                payload.get("new_role", ""),
                payload.get("previous_is_active", ""),
                payload.get("new_is_active", ""),
                payload.get("reason", ""),
            ])

        filename = f"audit-security-{timezone.now().strftime('%Y%m%d-%H%M%S')}.csv"
        resp = HttpResponse(buf.getvalue(), content_type="text/csv; charset=utf-8")
        resp["Content-Disposition"] = f'attachment; filename="{filename}"'
        return resp
