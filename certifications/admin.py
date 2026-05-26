"""certifications/admin.py — CORRECTIF V2.A (CERT-09)."""
from __future__ import annotations

from django.contrib import admin

from .models import CertificateTemplate, IssuedCertificate
from .services import revoke_certificate


@admin.register(CertificateTemplate)
class CertificateTemplateAdmin(admin.ModelAdmin):
    list_display = ("name", "signature_name", "signature_title", "has_background")
    search_fields = ("name", "signature_name", "signature_title")

    @admin.display(description="Fond ?", boolean=True)
    def has_background(self, obj):
        return bool(obj.background)


@admin.register(IssuedCertificate)
class IssuedCertificateAdmin(admin.ModelAdmin):
    list_display = (
        "serial",
        "user",
        "course",
        "score_percent",
        "issued_at",
        "is_revoked_flag",
    )
    list_filter = ("issued_at", "revoked_at")
    search_fields = ("serial", "verification_hash", "user__email", "course__title")
    readonly_fields = ("serial", "verification_hash", "issued_at", "revoked_at", "revoked_reason")
    list_select_related = ("user", "course")
    actions = ["revoke_selected"]

    @admin.display(description="Révoqué ?", boolean=True)
    def is_revoked_flag(self, obj):
        return obj.is_revoked

    @admin.action(description="Révoquer les certificats sélectionnés")
    def revoke_selected(self, request, queryset):
        n = 0
        for cert in queryset:
            if not cert.is_revoked:
                revoke_certificate(cert.id, reason="Révoqué via admin Django")
                n += 1
        self.message_user(request, f"{n} certificat(s) révoqué(s).")
