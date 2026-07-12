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


# ─────────────────────────────────────────────────────────────
# R41 — Commission plateforme
# ─────────────────────────────────────────────────────────────

class CommissionRule(models.Model):
    """Règles de commission plateforme (R41).

    Le pourcentage représente la part QUE LA PLATEFORME PRÉLÈVE sur les
    ventes. Ce qui reste va au formateur (ou à l'organisation).

    Résolution : on cherche la règle la plus spécifique dans l'ordre
    COURSE → INSTRUCTOR → CATEGORY → DEFAULT.
    """

    class Scope(models.TextChoices):
        DEFAULT = "DEFAULT", "Défaut (fallback)"
        INSTRUCTOR = "INSTRUCTOR", "Par formateur"
        CATEGORY = "CATEGORY", "Par catégorie"
        COURSE = "COURSE", "Par cours"

    name = models.CharField(
        max_length=120,
        help_text="Nom lisible (ex : « Formateur premium », « Défaut »).",
    )
    scope = models.CharField(
        max_length=16,
        choices=Scope.choices,
        default=Scope.DEFAULT,
    )
    percent = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text="Pourcentage prélevé par la plateforme (0-100).",
    )

    instructor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="commission_rules",
    )
    category = models.ForeignKey(
        "catalog.Category",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="commission_rules",
    )
    course = models.ForeignKey(
        "catalog.Course",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="commission_rules",
    )

    is_active = models.BooleanField(default=True)
    note = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["scope", "-created_at"]
        indexes = [
            models.Index(fields=["scope", "is_active"]),
            models.Index(fields=["instructor", "is_active"]),
            models.Index(fields=["category", "is_active"]),
            models.Index(fields=["course", "is_active"]),
        ]
        constraints = [
            models.CheckConstraint(
                name="commission_scope_fk_consistent",
                check=(
                    (
                        models.Q(scope="DEFAULT")
                        & models.Q(instructor__isnull=True)
                        & models.Q(category__isnull=True)
                        & models.Q(course__isnull=True)
                    )
                    | (
                        models.Q(scope="INSTRUCTOR")
                        & models.Q(instructor__isnull=False)
                        & models.Q(category__isnull=True)
                        & models.Q(course__isnull=True)
                    )
                    | (
                        models.Q(scope="CATEGORY")
                        & models.Q(instructor__isnull=True)
                        & models.Q(category__isnull=False)
                        & models.Q(course__isnull=True)
                    )
                    | (
                        models.Q(scope="COURSE")
                        & models.Q(instructor__isnull=True)
                        & models.Q(category__isnull=True)
                        & models.Q(course__isnull=False)
                    )
                ),
            ),
        ]

    def __str__(self):
        return f"{self.scope} — {self.name} ({self.percent}%)"

    @classmethod
    def resolve_for(cls, course=None, instructor=None):
        """Retourne la règle applicable pour un cours + formateur donnés.

        Ordre de priorité : COURSE → INSTRUCTOR → CATEGORY → DEFAULT.
        Retourne None si aucune DEFAULT active — bien seeder une règle
        DEFAULT dès l'installation (voir data migration 0009).
        """
        qs = cls.objects.filter(is_active=True)
        if course is not None:
            r = qs.filter(scope=cls.Scope.COURSE, course=course).first()
            if r:
                return r
        if instructor is not None:
            r = qs.filter(scope=cls.Scope.INSTRUCTOR, instructor=instructor).first()
            if r:
                return r
        if course is not None and getattr(course, "category_id", None):
            r = qs.filter(
                scope=cls.Scope.CATEGORY, category_id=course.category_id
            ).first()
            if r:
                return r
        return qs.filter(scope=cls.Scope.DEFAULT).first()


# ─────────────────────────────────────────────────────────────
# R42 — Reversements formateurs
# ─────────────────────────────────────────────────────────────

class Payout(models.Model):
    """Reversement dû à un formateur pour une période donnée (R42).

    Un Payout agrège :
        - la période de calcul (period_start / period_end)
        - le montant brut (somme des ventes du formateur sur la période)
        - la commission plateforme prélevée
        - les taxes
        - le montant net à reverser
        - le moyen et la référence du paiement une fois exécuté

    Le workflow est : PENDING → VALIDATED → PAID (ou FAILED). Seul un
    admin peut valider et déclencher le paiement.
    """

    class Status(models.TextChoices):
        PENDING = "PENDING", "En attente"
        VALIDATED = "VALIDATED", "Validé"
        PAID = "PAID", "Payé"
        FAILED = "FAILED", "Échoué"
        CANCELED = "CANCELED", "Annulé"

    instructor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="payouts",
    )

    period_start = models.DateField(help_text="Début de la période comptable.")
    period_end = models.DateField(help_text="Fin de la période comptable.")

    currency = models.CharField(max_length=8, default="XOF")
    gross_amount = models.DecimalField(
        max_digits=14, decimal_places=2, default=0,
        help_text="Total brut des ventes sur la période.",
    )
    commission_amount = models.DecimalField(
        max_digits=14, decimal_places=2, default=0,
        help_text="Commission plateforme prélevée.",
    )
    tax_amount = models.DecimalField(
        max_digits=14, decimal_places=2, default=0,
        help_text="Taxes appliquées.",
    )
    refund_amount = models.DecimalField(
        max_digits=14, decimal_places=2, default=0,
        help_text="Remboursements à déduire du net.",
    )
    net_amount = models.DecimalField(
        max_digits=14, decimal_places=2, default=0,
        help_text="Montant net à reverser (gross - commission - tax - refund).",
    )

    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.PENDING
    )
    payment_method = models.CharField(
        max_length=40, blank=True,
        help_text="Wave / OrangeMoney / Stripe / bank transfer…",
    )
    payment_reference = models.CharField(
        max_length=120, blank=True,
        help_text="Référence externe du paiement.",
    )

    validated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="validated_payouts",
    )
    validated_at = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    note = models.CharField(max_length=300, blank=True)

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-period_end", "-created_at"]
        indexes = [
            models.Index(fields=["instructor", "-period_end"]),
            models.Index(fields=["status", "-period_end"]),
            models.Index(fields=["-created_at"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["instructor", "period_start", "period_end"],
                name="payout_unique_per_period",
            ),
            models.CheckConstraint(
                name="payout_period_valid",
                check=models.Q(period_end__gte=models.F("period_start")),
            ),
        ]

    def __str__(self):
        return (
            f"Payout({self.instructor_id}, "
            f"{self.period_start}→{self.period_end}, "
            f"{self.net_amount} {self.currency}, {self.status})"
        )
