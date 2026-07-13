"""best_epargne/apis/api_admin_platform_settings.py — R46

Endpoints admin pour piloter les paramètres plateforme persistés
(``core.PlatformSettings``). Fournit :

    GET    /api/admin/platform-settings/                → payload courant + méta
    PATCH  /api/admin/platform-settings/                → patch section(s)
    GET    /api/admin/platform-settings/history/        → journal des versions

Contrat frontend :
    payload = {
      "version": <int>,
      "updated_at": <ISO>,
      "updated_by": {"id":..., "email":...} | null,
      "data": {section: {key: value}},
      "defaults": {section: {key: default_value}},
    }

Le PATCH accepte un dict partiel ``{section: {key: value}}`` — seuls les
couples (section, clé) déjà présents dans les valeurs par défaut sont
appliqués (blanche‐liste stricte, empêche l'injection de clés arbitraires).
"""
from __future__ import annotations

from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import PlatformSettings, PlatformSettingsHistory


def _serialize_user(user):
    if not user:
        return None
    return {
        "id": user.pk,
        "email": getattr(user, "email", "") or "",
        "full_name": getattr(user, "full_name", "") or "",
    }


def _payload(settings_obj: PlatformSettings) -> dict:
    return {
        "version": settings_obj.version,
        "updated_at": settings_obj.updated_at,
        "updated_by": _serialize_user(settings_obj.updated_by),
        "data": settings_obj.merged_data(),
        "defaults": PlatformSettings.default_data(),
    }


class AdminPlatformSettingsView(APIView):
    permission_classes = [IsAuthenticated]

    def _forbidden(self):
        # SECURITE-05 — expose un ``code`` stable ROLE_FORBIDDEN.
        return Response(
            {
                "detail": "Réservé aux administrateurs plateforme.",
                "code": "ROLE_FORBIDDEN",
            },
            status=403,
        )

    @extend_schema(summary="Admin — lire les paramètres plateforme")
    def get(self, request):
        if not getattr(request.user, "is_platform_admin", False):
            return self._forbidden()
        return Response(_payload(PlatformSettings.load()))

    @extend_schema(summary="Admin — modifier les paramètres plateforme")
    def patch(self, request):
        if not getattr(request.user, "is_platform_admin", False):
            return self._forbidden()

        raw = request.data or {}
        # Le payload peut être { "patch": {...}, "note": "..." } ou
        # directement { section: {key: value} }
        if isinstance(raw, dict) and "patch" in raw and isinstance(raw["patch"], dict):
            patch = raw["patch"]
            note = str(raw.get("note", ""))[:280]
        else:
            patch = raw if isinstance(raw, dict) else {}
            note = ""

        settings_obj = PlatformSettings.load()
        history = settings_obj.apply_patch(patch, actor=request.user, note=note)

        return Response(
            {
                **_payload(settings_obj),
                "diff": history.diff_flat(),
                "history_id": history.pk,
            }
        )


class AdminPlatformSettingsHistoryView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Admin — journal des paramètres plateforme")
    def get(self, request):
        if not getattr(request.user, "is_platform_admin", False):
            return Response(
                {"detail": "Réservé aux administrateurs plateforme."},
                status=403,
            )

        try:
            limit = min(max(int(request.query_params.get("limit", 30)), 1), 200)
        except (TypeError, ValueError):
            limit = 30

        rows = (
            PlatformSettingsHistory.objects.select_related("actor")
            .order_by("-created_at", "-id")[:limit]
        )
        items = [
            {
                "id": h.pk,
                "version": h.version,
                "created_at": h.created_at,
                "actor": _serialize_user(h.actor),
                "note": h.note or "",
                "diff": h.diff_flat(),
                "diff_count": len(h.diff_flat()),
            }
            for h in rows
        ]
        return Response(
            {"generated_at": timezone.now(), "count": len(items), "results": items}
        )
