from django.contrib import admin

# Register your models here.
from django.contrib import admin
from .models import CertificateTemplate, IssuedCertificate


@admin.register(CertificateTemplate)
class CertificateTemplateAdmin(admin.ModelAdmin):
    list_display = ("name", "signature_name", "signature_title")
    search_fields = ("name",)


@admin.register(IssuedCertificate)
class IssuedCertificateAdmin(admin.ModelAdmin):
    list_display = ("serial", "user", "course", "score_percent", "issued_at")
    search_fields = ("serial", "user__email", "course__title")
    list_filter = ("issued_at",)
    readonly_fields = ("serial", "verification_hash", "issued_at")
