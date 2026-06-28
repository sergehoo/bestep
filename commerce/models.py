"""commerce/models.py — CORRECTIF P1.H + COM-02/COM-05.

Ajouts :
- UniqueConstraint(provider, reference) sur PaymentTransaction (COM-02).
- Validators sur Coupon.percent_off (0..100) (COM-05).
"""
from __future__ import annotations

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone


class Coupon(models.Model):
    code = models.CharField(max_length=40, unique=True)
    is_active = models.BooleanField(default=True)
    # CORRECTIF COM-05 : borner percent_off entre 1 et 100.
    percent_off = models.PositiveIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(100)],
    )
    amount_off = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    currency = models.CharField(max_length=8, default="XOF")

    valid_from = models.DateTimeField(null=True, blank=True)
    valid_to = models.DateTimeField(null=True, blank=True)
    usage_limit = models.PositiveIntegerField(null=True, blank=True)
    used_count = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(default=timezone.now)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_coupons",
    )


class Order(models.Model):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Brouillon"
        PENDING = "PENDING", "En attente"
        PAID = "PAID", "Payée"
        FAILED = "FAILED", "Échouée"
        CANCELED = "CANCELED", "Annulée"
        REFUND_PENDING = "REFUND_PENDING", "Remboursement en cours"
        REFUND_FAILED = "REFUND_FAILED", "Remboursement échoué"
        REFUNDED = "REFUNDED", "Remboursée"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="orders",
    )
    company = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="orders",
    )

    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT)
    currency = models.CharField(max_length=8, default="XOF")

    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    coupon = models.ForeignKey("commerce.Coupon", on_delete=models.SET_NULL, null=True, blank=True)

    created_at = models.DateTimeField(default=timezone.now)
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "status"]),
            models.Index(fields=["company", "status"]),
            models.Index(fields=["status", "created_at"]),
            models.Index(fields=["paid_at"]),
        ]
        constraints = [
            models.CheckConstraint(
                name="order_user_or_company_required",
                check=(models.Q(user__isnull=False) | models.Q(company__isnull=False)),
            ),
        ]


class OrderItem(models.Model):
    class ItemType(models.TextChoices):
        COURSE = "COURSE", "Cours"
        COMPANY_SEATS = "COMPANY_SEATS", "Sièges entreprise"

    order = models.ForeignKey("commerce.Order", on_delete=models.CASCADE, related_name="items")
    item_type = models.CharField(max_length=20, choices=ItemType.choices)

    course = models.ForeignKey("catalog.Course", on_delete=models.SET_NULL, null=True, blank=True)
    seats_qty = models.PositiveIntegerField(default=0)

    unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    line_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        indexes = [
            models.Index(fields=["order", "item_type"]),
        ]


class PaymentTransaction(models.Model):
    class Status(models.TextChoices):
        INITIATED = "INITIATED", "Initiée"
        PENDING = "PENDING", "En attente"
        SUCCESS = "SUCCESS", "Succès"
        FAILED = "FAILED", "Échec"

    order = models.ForeignKey("commerce.Order", on_delete=models.CASCADE, related_name="transactions")
    provider = models.CharField(max_length=40)
    reference = models.CharField(max_length=120, blank=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.INITIATED)

    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    currency = models.CharField(max_length=8, default="XOF")

    raw_payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["order", "status"]),
            models.Index(fields=["provider", "reference"]),
        ]
        constraints = [
            # CORRECTIF COM-02 : idempotence webhook.
            models.UniqueConstraint(
                fields=["provider", "reference"],
                condition=~models.Q(reference=""),
                name="unique_provider_reference",
            ),
        ]


class CompanyLicense(models.Model):
    company = models.ForeignKey(
        "organizations.Organization", on_delete=models.CASCADE, related_name="licenses"
    )
    order = models.ForeignKey(
        "commerce.Order",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="company_licenses",
    )
    seats_total = models.PositiveIntegerField(default=0)
    seats_used = models.PositiveIntegerField(default=0)
    valid_until = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)


class CompanyAssignment(models.Model):
    company = models.ForeignKey(
        "organizations.Organization", on_delete=models.CASCADE, related_name="assignments"
    )
    course = models.ForeignKey(
        "catalog.Course", on_delete=models.CASCADE, related_name="company_assignments"
    )
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="assigned_courses",
    )
    due_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)


class CompanyAssignmentTarget(models.Model):
    assignment = models.ForeignKey(
        "commerce.CompanyAssignment", on_delete=models.CASCADE, related_name="targets"
    )
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)

    class Meta:
        unique_together = ("assignment", "user")
