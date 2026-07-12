"""commerce/migrations/0009_payout.py — R42.1

Migration additive-safe : création du modèle ``Payout``.
"""
from django.conf import settings
from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ("commerce", "0008_commission_rule"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Payout",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "period_start",
                    models.DateField(help_text="Début de la période comptable."),
                ),
                (
                    "period_end",
                    models.DateField(help_text="Fin de la période comptable."),
                ),
                ("currency", models.CharField(default="XOF", max_length=8)),
                (
                    "gross_amount",
                    models.DecimalField(
                        decimal_places=2,
                        default=0,
                        max_digits=14,
                        help_text="Total brut des ventes sur la période.",
                    ),
                ),
                (
                    "commission_amount",
                    models.DecimalField(
                        decimal_places=2,
                        default=0,
                        max_digits=14,
                        help_text="Commission plateforme prélevée.",
                    ),
                ),
                (
                    "tax_amount",
                    models.DecimalField(
                        decimal_places=2,
                        default=0,
                        max_digits=14,
                        help_text="Taxes appliquées.",
                    ),
                ),
                (
                    "refund_amount",
                    models.DecimalField(
                        decimal_places=2,
                        default=0,
                        max_digits=14,
                        help_text="Remboursements à déduire du net.",
                    ),
                ),
                (
                    "net_amount",
                    models.DecimalField(
                        decimal_places=2,
                        default=0,
                        max_digits=14,
                        help_text=(
                            "Montant net à reverser "
                            "(gross - commission - tax - refund)."
                        ),
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("PENDING", "En attente"),
                            ("VALIDATED", "Validé"),
                            ("PAID", "Payé"),
                            ("FAILED", "Échoué"),
                            ("CANCELED", "Annulé"),
                        ],
                        default="PENDING",
                        max_length=16,
                    ),
                ),
                (
                    "payment_method",
                    models.CharField(
                        blank=True,
                        help_text=(
                            "Wave / OrangeMoney / Stripe / bank transfer…"
                        ),
                        max_length=40,
                    ),
                ),
                (
                    "payment_reference",
                    models.CharField(
                        blank=True,
                        help_text="Référence externe du paiement.",
                        max_length=120,
                    ),
                ),
                ("validated_at", models.DateTimeField(blank=True, null=True)),
                ("paid_at", models.DateTimeField(blank=True, null=True)),
                ("note", models.CharField(blank=True, max_length=300)),
                (
                    "created_at",
                    models.DateTimeField(default=django.utils.timezone.now),
                ),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "instructor",
                    models.ForeignKey(
                        on_delete=models.PROTECT,
                        related_name="payouts",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "validated_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=models.SET_NULL,
                        related_name="validated_payouts",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-period_end", "-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="payout",
            index=models.Index(
                fields=["instructor", "-period_end"],
                name="payout_instructor_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="payout",
            index=models.Index(
                fields=["status", "-period_end"],
                name="payout_status_period_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="payout",
            index=models.Index(
                fields=["-created_at"],
                name="payout_created_idx",
            ),
        ),
        migrations.AddConstraint(
            model_name="payout",
            constraint=models.UniqueConstraint(
                fields=("instructor", "period_start", "period_end"),
                name="payout_unique_per_period",
            ),
        ),
        migrations.AddConstraint(
            model_name="payout",
            constraint=models.CheckConstraint(
                check=models.Q(period_end__gte=models.F("period_start")),
                name="payout_period_valid",
            ),
        ),
    ]
