from __future__ import annotations

from functools import cached_property

# Create your models here.
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from organizations.models import OrganizationMembership


class UserManager(BaseUserManager):

    use_in_migrations = True

    def create_user(self, email: str, password: str | None = None, **extra):

        if not email:

            raise ValueError("Email is required")

        email = self.normalize_email(email).strip().lower()

        extra.setdefault("is_active", True)

        extra.setdefault("is_staff", False)

        extra.setdefault("is_superuser", False)

        extra.setdefault("platform_role", User.PlatformRole.USER)

        user = self.model(email=email, **extra)

        if password:

            user.set_password(password)

        else:

            user.set_unusable_password()

        user.full_clean()

        user.save(using=self._db)

        return user

    def create_superuser(self, email: str, password: str, **extra):

        extra["is_staff"] = True

        extra["is_superuser"] = True

        extra["is_active"] = True

        extra["platform_role"] = User.PlatformRole.PLATFORM_ADMIN

        user = self.create_user(email=email, password=password, **extra)

        if user.is_staff is not True:

            raise ValidationError("Superuser must have is_staff=True")

        if user.is_superuser is not True:

            raise ValidationError("Superuser must have is_superuser=True")

        if user.platform_role != User.PlatformRole.PLATFORM_ADMIN:

            raise ValidationError("Superuser must have platform_role=PLATFORM_ADMIN")

        return user



class User(AbstractBaseUser, PermissionsMixin):
    class PlatformRole(models.TextChoices):
        USER = "USER", "Utilisateur"
        PLATFORM_ADMIN = "PLATFORM_ADMIN", "Administrateur plateforme"

    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=30, blank=True)
    full_name = models.CharField(max_length=160, blank=True)

    platform_role = models.CharField(
        max_length=30,
        choices=PlatformRole.choices,
        default=PlatformRole.USER,
        db_index=True,
    )

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)  # accès admin Django
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = "email"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS: list[str] = []

    objects = UserManager()

    class Meta:
        indexes = [
            models.Index(fields=["platform_role", "is_active"]),
            models.Index(fields=["created_at"]),
        ]

    def clean(self):
        super().clean()
        if self.email:
            self.email = self.__class__.objects.normalize_email(self.email).strip().lower()
        # CORRECTIF COMPTE-01 : cohérence is_superuser / is_staff / platform_role.
        if self.is_superuser:
            self.is_staff = True
            self.platform_role = self.PlatformRole.PLATFORM_ADMIN
        elif self.platform_role == self.PlatformRole.PLATFORM_ADMIN:
            self.is_staff = True

    @property
    def display_name(self):
        return self.full_name or self.email

    @property
    def is_platform_admin(self) -> bool:
        # CORRECTIF COMPTE-02 : STRICT — n'inclut pas is_staff seul.
        return self.is_superuser or self.platform_role == self.PlatformRole.PLATFORM_ADMIN

    @property
    def has_django_admin_access(self) -> bool:
        """Pour l'accès /admin/ Django uniquement (support technique)."""
        return self.is_platform_admin or self.is_staff

    @property
    def active_memberships(self):
        return self.organization_memberships.filter(is_active=True).select_related("organization")

    @cached_property
    def _active_memberships_cache(self) -> list[dict]:
        """Matérialise les memberships actifs en 1 seule requête par instance (CORRECTIF COMPTE-21)."""
        return list(
            self.organization_memberships.filter(
                is_active=True, organization__is_active=True,
            ).values("organization_id", "role")
        )

    @property
    def has_organization(self) -> bool:
        return bool(self._active_memberships_cache)

    @property
    def is_org_owner(self) -> bool:
        return any(m["role"] == OrganizationMembership.Role.OWNER for m in self._active_memberships_cache)

    @property
    def is_org_admin(self) -> bool:
        return any(
            m["role"] in (OrganizationMembership.Role.OWNER, OrganizationMembership.Role.ADMIN)
            for m in self._active_memberships_cache
        )

    @property
    def is_org_instructor(self) -> bool:
        return any(m["role"] == OrganizationMembership.Role.INSTRUCTOR for m in self._active_memberships_cache)

    @property
    def is_org_learner(self) -> bool:
        return any(m["role"] == OrganizationMembership.Role.LEARNER for m in self._active_memberships_cache)

    @property
    def is_instructor(self) -> bool:
        return hasattr(self, "instructor_profile") or self.is_org_instructor

    @property
    def is_learner(self) -> bool:
        return hasattr(self, "learner_profile") or self.is_org_learner

    def __str__(self):
        return self.email


class LearnerProfile(models.Model):
    user = models.OneToOneField("compte.User", on_delete=models.CASCADE, related_name="learner_profile")
    job_title = models.CharField(max_length=120, blank=True)
    bio = models.TextField(blank=True)

    def __str__(self):
        return f"LearnerProfile({self.user.email})"

class LearnerKYC(models.Model):
    class EducationLevel(models.TextChoices):
        COLLEGE = "COLLEGE", "Collège"
        LYCEE = "LYCEE", "Lycée"
        BAC = "BAC", "Bac"
        BTS_DUT = "BTS_DUT", "BTS/DUT"
        LICENCE = "LICENCE", "Licence"
        MASTER = "MASTER", "Master"
        DOCTORAT = "DOCTORAT", "Doctorat"
        AUTRE = "AUTRE", "Autre"

    class Goal(models.TextChoices):
        JOB = "JOB", "Trouver un emploi"
        PROMOTION = "PROMOTION", "Évoluer / promotion"
        ENTREPRENEUR = "ENTREPRENEUR", "Lancer un business"
        SKILL = "SKILL", "Monter en compétences"
        CERTIF = "CERTIF", "Obtenir une certification"
        AUTRE = "AUTRE", "Autre"

    class Availability(models.TextChoices):
        LT2 = "LT2", "Moins de 2h / semaine"
        H2_5 = "H2_5", "2 à 5h / semaine"
        H5_10 = "H5_10", "5 à 10h / semaine"
        GT10 = "GT10", "Plus de 10h / semaine"

    user = models.OneToOneField("compte.User", on_delete=models.CASCADE, related_name="kyc")

    # Orientation
    education_level = models.CharField(max_length=20, choices=EducationLevel.choices, blank=True)
    goal = models.CharField(max_length=20, choices=Goal.choices, blank=True)
    domain_interest = models.CharField(max_length=120, blank=True)  # ex: Data, Finance, Dev...
    job_title = models.CharField(max_length=120, blank=True)
    availability = models.CharField(max_length=10, choices=Availability.choices, blank=True)

    # Localisation / langue
    country = models.CharField(max_length=80, blank=True, default="Côte d’Ivoire")
    city = models.CharField(max_length=80, blank=True)
    language = models.CharField(max_length=40, blank=True, default="Français")

    # Consentements basiques (à garder simples)
    accept_terms = models.BooleanField(default=False)
    accept_marketing = models.BooleanField(default=False)
    onboarding_level = models.CharField(max_length=30, blank=True)  # "Débutant/Intermédiaire/Avancé"
    onboarding_profile = models.JSONField(default=dict, blank=True)  # {topics, strengths, weaknesses...}
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"LearnerKYC({self.user.email})"
class InstructorProfile(models.Model):
    user = models.OneToOneField("compte.User", on_delete=models.CASCADE, related_name="instructor_profile")
    headline = models.CharField(max_length=160, blank=True)
    bio = models.TextField(blank=True)
    is_verified = models.BooleanField(default=False)  # validation admin
    payout_percent = models.DecimalField(max_digits=5, decimal_places=2, default=70.00)  # commission

    def __str__(self):
        return f"InstructorProfile({self.user.email})"
