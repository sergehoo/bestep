from __future__ import annotations

from django.db import models

# Create your models here.
from django.db import models
from django.utils import timezone
from django.conf import settings


class Coupon(models.Model):
    code = models.CharField(max_length=40, unique=True)
    is_active = models.BooleanField(default=True)
    percent_off = models.PositiveIntegerField(null=True, blank=True)  # 0..100
    amount_off = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    currency = models.CharField(max_length=8, default="XOF")

    valid_from = models.DateTimeField(null=True, blank=True)
    valid_to = models.DateTimeField(null=True, blank=True)
    usage_limit = models.PositiveIntegerField(null=True, blank=True)
    used_count = models.PositiveIntegerField(default=0)


class Order(models.Model):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Brouillon"
        PENDING = "PENDING", "En attente"
        PAID = "PAID", "Payée"
        FAILED = "FAILED", "Échouée"
        CANCELED = "CANCELED", "Annulée"
        REFUNDED = "REFUNDED", "Remboursée"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                             related_name="orders")
    company = models.ForeignKey("organizations.Company", on_delete=models.SET_NULL, null=True, blank=True,
                                related_name="orders")

    status = models.CharField(max_length=12, choices=Status.choices, default=Status.DRAFT)
    currency = models.CharField(max_length=8, default="XOF")

    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    coupon = models.ForeignKey("commerce.Coupon", on_delete=models.SET_NULL, null=True, blank=True)

    created_at = models.DateTimeField(default=timezone.now)
    paid_at = models.DateTimeField(null=True, blank=True)


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


class PaymentTransaction(models.Model):
    class Status(models.TextChoices):
        INITIATED = "INITIATED", "Initiée"
        PENDING = "PENDING", "En attente"
        SUCCESS = "SUCCESS", "Succès"
        FAILED = "FAILED", "Échec"

    order = models.ForeignKey("commerce.Order", on_delete=models.CASCADE, related_name="transactions")
    provider = models.CharField(max_length=40)  # stripe, paydunya, cinetpay, ...
    reference = models.CharField(max_length=120, blank=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.INITIATED)

    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    currency = models.CharField(max_length=8, default="XOF")

    raw_payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(default=timezone.now)


class CompanyLicense(models.Model):
    company = models.ForeignKey("organizations.Company", on_delete=models.CASCADE, related_name="licenses")
    seats_total = models.PositiveIntegerField(default=0)
    seats_used = models.PositiveIntegerField(default=0)
    valid_until = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)


class CompanyAssignment(models.Model):
    company = models.ForeignKey("organizations.Company", on_delete=models.CASCADE, related_name="assignments")
    course = models.ForeignKey("catalog.Course", on_delete=models.CASCADE, related_name="company_assignments")
    assigned_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
                                    related_name="assigned_courses")
    due_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)


class CompanyAssignmentTarget(models.Model):
    assignment = models.ForeignKey("commerce.CompanyAssignment", on_delete=models.CASCADE, related_name="targets")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)

    class Meta:
        unique_together = ("assignment", "user")
