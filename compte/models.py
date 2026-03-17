from __future__ import annotations

from django.db import models

# Create your models here.
from django.db import models
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin, BaseUserManager
from django.utils import timezone


class UserManager(BaseUserManager):
    def create_user(self, email: str, password: str | None = None, **extra):
        if not email:
            raise ValueError("Email is required")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra)
        user.set_password(password) if password else user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(self, email: str, password: str, **extra):
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        extra.setdefault("is_active", True)
        return self.create_user(email=email, password=password, **extra)


class User(AbstractBaseUser, PermissionsMixin):
    class Role(models.TextChoices):
        LEARNER = "LEARNER", "Apprenant"
        INSTRUCTOR = "INSTRUCTOR", "Formateur"
        COMPANY_ADMIN = "COMPANY_ADMIN", "Admin Entreprise"
        SUPERADMIN = "SUPERADMIN", "Administrateur principal"

    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=30, blank=True)
    full_name = models.CharField(max_length=160, blank=True)

    role = models.CharField(max_length=20, choices=Role.choices, default=Role.LEARNER)

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)  # accès admin site
    created_at = models.DateTimeField(default=timezone.now)

    USERNAME_FIELD = "email"
    objects = UserManager()

    @property
    def is_learner(self):
        return self.role == self.Role.LEARNER

    @property
    def is_instructor(self):
        return self.role == self.Role.INSTRUCTOR

    @property
    def is_company_admin(self):
        return self.role == self.Role.COMPANY_ADMIN

    @property
    def is_superadmin(self):
        return self.role == self.Role.SUPERADMIN or self.is_superuser or self.is_staff

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
