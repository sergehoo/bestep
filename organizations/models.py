from __future__ import annotations

from django.db import models

# Create your models here.
from django.db import models
from django.utils import timezone
from django.conf import settings
import uuid

class Company(models.Model):
    name = models.CharField(max_length=160, unique=True)
    slug = models.SlugField(max_length=190, unique=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=30, blank=True)

    created_at = models.DateTimeField(default=timezone.now)

    def __str__(self):
        return self.name

class CompanyMember(models.Model):
    class CompanyRole(models.TextChoices):
        EMPLOYEE = "EMPLOYEE", "Employé"
        ADMIN = "ADMIN", "Admin Entreprise"

    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="members")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="company_memberships")
    company_role = models.CharField(max_length=20, choices=CompanyRole.choices, default=CompanyRole.EMPLOYEE)
    joined_at = models.DateTimeField(default=timezone.now)

    class Meta:
        unique_together = ("company", "user")

class CompanyInvitation(models.Model):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="invitations")
    email = models.EmailField()
    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    invited_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="sent_company_invites")
    expires_at = models.DateTimeField()
    accepted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ("company", "email")