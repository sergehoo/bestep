"""AI Phase 1 — migration initiale.

Additive-safe. Seed d'un provider "stub" par défaut pour permettre
la conversation en dev sans clé externe.
"""
from decimal import Decimal

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


def seed_stub_provider(apps, schema_editor):
    AIProvider = apps.get_model("ai", "AIProvider")
    AIModel = apps.get_model("ai", "AIModel")

    if not AIProvider.objects.filter(name="stub-dev").exists():
        stub = AIProvider.objects.create(
            name="stub-dev",
            kind="stub",
            base_url="",
            api_key="",
            is_active=True,
            priority=1000,
            timeout_seconds=30,
        )
        # Un modèle par purpose principal — permet au routeur d'avoir
        # une réponse même sans provider externe configuré.
        defaults = [
            ("chat_fast", "stub-chat-fast", 4096, "0.30"),
            ("chat_advanced", "stub-chat-advanced", 8192, "0.30"),
            ("analysis", "stub-analysis", 4096, "0.10"),
            ("image", "stub-image", 0, "0.00"),
            ("embedding", "stub-embedding", 0, "0.00"),
        ]
        for purpose, name, max_tok, temp in defaults:
            AIModel.objects.create(
                provider=stub,
                purpose=purpose,
                model_name=name,
                max_tokens=max_tok,
                temperature=Decimal(temp),
                is_default=True,
                is_active=True,
            )


def unseed_stub_provider(apps, schema_editor):
    AIProvider = apps.get_model("ai", "AIProvider")
    AIProvider.objects.filter(name="stub-dev").delete()


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="AIProvider",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=80, unique=True)),
                ("kind", models.CharField(
                    choices=[
                        ("openai", "OpenAI-compatible"),
                        ("anthropic", "Anthropic Claude"),
                        ("gemini", "Google Gemini"),
                        ("stub", "Stub (dev/tests)"),
                    ],
                    default="stub",
                    max_length=20,
                )),
                ("base_url", models.URLField(blank=True, default="")),
                ("api_key", models.CharField(blank=True, default="", max_length=255)),
                ("is_active", models.BooleanField(default=True)),
                ("priority", models.PositiveSmallIntegerField(default=100)),
                ("timeout_seconds", models.PositiveSmallIntegerField(default=60)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "ordering": ["priority", "id"],
                "verbose_name": "Fournisseur IA",
                "verbose_name_plural": "Fournisseurs IA",
            },
        ),
        migrations.CreateModel(
            name="AIModel",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("purpose", models.CharField(
                    choices=[
                        ("chat_fast", "Chat rapide"),
                        ("chat_advanced", "Chat avancé (génération)"),
                        ("analysis", "Analyse structurée"),
                        ("image", "Génération d'image"),
                        ("embedding", "Embeddings (RAG)"),
                    ],
                    max_length=20,
                )),
                ("model_name", models.CharField(max_length=120)),
                ("max_tokens", models.PositiveIntegerField(default=4096)),
                ("temperature", models.DecimalField(decimal_places=2, default=Decimal("0.30"), max_digits=4)),
                ("cost_input_per_1k", models.DecimalField(decimal_places=6, default=Decimal("0"), max_digits=10)),
                ("cost_output_per_1k", models.DecimalField(decimal_places=6, default=Decimal("0"), max_digits=10)),
                ("is_default", models.BooleanField(default=False)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("provider", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="models",
                    to="ai.aiprovider",
                )),
            ],
            options={
                "ordering": ["purpose", "-is_default", "id"],
                "verbose_name": "Modèle IA",
                "verbose_name_plural": "Modèles IA",
            },
        ),
        migrations.AddConstraint(
            model_name="aimodel",
            constraint=models.UniqueConstraint(
                fields=["provider", "purpose", "model_name"],
                name="ai_model_unique_provider_purpose_name",
            ),
        ),
        migrations.CreateModel(
            name="AIConversation",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("organization_id", models.PositiveIntegerField(blank=True, db_index=True, null=True)),
                ("title", models.CharField(default="Nouvelle conversation", max_length=200)),
                ("context", models.JSONField(blank=True, default=dict)),
                ("default_purpose", models.CharField(
                    choices=[
                        ("chat_fast", "Chat rapide"),
                        ("chat_advanced", "Chat avancé (génération)"),
                        ("analysis", "Analyse structurée"),
                        ("image", "Génération d'image"),
                        ("embedding", "Embeddings (RAG)"),
                    ],
                    default="chat_fast",
                    max_length=20,
                )),
                ("is_archived", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("last_message_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("user", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="ai_conversations",
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                "ordering": ["-last_message_at", "-id"],
                "verbose_name": "Conversation IA",
                "verbose_name_plural": "Conversations IA",
            },
        ),
        migrations.AddIndex(
            model_name="aiconversation",
            index=models.Index(fields=["user", "-last_message_at"], name="ai_conv_user_last_idx"),
        ),
        migrations.AddIndex(
            model_name="aiconversation",
            index=models.Index(fields=["organization_id", "-last_message_at"], name="ai_conv_org_last_idx"),
        ),
        migrations.CreateModel(
            name="AIMessage",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("role", models.CharField(
                    choices=[
                        ("user", "Utilisateur"),
                        ("assistant", "Assistant"),
                        ("system", "Système"),
                        ("tool", "Outil"),
                    ],
                    max_length=15,
                )),
                ("content", models.TextField(blank=True, default="")),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("page_context", models.JSONField(blank=True, default=dict)),
                ("model_used", models.CharField(blank=True, default="", max_length=120)),
                ("input_tokens", models.PositiveIntegerField(default=0)),
                ("output_tokens", models.PositiveIntegerField(default=0)),
                ("latency_ms", models.PositiveIntegerField(default=0)),
                ("feedback_score", models.SmallIntegerField(default=0)),
                ("feedback_note", models.CharField(blank=True, default="", max_length=280)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("conversation", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="messages",
                    to="ai.aiconversation",
                )),
            ],
            options={
                "ordering": ["created_at", "id"],
                "verbose_name": "Message IA",
                "verbose_name_plural": "Messages IA",
            },
        ),
        migrations.AddIndex(
            model_name="aimessage",
            index=models.Index(fields=["conversation", "created_at"], name="ai_msg_conv_created_idx"),
        ),
        migrations.CreateModel(
            name="AIUsageRecord",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("organization_id", models.PositiveIntegerField(blank=True, db_index=True, null=True)),
                ("provider", models.CharField(max_length=40)),
                ("model_name", models.CharField(max_length=120)),
                ("purpose", models.CharField(max_length=20)),
                ("input_tokens", models.PositiveIntegerField(default=0)),
                ("output_tokens", models.PositiveIntegerField(default=0)),
                ("cost_usd", models.DecimalField(decimal_places=6, default=Decimal("0"), max_digits=10)),
                ("latency_ms", models.PositiveIntegerField(default=0)),
                ("ok", models.BooleanField(default=True)),
                ("error_type", models.CharField(blank=True, default="", max_length=80)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("conversation", models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="usage_records",
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
                "verbose_name": "Enregistrement d'usage IA",
                "verbose_name_plural": "Enregistrements d'usage IA",
            },
        ),
        migrations.AddIndex(
            model_name="aiusagerecord",
            index=models.Index(fields=["-created_at"], name="ai_usage_created_idx"),
        ),
        migrations.AddIndex(
            model_name="aiusagerecord",
            index=models.Index(fields=["user", "-created_at"], name="ai_usage_user_idx"),
        ),
        migrations.AddIndex(
            model_name="aiusagerecord",
            index=models.Index(fields=["organization_id", "-created_at"], name="ai_usage_org_idx"),
        ),
        migrations.CreateModel(
            name="AIAuditLog",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("organization_id", models.PositiveIntegerField(blank=True, db_index=True, null=True)),
                ("conversation_id_snapshot", models.PositiveIntegerField(blank=True, null=True)),
                ("kind", models.CharField(
                    choices=[
                        ("provider_call", "Appel fournisseur"),
                        ("conversation_created", "Conversation créée"),
                        ("conversation_deleted", "Conversation supprimée"),
                        ("tool_execution", "Exécution d'outil"),
                        ("action_approval", "Approbation d'action"),
                        ("web_search", "Recherche web"),
                        ("feedback_submitted", "Feedback soumis"),
                        ("export_conversation", "Export de conversation"),
                    ],
                    max_length=32,
                )),
                ("payload", models.JSONField(blank=True, default=dict)),
                ("ip", models.GenericIPAddressField(blank=True, null=True)),
                ("ok", models.BooleanField(default=True)),
                ("error_type", models.CharField(blank=True, default="", max_length=80)),
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
                "verbose_name": "Journal IA",
                "verbose_name_plural": "Journaux IA",
            },
        ),
        migrations.AddIndex(
            model_name="aiauditlog",
            index=models.Index(fields=["-created_at"], name="ai_audit_created_idx"),
        ),
        migrations.AddIndex(
            model_name="aiauditlog",
            index=models.Index(fields=["kind"], name="ai_audit_kind_idx"),
        ),
        migrations.RunPython(seed_stub_provider, reverse_code=unseed_stub_provider),
    ]
