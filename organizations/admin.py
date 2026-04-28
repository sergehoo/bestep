from django.contrib import admin
from django.utils import timezone

from organizations.models import (
    Organization,
    OrganizationInvitation,
    OrganizationMembership,
)


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "slug",
        "email",
        "phone",
        "city",
        "country",
        "is_active",
        "created_at",
    )
    list_filter = ("is_active", "country", "created_at")
    search_fields = ("name", "slug", "legal_name", "email", "phone", "city")
    prepopulated_fields = {"slug": ("name",)}
    readonly_fields = ("created_at", "updated_at")
    ordering = ("name",)

    fieldsets = (
        ("Identification", {
            "fields": ("name", "slug", "legal_name", "is_active")
        }),
        ("Contact", {
            "fields": ("email", "phone")
        }),
        ("Adresse", {
            "fields": ("country", "city", "address")
        }),
        ("Traçabilité", {
            "fields": ("created_at", "updated_at")
        }),
    )


@admin.register(OrganizationMembership)
class OrganizationMembershipAdmin(admin.ModelAdmin):
    list_display = (
        "organization",
        "user",
        "role",
        "is_active",
        "invited_by",
        "joined_at",
    )
    list_filter = ("role", "is_active", "organization", "joined_at")
    search_fields = (
        "organization__name",
        "user__email",
        "user__full_name",
        "invited_by__email",
    )
    autocomplete_fields = ("organization", "user", "invited_by")
    readonly_fields = ("created_at",)
    ordering = ("organization__name", "role", "user__email")

    fieldsets = (
        ("Affectation", {
            "fields": ("organization", "user", "role", "is_active")
        }),
        ("Origine", {
            "fields": ("invited_by", "joined_at")
        }),
        ("Traçabilité", {
            "fields": ("created_at",)
        }),
    )


@admin.register(OrganizationInvitation)
class OrganizationInvitationAdmin(admin.ModelAdmin):
    list_display = (
        "organization",
        "email",
        "role",
        "invited_by",
        "expires_at",
        "accepted_at",
        "invitation_status",
        "created_at",
    )
    list_filter = ("role", "organization", "accepted_at", "expires_at", "created_at")
    search_fields = (
        "email",
        "organization__name",
        "invited_by__email",
        "invited_by__full_name",
    )
    autocomplete_fields = ("organization", "invited_by")
    readonly_fields = ("token", "created_at")
    ordering = ("-created_at",)

    fieldsets = (
        ("Invitation", {
            "fields": ("organization", "email", "role", "token")
        }),
        ("Gestion", {
            "fields": ("invited_by", "expires_at", "accepted_at")
        }),
        ("Traçabilité", {
            "fields": ("created_at",)
        }),
    )

    @admin.display(description="Statut")
    def invitation_status(self, obj):
        if obj.accepted_at:
            return "Acceptée"
        if obj.is_expired:
            return "Expirée"
        return "En attente"

# admin.py

from django.contrib import admin

from .models import BusinessInterestRequest


@admin.register(BusinessInterestRequest)
class BusinessInterestRequestAdmin(admin.ModelAdmin):
    list_display = (
        "organization_name",
        "contact_name",
        "email",
        "phone",
        "learners_count",
        "is_processed",
        "created_at",
    )
    list_filter = (
        "is_processed",
        "categories",
        "courses",
        "created_at",
    )
    search_fields = (
        "organization_name",
        "contact_name",
        "email",
        "phone",
        "message",
    )
    filter_horizontal = (
        "categories",
        "courses",
    )
    readonly_fields = (
        "created_at",
    )
    date_hierarchy = "created_at"
    ordering = ("-created_at",)

    fieldsets = (
        ("Informations organisation", {
            "fields": (
                "organization_name",
                "learners_count",
            )
        }),
        ("Contact", {
            "fields": (
                "contact_name",
                "email",
                "phone",
            )
        }),
        ("Besoins exprimés", {
            "fields": (
                "categories",
                "courses",
                "message",
            )
        }),
        ("Traitement interne", {
            "fields": (
                "is_processed",
                "created_at",
            )
        }),
    )