from django.contrib import admin
from django.contrib.auth import get_user_model
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.utils.translation import gettext_lazy as _
from compte.models import InstructorProfile, LearnerKYC, LearnerProfile
User = get_user_model()


# Register your models here.


# ===== Inlines (profils) =====
class LearnerProfileInline(admin.StackedInline):
    model = LearnerProfile
    extra = 0
    can_delete = False


class LearnerKYCInline(admin.StackedInline):
    model = LearnerKYC
    extra = 0
    can_delete = False
    fieldsets = (
        ("Orientation", {
            "fields": (
                "education_level",
                "goal",
                "domain_interest",
                "job_title",
                "availability",
            )
        }),
        ("Localisation / langue", {
            "fields": (
                "country",
                "city",
                "language",
            )
        }),
        ("Consentements", {
            "fields": (
                "accept_terms",
                "accept_marketing",
            )
        }),
        ("Dates", {
            "fields": ("created_at", "updated_at")
        }),
    )
    readonly_fields = ("created_at", "updated_at")


class InstructorProfileInline(admin.StackedInline):
    model = InstructorProfile
    extra = 0
    can_delete = False


# ===== Admin User (custom) =====
@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    ordering = ("-created_at",)
    list_display = ("email", "full_name", "phone", "role", "is_active", "is_staff", "created_at")
    list_filter = ("role", "is_active", "is_staff", "is_superuser")
    search_fields = ("email", "full_name", "phone")
    readonly_fields = ("created_at",)
    list_per_page = 50

    # IMPORTANT : ton User n'a pas username/first_name/last_name
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        (_("Profil"), {"fields": ("full_name", "phone", "role")}),
        (_("Permissions"), {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
        (_("Dates"), {"fields": ("last_login", "created_at")}),
    )

    add_fieldsets = (
        (None, {
            "classes": ("wide",),
            "fields": ("email", "full_name", "phone", "role", "password1", "password2", "is_active", "is_staff"),
        }),
    )

    # Inlines selon le rôle (affiche KYC + learner pour apprenant, instructor pour formateur, etc.)
    def get_inlines(self, request, obj):
        if not obj:
            return []
        if obj.role == User.Role.LEARNER:
            return [LearnerProfileInline, LearnerKYCInline]
        if obj.role == User.Role.INSTRUCTOR:
            return [InstructorProfileInline]
        if obj.role == User.Role.COMPANY_ADMIN:
            # si tu crées un CompanyProfile plus tard, tu le mettras ici
            return []
        return []


# ===== Admin des profils (optionnels si tu veux aussi gérer séparément) =====
@admin.register(LearnerProfile)
class LearnerProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "job_title")
    search_fields = ("user__email", "user__full_name", "job_title")
    raw_id_fields = ("user",)


@admin.register(LearnerKYC)
class LearnerKYCAdmin(admin.ModelAdmin):
    list_display = ("user", "education_level", "goal", "availability", "country", "city", "accept_terms", "updated_at")
    list_filter = ("education_level", "goal", "availability", "country", "accept_terms", "accept_marketing")
    search_fields = ("user__email", "user__full_name", "domain_interest", "job_title", "city")
    readonly_fields = ("created_at", "updated_at")
    raw_id_fields = ("user",)


@admin.register(InstructorProfile)
class InstructorProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "headline", "is_verified", "payout_percent")
    list_filter = ("is_verified",)
    search_fields = ("user__email", "user__full_name", "headline")
    raw_id_fields = ("user",)