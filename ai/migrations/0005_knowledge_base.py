"""AI Phase 5 — Knowledge Base + Web search.

Additive-safe. 4 nouvelles tables (spaces, documents, chunks,
web_searches) + 2 nouveaux kinds d'audit + seed d'un espace GLOBAL
par défaut.
"""
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


def seed_global_space(apps, schema_editor):
    AIKnowledgeSpace = apps.get_model("ai", "AIKnowledgeSpace")
    if not AIKnowledgeSpace.objects.filter(scope="GLOBAL", name="Global").exists():
        AIKnowledgeSpace.objects.create(
            scope="GLOBAL",
            name="Global",
            description="Documentation transverse Best-Épargne (FAQ, guides, politiques).",
        )


def unseed_global_space(apps, schema_editor):
    AIKnowledgeSpace = apps.get_model("ai", "AIKnowledgeSpace")
    AIKnowledgeSpace.objects.filter(scope="GLOBAL", name="Global").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("ai", "0004_aitool_execution_approval"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="AIKnowledgeSpace",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=140)),
                ("scope", models.CharField(
                    choices=[
                        ("GLOBAL", "Globale"),
                        ("ORG", "Par organisation"),
                        ("COURSE", "Par cours"),
                        ("INSTRUCTOR", "Formateur"),
                        ("PRIVATE", "Privé utilisateur"),
                        ("ADMIN", "Admin plateforme"),
                    ],
                    default="GLOBAL",
                    max_length=15,
                )),
                ("organization_id", models.PositiveIntegerField(blank=True, db_index=True, null=True)),
                ("course_id", models.PositiveIntegerField(blank=True, db_index=True, null=True)),
                ("description", models.CharField(blank=True, default="", max_length=280)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("owner", models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="ai_knowledge_spaces",
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                "ordering": ["scope", "name"],
                "verbose_name": "Espace de connaissance IA",
                "verbose_name_plural": "Espaces de connaissance IA",
            },
        ),
        migrations.AddIndex(
            model_name="aiknowledgespace",
            index=models.Index(fields=["scope"], name="ai_kbspace_scope_idx"),
        ),
        migrations.CreateModel(
            name="AIKnowledgeDocument",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("title", models.CharField(max_length=240)),
                ("source_url", models.URLField(blank=True, default="")),
                ("doc_type", models.CharField(
                    choices=[
                        ("TEXT", "Texte brut"),
                        ("MARKDOWN", "Markdown"),
                        ("HTML", "HTML"),
                        ("PDF", "PDF"),
                        ("DOCX", "Word"),
                        ("COURSE", "Cours plateforme"),
                        ("LESSON", "Leçon plateforme"),
                        ("FAQ", "FAQ"),
                        ("POLICY", "Politique"),
                    ],
                    default="MARKDOWN",
                    max_length=20,
                )),
                ("language", models.CharField(default="fr", max_length=10)),
                ("version", models.PositiveIntegerField(default=1)),
                ("content", models.TextField(blank=True, default="")),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("status", models.CharField(
                    choices=[
                        ("PENDING", "En attente"),
                        ("INDEXING", "Indexation en cours"),
                        ("INDEXED", "Indexé"),
                        ("FAILED", "Échec"),
                    ],
                    default="PENDING",
                    max_length=15,
                )),
                ("error_detail", models.TextField(blank=True, default="")),
                ("chunks_count", models.PositiveIntegerField(default=0)),
                ("embedding_dim", models.PositiveSmallIntegerField(default=0)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("indexed_at", models.DateTimeField(blank=True, null=True)),
                ("created_by", models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="+",
                    to=settings.AUTH_USER_MODEL,
                )),
                ("space", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="documents",
                    to="ai.aiknowledgespace",
                )),
            ],
            options={
                "ordering": ["-updated_at", "-id"],
                "verbose_name": "Document KB IA",
                "verbose_name_plural": "Documents KB IA",
            },
        ),
        migrations.AddIndex(
            model_name="aiknowledgedocument",
            index=models.Index(fields=["space", "-updated_at"], name="ai_kbdoc_space_upd_idx"),
        ),
        migrations.AddIndex(
            model_name="aiknowledgedocument",
            index=models.Index(fields=["status"], name="ai_kbdoc_status_idx"),
        ),
        migrations.CreateModel(
            name="AIKnowledgeChunk",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("idx", models.PositiveIntegerField(default=0)),
                ("text", models.TextField()),
                ("embedding", models.JSONField(blank=True, default=list)),
                ("tokens", models.PositiveIntegerField(default=0)),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("document", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="chunks",
                    to="ai.aiknowledgedocument",
                )),
            ],
            options={
                "ordering": ["document", "idx"],
                "verbose_name": "Chunk KB IA",
                "verbose_name_plural": "Chunks KB IA",
            },
        ),
        migrations.AddIndex(
            model_name="aiknowledgechunk",
            index=models.Index(fields=["document", "idx"], name="ai_kbchunk_doc_idx_idx"),
        ),
        migrations.AddConstraint(
            model_name="aiknowledgechunk",
            constraint=models.UniqueConstraint(
                fields=["document", "idx"],
                name="ai_kbchunk_unique_doc_idx",
            ),
        ),
        migrations.CreateModel(
            name="AIWebSearch",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("query", models.CharField(max_length=500)),
                ("provider", models.CharField(default="stub", max_length=40)),
                ("results_count", models.PositiveIntegerField(default=0)),
                ("domains", models.JSONField(blank=True, default=list)),
                ("payload", models.JSONField(blank=True, default=dict)),
                ("ok", models.BooleanField(default=True)),
                ("error_detail", models.TextField(blank=True, default="")),
                ("ip", models.GenericIPAddressField(blank=True, null=True)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
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
                "verbose_name": "Recherche web IA",
                "verbose_name_plural": "Recherches web IA",
            },
        ),
        migrations.AddIndex(
            model_name="aiwebsearch",
            index=models.Index(fields=["-created_at"], name="ai_websrch_created_idx"),
        ),
        migrations.AddIndex(
            model_name="aiwebsearch",
            index=models.Index(fields=["user", "-created_at"], name="ai_websrch_user_idx"),
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
                ],
                max_length=32,
            ),
        ),
        migrations.RunPython(seed_global_space, reverse_code=unseed_global_space),
    ]
