"""AI Phase 2 — AICourseGeneration + audit kinds cours.

Additive-safe : nouveau modèle + 3 nouveaux choices sur AIAuditLog.kind.
"""
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ("ai", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="AICourseGeneration",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("organization_id", models.PositiveIntegerField(blank=True, db_index=True, null=True)),
                ("brief", models.JSONField(blank=True, default=dict)),
                ("plan", models.JSONField(blank=True, default=dict)),
                ("lessons_content", models.JSONField(blank=True, default=dict)),
                ("quizzes", models.JSONField(blank=True, default=dict)),
                ("certification", models.JSONField(blank=True, default=dict)),
                ("status", models.CharField(
                    choices=[
                        ("DRAFT", "Brouillon"),
                        ("PLAN_READY", "Plan prêt"),
                        ("CONTENT_READY", "Contenu prêt"),
                        ("QUIZ_READY", "Quiz prêt"),
                        ("FINALIZED", "Publié dans le catalogue"),
                        ("FAILED", "Échec"),
                    ],
                    default="DRAFT",
                    max_length=20,
                )),
                ("error_detail", models.TextField(blank=True, default="")),
                ("finalized_course_id", models.PositiveIntegerField(blank=True, null=True)),
                ("finalized_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("user", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="ai_course_generations",
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                "ordering": ["-updated_at", "-id"],
                "verbose_name": "Génération de cours IA",
                "verbose_name_plural": "Générations de cours IA",
            },
        ),
        migrations.AddIndex(
            model_name="aicoursegeneration",
            index=models.Index(fields=["user", "-updated_at"], name="ai_coursegen_user_idx"),
        ),
        migrations.AddIndex(
            model_name="aicoursegeneration",
            index=models.Index(fields=["status"], name="ai_coursegen_status_idx"),
        ),
        migrations.AlterField(
            model_name="aiauditlog",
            name="kind",
            field=models.CharField(
                choices=[
                    ("provider_call", "Appel fournisseur"),
                    ("conversation_created", "Conversation créée"),
                    ("conversation_deleted", "Conversation supprimée"),
                    ("tool_execution", "Exécution d'outil"),
                    ("action_approval", "Approbation d'action"),
                    ("web_search", "Recherche web"),
                    ("feedback_submitted", "Feedback soumis"),
                    ("export_conversation", "Export de conversation"),
                    ("course_gen_start", "Génération de cours démarrée"),
                    ("course_gen_step", "Étape de génération de cours"),
                    ("course_gen_finalize", "Finalisation cours IA"),
                ],
                max_length=32,
            ),
        ),
    ]
