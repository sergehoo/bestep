from django.contrib import admin

# Register your models here.
from django.contrib import admin
from .models import Company, CompanyMember, CompanyInvitation


@admin.register(Company)
class CompanyAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "email", "phone", "created_at")
    search_fields = ("name", "slug", "email")
    prepopulated_fields = {"slug": ("name",)}


@admin.register(CompanyMember)
class CompanyMemberAdmin(admin.ModelAdmin):
    list_display = ("company", "user", "company_role", "joined_at")
    list_filter = ("company_role", "company")
    search_fields = ("company__name", "user__email", "user__full_name")


@admin.register(CompanyInvitation)
class CompanyInvitationAdmin(admin.ModelAdmin):
    list_display = ("company", "email", "invited_by", "expires_at", "accepted_at")
    list_filter = ("company",)
    search_fields = ("email", "company__name")
