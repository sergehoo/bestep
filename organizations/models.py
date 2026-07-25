from __future__ import annotations

import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone
from django.utils.text import slugify


class Organization(models.Model):
    name = models.CharField(max_length=180, unique=True)
    slug = models.SlugField(max_length=200, unique=True, blank=True)
    legal_name = models.CharField(max_length=220, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    country = models.CharField(max_length=80, blank=True, default="Côte d’Ivoire")
    city = models.CharField(max_length=80, blank=True)
    address = models.CharField(max_length=255, blank=True)

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        indexes = [
            models.Index(fields=["is_active", "name"]),
            models.Index(fields=["created_at"]),
        ]

    def clean(self):
        super().clean()
        if self.email:
            self.email = self.email.strip().lower()

    def save(self, *args, **kwargs):
        self.full_clean()

        if not self.slug:
            base = slugify(self.name)[:180] or "organization"
            slug = base
            idx = 1
            while Organization.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                idx += 1
                slug = f"{base}-{idx}"
            self.slug = slug

        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class OrganizationMembership(models.Model):
    class Role(models.TextChoices):
        OWNER = "OWNER", "Propriétaire"
        ADMIN = "ADMIN", "Administrateur"
        MANAGER = "MANAGER", "Manager"
        INSTRUCTOR = "INSTRUCTOR", "Formateur"
        LEARNER = "LEARNER", "Apprenant"

    user = models.ForeignKey(
        "compte.User",
        on_delete=models.CASCADE,
        related_name="organization_memberships",
    )
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="memberships",
    )
    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        db_index=True,
    )
    is_active = models.BooleanField(default=True, db_index=True)
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="organization_memberships_created",
    )
    joined_at = models.DateTimeField(default=timezone.now, db_index=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "organization", "role"],
                name="unique_user_organization_role",
            ),
        ]
        indexes = [
            models.Index(fields=["organization", "role", "is_active"]),
            models.Index(fields=["user", "role", "is_active"]),
            models.Index(fields=["organization", "user"]),
        ]
        ordering = ["organization__name", "role", "user__email"]

    def clean(self):
        super().clean()

        if self.organization_id and not self.organization.is_active:
            raise ValidationError("Cannot attach a user to an inactive organization.")

        if self.role == self.Role.OWNER:
            qs = OrganizationMembership.objects.filter(
                organization=self.organization,
                role=self.Role.OWNER,
                is_active=True,
            )
            if self.pk:
                qs = qs.exclude(pk=self.pk)
            if qs.exists():
                raise ValidationError("An organization can only have one active owner.")

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.user.email} - {self.organization.name} - {self.get_role_display()}"


class OrganizationInvitation(models.Model):
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="invitations",
    )
    email = models.EmailField()
    role = models.CharField(
        max_length=20,
        choices=OrganizationMembership.Role.choices,
        default=OrganizationMembership.Role.LEARNER,
        db_index=True,
    )
    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="organization_invitations_sent",
    )
    expires_at = models.DateTimeField(db_index=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "email", "role"],
                condition=models.Q(accepted_at__isnull=True),
                name="unique_pending_invitation_per_role",
            ),
        ]
        indexes = [
            models.Index(fields=["organization", "email"]),
            models.Index(fields=["organization", "role", "expires_at"]),
        ]
        ordering = ["-created_at"]

    def clean(self):
        super().clean()

        if self.email:
            self.email = self.email.strip().lower()

        if self.expires_at and self.expires_at <= timezone.now():
            raise ValidationError("expires_at must be in the future.")

        if self.role == OrganizationMembership.Role.OWNER:
            raise ValidationError("OWNER role cannot be assigned through invitation.")

        if self.organization_id and not self.organization.is_active:
            raise ValidationError("Cannot invite users to an inactive organization.")

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    @property
    def is_expired(self) -> bool:
        return timezone.now() >= self.expires_at

    @property
    def is_accepted(self) -> bool:
        return self.accepted_at is not None

    @property
    def is_pending(self) -> bool:
        return not self.is_accepted and not self.is_expired

    def __str__(self):
        return f"{self.email} invited to {self.organization.name} as {self.get_role_display()}"


class BusinessInterestRequest(models.Model):
    class OrganizationType(models.TextChoices):
        COMPANY = "COMPANY", "Entreprise privée"
        PUBLIC = "PUBLIC", "Administration / institution publique"
        NGO = "NGO", "ONG / association"
        EDUCATION = "EDUCATION", "École / université"
        FINANCIAL = "FINANCIAL", "Institution financière"
        OTHER = "OTHER", "Autre organisation"

    class PlanInterest(models.TextChoices):
        PRO = "PRO", "Pro"
        ENTERPRISE = "ENTERPRISE", "Enterprise"
        DEMO = "DEMO", "Démonstration"
        UNSURE = "UNSURE", "À définir avec un conseiller"

    class Timeframe(models.TextChoices):
        IMMEDIATE = "IMMEDIATE", "Dès que possible"
        ONE_TO_THREE_MONTHS = "1_3_MONTHS", "Dans 1 à 3 mois"
        THREE_TO_SIX_MONTHS = "3_6_MONTHS", "Dans 3 à 6 mois"
        SIX_TO_TWELVE_MONTHS = "6_12_MONTHS", "Dans 6 à 12 mois"
        EXPLORING = "EXPLORING", "En phase d'exploration"

    class PreferredContact(models.TextChoices):
        EMAIL = "EMAIL", "E-mail"
        PHONE = "PHONE", "Téléphone"
        WHATSAPP = "WHATSAPP", "WhatsApp"

    class Status(models.TextChoices):
        NEW = "NEW", "Nouvelle"
        CONTACTED = "CONTACTED", "Contactée"
        QUALIFIED = "QUALIFIED", "Qualifiée"
        PROPOSAL_SENT = "PROPOSAL_SENT", "Devis envoyé"
        WON = "WON", "Gagnée"
        LOST = "LOST", "Perdue"
        ARCHIVED = "ARCHIVED", "Archivée"

    organization_name = models.CharField("Nom de l'organisation", max_length=180)
    organization_type = models.CharField(
        "Type d'organisation",
        max_length=20,
        choices=OrganizationType.choices,
        default=OrganizationType.COMPANY,
    )
    country = models.CharField("Pays", max_length=80, blank=True, default="Côte d’Ivoire")
    city = models.CharField("Ville", max_length=80, blank=True)
    contact_name = models.CharField("Nom du contact", max_length=160)
    contact_role = models.CharField("Fonction du contact", max_length=160, blank=True)
    email = models.EmailField("Email professionnel")
    phone = models.CharField("Téléphone", max_length=40, blank=True)
    preferred_contact = models.CharField(
        "Canal de contact préféré",
        max_length=20,
        choices=PreferredContact.choices,
        default=PreferredContact.EMAIL,
    )
    learners_count = models.PositiveIntegerField("Apprenants estimé", default=1)
    plan_interest = models.CharField(
        "Offre souhaitée",
        max_length=20,
        choices=PlanInterest.choices,
        default=PlanInterest.UNSURE,
    )
    timeframe = models.CharField(
        "Période de démarrage",
        max_length=20,
        choices=Timeframe.choices,
        default=Timeframe.EXPLORING,
    )
    budget_range = models.CharField("Budget indicatif", max_length=80, blank=True)
    categories = models.ManyToManyField(
        "catalog.Category",
        blank=True,
        related_name="business_interest_requests",
        verbose_name="Catégories souhaitées",
    )
    courses = models.ManyToManyField(
        "catalog.Course",
        blank=True,
        related_name="business_interest_requests",
        verbose_name="Formations souhaitées",
    )
    message = models.TextField("Besoin spécifique", blank=True)
    privacy_consent = models.BooleanField("Consentement au traitement", default=False)
    consented_at = models.DateTimeField("Consentement donné le", null=True, blank=True)
    source = models.CharField("Source", max_length=80, blank=True, default="enterprise_page")
    status = models.CharField(
        "Statut commercial",
        max_length=20,
        choices=Status.choices,
        default=Status.NEW,
        db_index=True,
    )
    admin_notes = models.TextField("Notes administratives", blank=True)
    processed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="business_interest_requests_processed",
        verbose_name="Dernier traitement par",
    )
    processed_at = models.DateTimeField("Premier traitement le", null=True, blank=True)
    is_processed = models.BooleanField("Traité", default=False)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Manifestation d’intérêt entreprise"
        verbose_name_plural = "Manifestations d’intérêt entreprises"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "-created_at"]),
            models.Index(fields=["email", "-created_at"]),
        ]

    @property
    def reference(self) -> str:
        return f"DEV-{self.pk:06d}" if self.pk else "DEV-EN-COURS"

    def __str__(self):
        return f"{self.organization_name} — {self.contact_name}"
