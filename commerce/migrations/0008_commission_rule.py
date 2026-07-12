"""commerce/migrations/0008_commission_rule.py — R41.1

Migration additive-safe : création du modèle ``CommissionRule`` + seed
d'une règle DEFAULT à 30 % (valeur ajustable ensuite via l'interface admin
ou l'admin Django).

Aucune contrainte sur les données existantes. La règle DEFAULT est
créée uniquement si aucune n'existe (idempotent).
"""
from django.conf import settings
from django.db import migrations, models
import django.core.validators
import django.utils.timezone


def _seed_default(apps, schema_editor):
    CommissionRule = apps.get_model("commerce", "CommissionRule")
    if not CommissionRule.objects.filter(scope="DEFAULT").exists():
        CommissionRule.objects.create(
            name="Règle par défaut",
            scope="DEFAULT",
            percent=30,
            is_active=True,
            note="Commission plateforme par défaut (30%). "
            "Modifiable via /admin/commissions.",
        )


def _unseed_default(apps, schema_editor):
    CommissionRule = apps.get_model("commerce", "CommissionRule")
    CommissionRule.objects.filter(scope="DEFAULT", name="Règle par défaut").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0001_initial"),  # Category + Course
        ("commerce", "0007_refund_workflow"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="CommissionRule",
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
                    "name",
                    models.CharField(
                        help_text=(
                            "Nom lisible (ex : « Formateur premium », "
                            "« Défaut »)."
                        ),
                        max_length=120,
                    ),
                ),
                (
                    "scope",
                    models.CharField(
                        choices=[
                            ("DEFAULT", "Défaut (fallback)"),
                            ("INSTRUCTOR", "Par formateur"),
                            ("CATEGORY", "Par catégorie"),
                            ("COURSE", "Par cours"),
                        ],
                        default="DEFAULT",
                        max_length=16,
                    ),
                ),
                (
                    "percent",
                    models.DecimalField(
                        decimal_places=2,
                        help_text=(
                            "Pourcentage prélevé par la plateforme (0-100)."
                        ),
                        max_digits=5,
                        validators=[
                            django.core.validators.MinValueValidator(0),
                            django.core.validators.MaxValueValidator(100),
                        ],
                    ),
                ),
                ("is_active", models.BooleanField(default=True)),
                ("note", models.CharField(blank=True, max_length=200)),
                (
                    "created_at",
                    models.DateTimeField(default=django.utils.timezone.now),
                ),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "category",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=models.CASCADE,
                        related_name="commission_rules",
                        to="catalog.category",
                    ),
                ),
                (
                    "course",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=models.CASCADE,
                        related_name="commission_rules",
                        to="catalog.course",
                    ),
                ),
                (
                    "instructor",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=models.CASCADE,
                        related_name="commission_rules",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["scope", "-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="commissionrule",
            index=models.Index(
                fields=["scope", "is_active"],
                name="commerce_co_scope_a3f9b8_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="commissionrule",
            index=models.Index(
                fields=["instructor", "is_active"],
                name="commerce_co_instruc_1c2e4a_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="commissionrule",
            index=models.Index(
                fields=["category", "is_active"],
                name="commerce_co_categor_9d8e21_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="commissionrule",
            index=models.Index(
                fields=["course", "is_active"],
                name="commerce_co_course_5f0a72_idx",
            ),
        ),
        migrations.AddConstraint(
            model_name="commissionrule",
            constraint=models.CheckConstraint(
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
                name="commission_scope_fk_consistent",
            ),
        ),
        migrations.RunPython(_seed_default, _unseed_default),
    ]
