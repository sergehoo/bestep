"""AI Phase 6 — Centre admin (Quota + ImageGen + ContentVersion + audits).

Additive-safe.
"""
from decimal import Decimal
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ("ai", "0005_knowledge_base"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="AIQuota",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("target_type", models.CharField(
                    choices=[
                        ("GLOBAL", "Global (toute la plateforme)"),
                        ("ROLE", "Par rôle"),
                        ("USER", "Utilisateur spécifique"),
                        ("ORG", "Organisation"),
                    ],
                    default="GLOBAL",
                    max_length=10,
                )),
                ("target_role", models.CharField(blank=True, default="", max_length=30)),
                ("target_org_id", models.PositiveIntegerField(blank=True, db_index=True, null=True)),
                ("period", models.CharField(
                    choices=[("DAILY", "Journalier"), ("MONTHLY", "Mensuel")],
                    default="MONTHLY",
                    max_length=10,
                )),
                ("max_calls", models.PositiveIntegerField(default=0)),
                ("max_input_tokens", models.PositiveIntegerField(default=0)),
                ("max_output_tokens", models.PositiveIntegerField(default=0)),
                ("max_cost_usd", models.DecimalField(decimal_places=4, default=Decimal("0"), max_digits=10)),
                ("is_active", models.BooleanField(default=True)),
                ("note", models.CharField(blank=True, default="", max_length=280)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("target_user", models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="+",
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                "ordering": ["target_type", "target_role", "id"],
                "verbose_name": "Quota IA",
                "verbose_name_plural": "Quotas IA",
            },
        ),
        migrations.AddIndex(
            model_name="aiquota",
            index=models.Index(fields=["target_type", "is_active"], name="ai_quota_ttype_idx"),
        ),
        migrations.AddIndex(
            model_name="aiquota",
            index=models.Index(fields=["target_org_id"], name="ai_quota_org_idx"),
        ),
        migrations.CreateModel(
            name="AIImageGeneration",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("organization_id", models.PositiveIntegerField(blank=True, db_index=True, null=True)),
                ("prompt", models.TextField()),
                ("style", models.CharField(blank=True, default="", max_length=60)),
                ("aspect_ratio", models.CharField(blank=True, default="1:1", max_length=10)),
                ("width", models.PositiveSmallIntegerField(default=1024)),
                ("height", models.PositiveSmallIntegerField(default=1024)),
                ("provider", models.CharField(default="stub", max_length=40)),
                ("model_used", models.CharField(blank=True, default="", max_length=120)),
                ("status", models.CharField(
                    choices=[
                        ("PENDING", "En attente"),
                        ("RUNNING", "En cours"),
                        ("SUCCESS", "Succès"),
                        ("FAILED", "Échec"),
                    ],
                    default="PENDING",
                    max_length=10,
                )),
                ("urls", models.JSONField(blank=True, default=list)),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("course_id", models.PositiveIntegerField(blank=True, null=True)),
                ("lesson_id", models.PositiveIntegerField(blank=True, null=True)),
                ("cost_usd", models.DecimalField(decimal_places=4, default=Decimal("0"), max_digits=8)),
                ("error_detail", models.TextField(blank=True, default="")),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("completed_at", models.DateTimeField(blank=True, null=True)),
                ("user", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="ai_image_generations",
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                "ordering": ["-created_at", "-id"],
                "verbose_name": "Génération d'image IA",
                "verbose_name_plural": "Générations d'image IA",
            },
        ),
        migrations.AddIndex(
            model_name="aiimagegeneration",
            index=models.Index(fields=["user", "-created_at"], name="ai_imggen_user_idx"),
        ),
        migrations.AddIndex(
            model_name="aiimagegeneration",
            index=models.Index(fields=["status"], name="ai_imggen_status_idx"),
        ),
        migrations.CreateModel(
            name="AIContentVersion",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("entity_type", models.CharField(
                    choices=[("COURSE", "Cours"), ("SECTION", "Section"), ("LESSON", "Leçon")],
                    max_length=10,
                )),
                ("entity_id", models.PositiveIntegerField(db_index=True)),
                ("version", models.PositiveIntegerField(default=1)),
                ("origin", models.CharField(
                    choices=[
                        ("AI", "IA (générateur/agent)"),
                        ("HUMAN", "Humain"),
                        ("MIXED", "Édité par un humain à partir d'un contenu IA"),
                    ],
                    default="AI",
                    max_length=10,
                )),
                ("payload", models.JSONField(blank=True, default=dict)),
                ("diff_summary", models.CharField(blank=True, default="", max_length=280)),
                ("generation_id", models.PositiveIntegerField(blank=True, null=True)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("author", models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="+",
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                "ordering": ["-created_at", "-id"],
                "verbose_name": "Version contenu IA",
                "verbose_name_plural": "Versions contenu IA",
            },
        ),
        migrations.AddIndex(
            model_name="aicontentversion",
            index=models.Index(fields=["entity_type", "entity_id", "-created_at"], name="ai_ctntver_ent_idx"),
        ),
        migrations.AddIndex(
            model_name="aicontentversion",
            index=models.Index(fields=["origin"], name="ai_ctntver_origin_idx"),
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
                    ("text_transform", "Transformation de texte IA"),
                    ("reco_generated", "Recommandations générées"),
                    ("reco_feedback", "Feedback recommandation"),
                    ("kb_document_indexed", "Document KB indexé"),
                    ("kb_search", "Recherche KB"),
                    ("quota_exceeded", "Quota dépassé"),
                    ("image_gen", "Génération d'image"),
                    ("content_version", "Nouvelle version contenu"),
                    ("provider_test", "Test de connexion provider"),
                ],
                max_length=32,
            ),
        ),
    ]
