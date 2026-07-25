"""API publique et administration des demandes de devis B2B."""

from __future__ import annotations

import re

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from catalog.models import Category
from notifications.models import Notification
from notifications.services import notify
from organizations.models import BusinessInterestRequest

from .permissions import IsPlatformAdmin

User = get_user_model()


class PublicBusinessInterestRequestSerializer(serializers.ModelSerializer):
    """Payload public : champs commerciaux uniquement, aucun champ de suivi."""

    category_ids = serializers.PrimaryKeyRelatedField(
        source="categories",
        queryset=Category.objects.all(),
        many=True,
        required=False,
        write_only=True,
    )
    website = serializers.CharField(
        required=False,
        allow_blank=True,
        write_only=True,
        max_length=200,
        help_text="Champ anti-robot ; doit rester vide.",
    )
    phone = serializers.CharField(required=True, allow_blank=False, max_length=40)
    message = serializers.CharField(required=True, allow_blank=False, max_length=5000)
    privacy_consent = serializers.BooleanField(required=True, write_only=True)

    class Meta:
        model = BusinessInterestRequest
        fields = [
            "organization_name",
            "organization_type",
            "country",
            "city",
            "contact_name",
            "contact_role",
            "email",
            "phone",
            "preferred_contact",
            "learners_count",
            "plan_interest",
            "timeframe",
            "budget_range",
            "category_ids",
            "message",
            "privacy_consent",
            "source",
            "website",
        ]
        extra_kwargs = {
            "organization_name": {"required": True, "allow_blank": False},
            "organization_type": {"required": True},
            "country": {"required": True, "allow_blank": False},
            "contact_name": {"required": True, "allow_blank": False},
            "contact_role": {"required": True, "allow_blank": False},
            "email": {"required": True, "allow_blank": False},
            "learners_count": {"required": True, "min_value": 1, "max_value": 1_000_000},
            "plan_interest": {"required": True},
            "timeframe": {"required": True},
            "preferred_contact": {"required": True},
            "source": {"required": False, "allow_blank": True},
        }

    def validate_organization_name(self, value):
        value = value.strip()
        if len(value) < 2:
            raise serializers.ValidationError("Renseignez le nom complet de l'organisation.")
        return value

    def validate_contact_name(self, value):
        value = value.strip()
        if len(value) < 2:
            raise serializers.ValidationError("Renseignez le nom complet du contact.")
        return value

    def validate_contact_role(self, value):
        value = value.strip()
        if len(value) < 2:
            raise serializers.ValidationError("Renseignez la fonction du contact.")
        return value

    def validate_email(self, value):
        return value.strip().lower()

    def validate_phone(self, value):
        value = value.strip()
        digits = re.sub(r"\D", "", value)
        if not 8 <= len(digits) <= 20:
            raise serializers.ValidationError("Renseignez un numéro de téléphone valide.")
        return value

    def validate_message(self, value):
        value = value.strip()
        if len(value) < 10:
            raise serializers.ValidationError("Décrivez votre besoin en au moins 10 caractères.")
        return value

    def validate_privacy_consent(self, value):
        if value is not True:
            raise serializers.ValidationError(
                "Votre consentement est requis pour traiter la demande."
            )
        return value

    def validate(self, attrs):
        if attrs.pop("website", ""):
            raise serializers.ValidationError("Demande invalide.")
        return attrs

    def create(self, validated_data):
        categories = validated_data.pop("categories", [])
        validated_data["consented_at"] = timezone.now()
        validated_data["source"] = (validated_data.get("source") or "enterprise_page")[:80]
        with transaction.atomic():
            interest = BusinessInterestRequest.objects.create(**validated_data)
            if categories:
                interest.categories.set(categories)
        _notify_platform_admins(interest)
        return interest


def _notify_platform_admins(interest: BusinessInterestRequest) -> None:
    admins = (
        User.objects.filter(is_active=True)
        .filter(Q(is_superuser=True) | Q(platform_role=User.PlatformRole.PLATFORM_ADMIN))
        .distinct()
    )
    title = f"Nouvelle demande de devis — {interest.organization_name}"
    body = (
        f"{interest.contact_name} souhaite former "
        f"{interest.learners_count} bénéficiaire(s). Référence {interest.reference}."
    )
    for admin in admins:
        notify(
            admin,
            Notification.Kind.SYSTEM,
            title,
            body=body,
            url="/admin/quote-requests",
            payload={
                "business_interest_request_id": interest.id,
                "reference": interest.reference,
            },
        )


class PublicBusinessInterestRequestCreateView(APIView):
    permission_classes = [AllowAny]
    throttle_scope = "business_quote"

    @extend_schema(
        summary="Envoyer une demande de devis entreprise sans inscription",
        request=PublicBusinessInterestRequestSerializer,
    )
    def post(self, request):
        serializer = PublicBusinessInterestRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        interest = serializer.save()
        return Response(
            {
                "reference": interest.reference,
                "status": "received",
                "message": (
                    "Votre demande a bien été transmise. "
                    "Notre équipe vous contactera sous un jour ouvré."
                ),
            },
            status=status.HTTP_201_CREATED,
        )


class AdminBusinessInterestRequestSerializer(serializers.ModelSerializer):
    reference = serializers.CharField(read_only=True)
    organization_type_label = serializers.CharField(
        source="get_organization_type_display", read_only=True
    )
    plan_interest_label = serializers.CharField(source="get_plan_interest_display", read_only=True)
    timeframe_label = serializers.CharField(source="get_timeframe_display", read_only=True)
    preferred_contact_label = serializers.CharField(
        source="get_preferred_contact_display", read_only=True
    )
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    categories = serializers.SerializerMethodField()
    processed_by_email = serializers.SerializerMethodField()

    class Meta:
        model = BusinessInterestRequest
        fields = [
            "id",
            "reference",
            "organization_name",
            "organization_type",
            "organization_type_label",
            "country",
            "city",
            "contact_name",
            "contact_role",
            "email",
            "phone",
            "preferred_contact",
            "preferred_contact_label",
            "learners_count",
            "plan_interest",
            "plan_interest_label",
            "timeframe",
            "timeframe_label",
            "budget_range",
            "categories",
            "message",
            "privacy_consent",
            "consented_at",
            "source",
            "status",
            "status_label",
            "admin_notes",
            "processed_by",
            "processed_by_email",
            "processed_at",
            "is_processed",
            "created_at",
            "updated_at",
        ]

    def get_categories(self, obj):
        return [{"id": item.id, "name": item.name} for item in obj.categories.all()]

    def get_processed_by_email(self, obj):
        return obj.processed_by.email if obj.processed_by_id else ""


class AdminBusinessInterestRequestUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = BusinessInterestRequest
        fields = ["status", "admin_notes"]
        extra_kwargs = {
            "status": {"required": False},
            "admin_notes": {"required": False, "allow_blank": True, "max_length": 10_000},
        }


class _BusinessInterestPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100


class AdminBusinessInterestRequestListView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(summary="Admin — file des demandes de devis")
    def get(self, request):
        queryset = (
            BusinessInterestRequest.objects.select_related("processed_by")
            .prefetch_related("categories")
            .order_by("-created_at")
        )

        query = (request.query_params.get("q") or "").strip()
        if query:
            queryset = queryset.filter(
                Q(organization_name__icontains=query)
                | Q(contact_name__icontains=query)
                | Q(email__icontains=query)
                | Q(phone__icontains=query)
            )

        quote_status = (request.query_params.get("status") or "").strip().upper()
        if quote_status in BusinessInterestRequest.Status.values:
            queryset = queryset.filter(status=quote_status)

        plan = (request.query_params.get("plan_interest") or "").strip().upper()
        if plan in BusinessInterestRequest.PlanInterest.values:
            queryset = queryset.filter(plan_interest=plan)

        timeframe = (request.query_params.get("timeframe") or "").strip().upper()
        if timeframe in BusinessInterestRequest.Timeframe.values:
            queryset = queryset.filter(timeframe=timeframe)

        status_counts = {
            row["status"]: row["count"]
            for row in queryset.values("status").annotate(count=Count("id"))
        }
        aggregated = {
            "total": queryset.count(),
            "new": status_counts.get(BusinessInterestRequest.Status.NEW, 0),
            "in_progress": sum(
                status_counts.get(item, 0)
                for item in (
                    BusinessInterestRequest.Status.CONTACTED,
                    BusinessInterestRequest.Status.QUALIFIED,
                    BusinessInterestRequest.Status.PROPOSAL_SENT,
                )
            ),
            "won": status_counts.get(BusinessInterestRequest.Status.WON, 0),
            "status_counts": status_counts,
        }

        paginator = _BusinessInterestPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        response = paginator.get_paginated_response(
            AdminBusinessInterestRequestSerializer(page, many=True).data
        )
        response.data["aggregated"] = aggregated
        return response


class AdminBusinessInterestRequestDetailView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    def _get_interest(self, request_id: int):
        try:
            return (
                BusinessInterestRequest.objects.select_related("processed_by")
                .prefetch_related("categories")
                .get(pk=request_id)
            )
        except BusinessInterestRequest.DoesNotExist:
            return None

    @extend_schema(summary="Admin — détail d'une demande de devis")
    def get(self, request, request_id: int):
        interest = self._get_interest(request_id)
        if not interest:
            return Response({"detail": "Demande introuvable."}, status=404)
        return Response(AdminBusinessInterestRequestSerializer(interest).data)

    @extend_schema(
        summary="Admin — traiter une demande de devis",
        request=AdminBusinessInterestRequestUpdateSerializer,
    )
    def patch(self, request, request_id: int):
        interest = self._get_interest(request_id)
        if not interest:
            return Response({"detail": "Demande introuvable."}, status=404)

        serializer = AdminBusinessInterestRequestUpdateSerializer(
            interest,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        updated = serializer.save()
        if not updated.processed_at:
            updated.processed_at = timezone.now()
        updated.processed_by = request.user
        updated.is_processed = updated.status != BusinessInterestRequest.Status.NEW
        updated.save(
            update_fields=[
                "processed_at",
                "processed_by",
                "is_processed",
                "updated_at",
            ]
        )
        return Response(AdminBusinessInterestRequestSerializer(updated).data)
