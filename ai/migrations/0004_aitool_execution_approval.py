"""AI Phase 4 — AIToolExecution + AIActionApproval.

Additive-safe. Deux nouvelles tables + rien touché sur l'existant.
"""
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ("ai", "0003_airecommendation"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="AIToolExecution",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("tool_key", models.CharField(db_index=True, max_length=80)),
                ("organization_id", models.PositiveIntegerField(blank=True, db_index=True, null=True)),
                ("input_payload", models.JSONField(blank=True, default=dict)),
                ("output_payload", models.JSONField(blank=True, default=dict)),
                ("status", models.CharField(
                    choices=[
                        ("PENDING_APPROVAL", "En attente d'approbation"),
                        ("RUNNING", "En cours"),
                        ("SUCCESS", "Succès"),
                        ("FAILED", "Échec"),
                        ("CANCELLED", "Annulé"),
                        ("DENIED", "Refusé"),
                    ],
                    default="PENDING_APPROVAL",
                    max_length=20,
                )),
                ("error_detail", models.TextField(blank=True, default="")),
                ("latency_ms", models.PositiveIntegerField(default=0)),
                ("ip", models.GenericIPAddressField(blank=True, null=True)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("completed_at", models.DateTimeField(blank=True, null=True)),
                ("conversation", models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="tool_executions",
                    to="ai.aiconversation",
                )),
                ("user", models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="+",
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                "ordering": ["-created_at", "-id"],
                "verbose_name": "Exécution d'outil IA",
                "verbose_name_plural": "Exécutions d'outil IA",
            },
        ),
        migrations.AddIndex(
            model_name="aitoolexecution",
            index=models.Index(fields=["-created_at"], name="ai_toolex_created_idx"),
        ),
        migrations.AddIndex(
            model_name="aitoolexecution",
            index=models.Index(fields=["tool_key", "-created_at"], name="ai_toolex_key_idx"),
        ),
        migrations.AddIndex(
            model_name="aitoolexecution",
            index=models.Index(fields=["user", "-created_at"], name="ai_toolex_user_idx"),
        ),
        migrations.AddIndex(
            model_name="aitoolexecution",
            index=models.Index(fields=["status"], name="ai_toolex_status_idx"),
        ),
        migrations.CreateModel(
            name="AIActionApproval",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("tool_key", models.CharField(max_length=80)),
                ("level", models.PositiveSmallIntegerField(
                    choices=[(0, "Sans confirmation"), (1, "Confirmation simple"), (2, "Confirmation renforcée")],
                    default=1,
                )),
                ("status", models.CharField(
                    choices=[
                        ("PENDING", "En attente"),
                        ("CONFIRMED", "Confirmée"),
                        ("CANCELLED", "Annulée"),
                        ("EXPIRED", "Expirée"),
                    ],
                    default="PENDING",
                    max_length=15,
                )),
                ("summary", models.CharField(blank=True, default="", max_length=280)),
                ("impact", models.TextField(blank=True, default="")),
                ("affected_items", models.JSONField(blank=True, default=list)),
                ("permissions_used", models.JSONField(blank=True, default=list)),
                ("input_payload", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("resolved_at", models.DateTimeField(blank=True, null=True)),
                ("expires_at", models.DateTimeField(blank=True, null=True)),
                ("execution", models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="approval",
                    to="ai.aitoolexecution",
                )),
                ("user", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="+",
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                "ordering": ["-created_at", "-id"],
                "verbose_name": "Approbation d'action IA",
                "verbose_name_plural": "Approbations d'action IA",
            },
        ),
        migrations.AddIndex(
            model_name="aiactionapproval",
            index=models.Index(fields=["user", "-created_at"], name="ai_appr_user_idx"),
        ),
        migrations.AddIndex(
            model_name="aiactionapproval",
            index=models.Index(fields=["status"], name="ai_appr_status_idx"),
        ),
    ]
