from django.contrib import admin
from django.contrib.auth import get_user_model
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.utils.translation import gettext_lazy as _

from compte.models import InstructorProfile, LearnerKYC, LearnerProfile
from organizations.models import OrganizationMembership

User = get_user_model()


# =========================
# Inlines
# =========================
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
        ("Onboarding", {
            "fields": (
                "onboarding_level",
                "onboarding_profile",
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


class OrganizationMembershipInline(admin.TabularInline):
    model = OrganizationMembership
    extra = 0
    fk_name = "user"
    autocomplete_fields = ("organization", "invited_by")
    fields = ("organization", "role", "is_active", "invited_by", "joined_at", "created_at")
    readonly_fields = ("created_at",)
    verbose_name = "Appartenance organisationnelle"
    verbose_name_plural = "Appartenances organisationnelles"


# =========================
# User admin
# =========================
@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    ordering = ("-created_at",)
    list_display = (
        "email",
        "full_name",
        "phone",
        "platform_role",
        "is_active",
        "is_staff",
        "is_superuser",
        "created_at",
        "learner_status",
        "instructor_status",
        "organization_count",
    )
    list_filter = (
        "platform_role",
        "is_active",
        "is_staff",
        "is_superuser",
        "created_at",
    )
    search_fields = ("email", "full_name", "phone")
    readonly_fields = ("created_at", "updated_at", "last_login")
    list_per_page = 50
    inlines = [OrganizationMembershipInline]

    fieldsets = (
        (None, {"fields": ("email", "password")}),
        (_("Profil"), {
            "fields": ("full_name", "phone")
        }),
        (_("Rôle plateforme"), {
            "fields": ("platform_role",)
        }),
        (_("Permissions"), {
            "fields": (
                "is_active",
                "is_staff",
                "is_superuser",
                "groups",
                "user_permissions",
            )
        }),
        (_("Dates"), {
            "fields": ("last_login", "created_at", "updated_at")
        }),
    )

    add_fieldsets = (
        (None, {
            "classes": ("wide",),
            "fields": (
                "email",
                "full_name",
                "phone",
                "platform_role",
                "password1",
                "password2",
                "is_active",
                "is_staff",
            ),
        }),
    )

    filter_horizontal = ("groups", "user_permissions")

    def get_inlines(self, request, obj):
        """
        Affiche dynamiquement les profils selon ce que l'utilisateur possède réellement.
        On ne dépend plus d'un champ role unique.
        """
        if not obj:
            return []

        inlines = [OrganizationMembershipInline]

        has_learner_profile = hasattr(obj, "learner_profile")
        has_kyc = hasattr(obj, "kyc")
        has_instructor_profile = hasattr(obj, "instructor_profile")

        memberships = getattr(obj, "organization_memberships", None)
        if memberships is not None:
            if memberships.filter(
                role=OrganizationMembership.Role.LEARNER,
                is_active=True,
            ).exists():
                has_learner_profile = True

            if memberships.filter(
                role=OrganizationMembership.Role.INSTRUCTOR,
                is_active=True,
            ).exists():
                has_instructor_profile = True

        if has_learner_profile:
            inlines.append(LearnerProfileInline)

        if has_kyc or has_learner_profile:
            inlines.append(LearnerKYCInline)

        if has_instructor_profile:
            inlines.append(InstructorProfileInline)

        return inlines

    @admin.display(description="Apprenant")
    def learner_status(self, obj):
        return hasattr(obj, "learner_profile") or (
            hasattr(obj, "organization_memberships")
            and obj.organization_memberships.filter(
                role=OrganizationMembership.Role.LEARNER,
                is_active=True,
            ).exists()
        )

    @admin.display(description="Formateur")
    def instructor_status(self, obj):
        return hasattr(obj, "instructor_profile") or (
            hasattr(obj, "organization_memberships")
            and obj.organization_memberships.filter(
                role=OrganizationMembership.Role.INSTRUCTOR,
                is_active=True,
            ).exists()
        )

    @admin.display(description="Organisations")
    def organization_count(self, obj):
        if not hasattr(obj, "organization_memberships"):
            return 0
        return obj.organization_memberships.filter(is_active=True).count()


# =========================
# Profil apprenant
# =========================
@admin.register(LearnerProfile)
class LearnerProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "job_title")
    search_fields = ("user__email", "user__full_name", "job_title")
    raw_id_fields = ("user",)


# =========================
# KYC apprenant
# =========================
@admin.register(LearnerKYC)
class LearnerKYCAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "education_level",
        "goal",
        "availability",
        "country",
        "city",
        "accept_terms",
        "updated_at",
    )
    list_filter = (
        "education_level",
        "goal",
        "availability",
        "country",
        "accept_terms",
        "accept_marketing",
    )
    search_fields = (
        "user__email",
        "user__full_name",
        "domain_interest",
        "job_title",
        "city",
    )
    readonly_fields = ("created_at", "updated_at")
    raw_id_fields = ("user",)


# =========================
# Profil formateur
# =========================
@admin.register(InstructorProfile)
class InstructorProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "headline", "is_verified", "payout_percent")
    list_filter = ("is_verified",)
    search_fields = ("user__email", "user__full_name", "headline")
    raw_id_fields = ("user",)