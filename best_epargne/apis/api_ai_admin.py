"""best_epargne/apis/api_ai_admin.py — Centre admin IA (Phase 6).

Endpoints — TOUS restreints à ``is_platform_admin`` :

    GET  /api/ai/admin/overview/           KPI + top users + top tools + coûts
    GET/POST         /api/ai/admin/providers/
    GET/PATCH/DELETE /api/ai/admin/providers/<id>/
    POST /api/ai/admin/providers/<id>/test/         Test de connexion
    GET/POST         /api/ai/admin/models/
    GET/PATCH/DELETE /api/ai/admin/models/<id>/
    GET/POST         /api/ai/admin/quotas/
    GET/PATCH/DELETE /api/ai/admin/quotas/<id>/
    GET  /api/ai/admin/audit-logs/         Journaux filtrés paginés
    GET  /api/ai/admin/usage/              AIUsageRecord paginés
    POST /api/ai/image-generate/           Image gen (stub)
"""
from __future__ import annotations

from datetime import timedelta

from django.db.models import Count, Q, Sum
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ai.models import (
    AIAuditLog,
    AIImageGeneration,
    AIModel,
    AIProvider,
    AIQuota,
    AIUsageRecord,
)


def _forbidden():
    return Response(
        {"detail": "Réservé aux administrateurs plateforme."},
        status=status.HTTP_403_FORBIDDEN,
    )


def _client_ip(request):
    x = request.META.get("HTTP_X_FORWARDED_FOR")
    if x:
        return x.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def _admin_only(user) -> bool:
    return bool(user and user.is_authenticated and getattr(user, "is_platform_admin", False))


# ─────────────────────────────────────────────────────────────
# Overview
# ─────────────────────────────────────────────────────────────


class AIAdminOverviewView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Cockpit admin IA — KPIs consolidés")
    def get(self, request):
        if not _admin_only(request.user):
            return _forbidden()
        now = timezone.now()
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        seven_days_ago = now - timedelta(days=7)

        usage_qs = AIUsageRecord.objects.all()
        this_month = usage_qs.filter(created_at__gte=month_start)
        last_7d = usage_qs.filter(created_at__gte=seven_days_ago)

        def _agg(qs):
            return qs.aggregate(
                calls=Count("id"),
                input_tokens=Sum("input_tokens"),
                output_tokens=Sum("output_tokens"),
                cost=Sum("cost_usd"),
            )

        month_agg = _agg(this_month)
        week_agg = _agg(last_7d)
        total_agg = _agg(usage_qs)

        # Top users this month
        top_users = list(
            this_month.exclude(user__isnull=True)
            .values("user_id", "user__email")
            .annotate(calls=Count("id"), tokens=Sum("output_tokens"))
            .order_by("-calls")[:5]
        )

        # Top models
        top_models = list(
            this_month.values("provider", "model_name")
            .annotate(calls=Count("id"))
            .order_by("-calls")[:5]
        )

        # Providers count
        providers_active = AIProvider.objects.filter(is_active=True).count()
        providers_total = AIProvider.objects.count()

        # Quotas actifs
        quotas_active = AIQuota.objects.filter(is_active=True).count()

        # Approvals pendantes
        try:
            from ai.models import AIActionApproval
            approvals_pending = AIActionApproval.objects.filter(status="PENDING").count()
        except Exception:
            approvals_pending = 0

        # KB docs
        try:
            from ai.models import AIKnowledgeDocument
            kb_documents = AIKnowledgeDocument.objects.count()
            kb_indexed = AIKnowledgeDocument.objects.filter(status="INDEXED").count()
        except Exception:
            kb_documents = kb_indexed = 0

        return Response(
            {
                "generated_at": now,
                "month": {
                    "calls": month_agg["calls"] or 0,
                    "input_tokens": month_agg["input_tokens"] or 0,
                    "output_tokens": month_agg["output_tokens"] or 0,
                    "cost_usd": float(month_agg["cost"] or 0),
                },
                "week": {
                    "calls": week_agg["calls"] or 0,
                    "input_tokens": week_agg["input_tokens"] or 0,
                    "output_tokens": week_agg["output_tokens"] or 0,
                    "cost_usd": float(week_agg["cost"] or 0),
                },
                "total": {
                    "calls": total_agg["calls"] or 0,
                    "cost_usd": float(total_agg["cost"] or 0),
                },
                "top_users": top_users,
                "top_models": top_models,
                "providers": {"active": providers_active, "total": providers_total},
                "quotas_active": quotas_active,
                "approvals_pending": approvals_pending,
                "kb": {"documents": kb_documents, "indexed": kb_indexed},
            }
        )


# ─────────────────────────────────────────────────────────────
# Providers CRUD
# ─────────────────────────────────────────────────────────────


class AIProviderSerializer(serializers.ModelSerializer):
    api_key_masked = serializers.SerializerMethodField()
    models_count = serializers.SerializerMethodField()

    class Meta:
        model = AIProvider
        fields = [
            "id",
            "name",
            "kind",
            "base_url",
            "api_key_masked",
            "is_active",
            "priority",
            "timeout_seconds",
            "created_at",
            "updated_at",
            "models_count",
        ]

    def get_api_key_masked(self, obj) -> str:
        k = obj.api_key or ""
        if not k:
            return ""
        if len(k) < 8:
            return "***"
        return f"{k[:4]}…{k[-4:]}"

    def get_models_count(self, obj) -> int:
        return obj.models.count()


class AIProviderWriteSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=80, required=False)
    kind = serializers.ChoiceField(
        choices=[c[0] for c in AIProvider.Kind.choices],
        required=False,
    )
    base_url = serializers.URLField(required=False, allow_blank=True)
    api_key = serializers.CharField(required=False, allow_blank=True, max_length=255)
    is_active = serializers.BooleanField(required=False)
    priority = serializers.IntegerField(required=False, min_value=0, max_value=1000)
    timeout_seconds = serializers.IntegerField(required=False, min_value=1, max_value=600)


class AIProviderListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _admin_only(request.user):
            return _forbidden()
        qs = AIProvider.objects.order_by("priority", "id")
        return Response({"providers": AIProviderSerializer(qs, many=True).data})

    def post(self, request):
        if not _admin_only(request.user):
            return _forbidden()
        s = AIProviderWriteSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        data = s.validated_data
        if not data.get("name") or not data.get("kind"):
            return Response({"detail": "name et kind sont requis."}, status=400)
        provider = AIProvider.objects.create(
            name=data["name"][:80],
            kind=data["kind"],
            base_url=data.get("base_url", "") or "",
            api_key=data.get("api_key", "") or "",
            is_active=data.get("is_active", True),
            priority=data.get("priority", 100),
            timeout_seconds=data.get("timeout_seconds", 60),
        )
        return Response(AIProviderSerializer(provider).data, status=201)


class AIProviderDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get(self, request, provider_id):
        if not _admin_only(request.user):
            return None, _forbidden()
        try:
            return AIProvider.objects.get(pk=provider_id), None
        except AIProvider.DoesNotExist:
            return None, Response({"detail": "Introuvable."}, status=404)

    def get(self, request, provider_id: int):
        provider, err = self._get(request, provider_id)
        if err:
            return err
        return Response(AIProviderSerializer(provider).data)

    def patch(self, request, provider_id: int):
        provider, err = self._get(request, provider_id)
        if err:
            return err
        s = AIProviderWriteSerializer(data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        for k, v in s.validated_data.items():
            setattr(provider, k, v)
        provider.save()
        return Response(AIProviderSerializer(provider).data)

    def delete(self, request, provider_id: int):
        provider, err = self._get(request, provider_id)
        if err:
            return err
        provider.delete()
        return Response(status=204)


class AIProviderTestView(APIView):
    """POST /ai/admin/providers/:id/test/ — smoke test connexion."""

    permission_classes = [IsAuthenticated]

    def post(self, request, provider_id: int):
        if not _admin_only(request.user):
            return _forbidden()
        try:
            provider = AIProvider.objects.get(pk=provider_id)
        except AIProvider.DoesNotExist:
            return Response({"detail": "Introuvable."}, status=404)

        # On instancie le driver et on tente un chat court.
        from ai.providers.router import _driver_for
        from ai.providers.base import ChatMessage

        driver = _driver_for(provider)
        ok = True
        detail = "Test réussi."
        latency_ms = 0
        import time as _t
        try:
            start = _t.time()
            result = driver.chat(
                model=(provider.models.filter(is_active=True).first() or None) and
                    provider.models.filter(is_active=True).first().model_name
                    or "test-model",
                messages=[
                    ChatMessage(role="system", content="Réponds uniquement 'ok'."),
                    ChatMessage(role="user", content="ping"),
                ],
                temperature=0.0,
                max_tokens=32,
            )
            latency_ms = int((_t.time() - start) * 1000)
            if not (result and (result.content or "").strip()):
                ok = False
                detail = "Réponse vide."
        except Exception as exc:  # noqa: BLE001
            ok = False
            detail = f"Échec : {exc}"

        AIAuditLog.objects.create(
            user=request.user,
            kind=AIAuditLog.Kind.PROVIDER_TEST,
            payload={"provider_id": provider.id, "kind": provider.kind, "ok": ok},
            ok=ok,
            error_type="test_failed" if not ok else "",
            ip=_client_ip(request),
        )
        return Response({"ok": ok, "detail": detail, "latency_ms": latency_ms})


# ─────────────────────────────────────────────────────────────
# Models CRUD
# ─────────────────────────────────────────────────────────────


class AIModelSerializer(serializers.ModelSerializer):
    provider_name = serializers.CharField(source="provider.name", read_only=True)

    class Meta:
        model = AIModel
        fields = [
            "id",
            "provider",
            "provider_name",
            "purpose",
            "model_name",
            "max_tokens",
            "temperature",
            "cost_input_per_1k",
            "cost_output_per_1k",
            "is_default",
            "is_active",
            "created_at",
        ]


class AIModelWriteSerializer(serializers.Serializer):
    provider = serializers.IntegerField()
    purpose = serializers.ChoiceField(choices=[c[0] for c in AIModel.Purpose.choices])
    model_name = serializers.CharField(max_length=120)
    max_tokens = serializers.IntegerField(min_value=0, max_value=1_000_000, required=False)
    temperature = serializers.DecimalField(max_digits=4, decimal_places=2, required=False)
    cost_input_per_1k = serializers.DecimalField(max_digits=10, decimal_places=6, required=False)
    cost_output_per_1k = serializers.DecimalField(max_digits=10, decimal_places=6, required=False)
    is_default = serializers.BooleanField(required=False)
    is_active = serializers.BooleanField(required=False)


class AIModelListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _admin_only(request.user):
            return _forbidden()
        qs = AIModel.objects.select_related("provider").order_by("purpose", "-is_default", "id")
        return Response({"models": AIModelSerializer(qs, many=True).data})

    def post(self, request):
        if not _admin_only(request.user):
            return _forbidden()
        s = AIModelWriteSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        try:
            provider = AIProvider.objects.get(pk=s.validated_data["provider"])
        except AIProvider.DoesNotExist:
            return Response({"detail": "Provider introuvable."}, status=404)
        data = s.validated_data
        model = AIModel.objects.create(
            provider=provider,
            purpose=data["purpose"],
            model_name=data["model_name"][:120],
            max_tokens=data.get("max_tokens", 4096),
            temperature=data.get("temperature", 0.30),
            cost_input_per_1k=data.get("cost_input_per_1k", 0),
            cost_output_per_1k=data.get("cost_output_per_1k", 0),
            is_default=data.get("is_default", False),
            is_active=data.get("is_active", True),
        )
        # Si is_default, débranche les autres du même purpose.
        if model.is_default:
            AIModel.objects.filter(purpose=model.purpose).exclude(pk=model.id).update(
                is_default=False
            )
        return Response(AIModelSerializer(model).data, status=201)


class AIModelDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get(self, request, model_id):
        if not _admin_only(request.user):
            return None, _forbidden()
        try:
            return AIModel.objects.select_related("provider").get(pk=model_id), None
        except AIModel.DoesNotExist:
            return None, Response({"detail": "Introuvable."}, status=404)

    def get(self, request, model_id: int):
        obj, err = self._get(request, model_id)
        if err:
            return err
        return Response(AIModelSerializer(obj).data)

    def patch(self, request, model_id: int):
        obj, err = self._get(request, model_id)
        if err:
            return err
        s = AIModelWriteSerializer(data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        data = s.validated_data
        for k in ("purpose", "model_name", "max_tokens", "temperature",
                  "cost_input_per_1k", "cost_output_per_1k",
                  "is_default", "is_active"):
            if k in data:
                setattr(obj, k, data[k])
        obj.save()
        if obj.is_default:
            AIModel.objects.filter(purpose=obj.purpose).exclude(pk=obj.id).update(
                is_default=False
            )
        return Response(AIModelSerializer(obj).data)

    def delete(self, request, model_id: int):
        obj, err = self._get(request, model_id)
        if err:
            return err
        obj.delete()
        return Response(status=204)


# ─────────────────────────────────────────────────────────────
# Quotas CRUD
# ─────────────────────────────────────────────────────────────


class AIQuotaSerializer(serializers.ModelSerializer):
    class Meta:
        model = AIQuota
        fields = [
            "id",
            "target_type",
            "target_role",
            "target_user",
            "target_org_id",
            "period",
            "max_calls",
            "max_input_tokens",
            "max_output_tokens",
            "max_cost_usd",
            "is_active",
            "note",
            "created_at",
            "updated_at",
        ]


class AIQuotaListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _admin_only(request.user):
            return _forbidden()
        qs = AIQuota.objects.order_by("target_type", "target_role", "id")
        return Response({"quotas": AIQuotaSerializer(qs, many=True).data})

    def post(self, request):
        if not _admin_only(request.user):
            return _forbidden()
        data = request.data or {}
        try:
            q = AIQuota.objects.create(
                target_type=data.get("target_type", "GLOBAL"),
                target_role=(data.get("target_role") or "")[:30],
                target_org_id=data.get("target_org_id") or None,
                target_user_id=data.get("target_user") or None,
                period=data.get("period", "MONTHLY"),
                max_calls=int(data.get("max_calls") or 0),
                max_input_tokens=int(data.get("max_input_tokens") or 0),
                max_output_tokens=int(data.get("max_output_tokens") or 0),
                max_cost_usd=data.get("max_cost_usd") or 0,
                is_active=bool(data.get("is_active", True)),
                note=(data.get("note") or "")[:280],
            )
        except Exception as exc:  # noqa: BLE001
            return Response({"detail": f"Payload invalide : {exc}"}, status=400)
        return Response(AIQuotaSerializer(q).data, status=201)


class AIQuotaDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get(self, request, quota_id):
        if not _admin_only(request.user):
            return None, _forbidden()
        try:
            return AIQuota.objects.get(pk=quota_id), None
        except AIQuota.DoesNotExist:
            return None, Response({"detail": "Introuvable."}, status=404)

    def get(self, request, quota_id: int):
        obj, err = self._get(request, quota_id)
        if err:
            return err
        return Response(AIQuotaSerializer(obj).data)

    def patch(self, request, quota_id: int):
        obj, err = self._get(request, quota_id)
        if err:
            return err
        data = request.data or {}
        for k in ("target_type", "target_role", "target_org_id", "period",
                  "max_calls", "max_input_tokens", "max_output_tokens",
                  "max_cost_usd", "is_active", "note"):
            if k in data:
                setattr(obj, k, data[k])
        if "target_user" in data:
            obj.target_user_id = data.get("target_user") or None
        obj.save()
        return Response(AIQuotaSerializer(obj).data)

    def delete(self, request, quota_id: int):
        obj, err = self._get(request, quota_id)
        if err:
            return err
        obj.delete()
        return Response(status=204)


# ─────────────────────────────────────────────────────────────
# Audit + usage
# ─────────────────────────────────────────────────────────────


class AIAuditSerializer(serializers.ModelSerializer):
    user_email = serializers.CharField(source="user.email", default="", read_only=True)

    class Meta:
        model = AIAuditLog
        fields = [
            "id",
            "user",
            "user_email",
            "organization_id",
            "conversation_id_snapshot",
            "kind",
            "payload",
            "ip",
            "ok",
            "error_type",
            "created_at",
        ]


class AIAuditLogListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _admin_only(request.user):
            return _forbidden()
        qs = AIAuditLog.objects.all().order_by("-created_at", "-id")
        # Filtres
        kind = request.query_params.get("kind")
        if kind:
            qs = qs.filter(kind=kind)
        q = request.query_params.get("q")
        if q:
            qs = qs.filter(Q(user__email__icontains=q) | Q(error_type__icontains=q))
        ok = request.query_params.get("ok")
        if ok in ("true", "false"):
            qs = qs.filter(ok=(ok == "true"))
        paginator = PageNumberPagination()
        paginator.page_size = 50
        paginator.max_page_size = 200
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response(AIAuditSerializer(page, many=True).data)


class AIUsageRecordListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _admin_only(request.user):
            return _forbidden()
        qs = AIUsageRecord.objects.select_related("user").order_by("-created_at")
        paginator = PageNumberPagination()
        paginator.page_size = 50
        page = paginator.paginate_queryset(qs, request, view=self)
        rows = [
            {
                "id": r.id,
                "user_email": r.user.email if r.user else "",
                "provider": r.provider,
                "model_name": r.model_name,
                "purpose": r.purpose,
                "input_tokens": r.input_tokens,
                "output_tokens": r.output_tokens,
                "cost_usd": float(r.cost_usd),
                "latency_ms": r.latency_ms,
                "ok": r.ok,
                "created_at": r.created_at,
            }
            for r in page
        ]
        return paginator.get_paginated_response(rows)


# ─────────────────────────────────────────────────────────────
# Image generation (stub)
# ─────────────────────────────────────────────────────────────


class ImageGenInput(serializers.Serializer):
    prompt = serializers.CharField(max_length=2000)
    style = serializers.CharField(required=False, allow_blank=True, max_length=60)
    aspect_ratio = serializers.ChoiceField(
        choices=["1:1", "3:4", "4:3", "16:9", "9:16"], required=False, default="1:1"
    )
    course_id = serializers.IntegerField(required=False, allow_null=True)
    lesson_id = serializers.IntegerField(required=False, allow_null=True)


class AIImageGenerateView(APIView):
    """POST /api/ai/image-generate/ — Phase 6 stub.

    Le vrai driver image (OpenAI DALL-E / Stability / etc.) sera branché
    ultérieurement via ``AIProvider.kind="image"``. Ici on renvoie un
    placeholder cohérent qui permet de valider tout le pipeline UI
    (galerie, insertion dans cours, journal).
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Générer une image (stub Phase 6)", request=ImageGenInput)
    def post(self, request):
        if not (
            getattr(request.user, "is_instructor", False)
            or getattr(request.user, "is_platform_admin", False)
        ):
            return Response(
                {"detail": "Réservé formateurs et administrateurs."},
                status=403,
            )
        s = ImageGenInput(data=request.data)
        s.is_valid(raise_exception=True)
        data = s.validated_data

        ratio = data.get("aspect_ratio") or "1:1"
        w, h = {
            "1:1": (1024, 1024),
            "3:4": (768, 1024),
            "4:3": (1024, 768),
            "16:9": (1280, 720),
            "9:16": (720, 1280),
        }.get(ratio, (1024, 1024))

        prompt_slug = data["prompt"].strip().replace(" ", "+")[:80]
        placeholder_url = (
            f"https://placehold.co/{w}x{h}/1e40af/ffffff?text={prompt_slug}"
        )
        gen = AIImageGeneration.objects.create(
            user=request.user,
            prompt=data["prompt"],
            style=(data.get("style") or "")[:60],
            aspect_ratio=ratio,
            width=w,
            height=h,
            provider="stub",
            model_used="stub-placeholder",
            status=AIImageGeneration.Status.SUCCESS,
            urls=[placeholder_url],
            course_id=data.get("course_id"),
            lesson_id=data.get("lesson_id"),
            completed_at=timezone.now(),
            metadata={"note": "stub Phase 6"},
        )
        AIAuditLog.objects.create(
            user=request.user,
            kind=AIAuditLog.Kind.IMAGE_GEN,
            payload={
                "generation_id": gen.id,
                "provider": "stub",
                "prompt_chars": len(data["prompt"]),
            },
            ip=_client_ip(request),
        )
        return Response(
            {
                "id": gen.id,
                "prompt": gen.prompt,
                "urls": gen.urls,
                "width": gen.width,
                "height": gen.height,
                "provider": gen.provider,
                "created_at": gen.created_at,
            }
        )
