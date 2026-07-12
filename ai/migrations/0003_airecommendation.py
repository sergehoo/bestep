"""AI Phase 3 — AIRecommendation + kinds d'audit.

Additive-safe : nouveau modèle + 3 kinds supplémentaires.
"""
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ("ai", "0002_aicoursegeneration"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="AIRecommendation",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("organization_id", models.PositiveIntegerField(blank=True, db_index=True, null=True)),
                ("course_id", models.PositiveIntegerField()),
                ("category", models.CharField(
                    choices=[
                        ("for_you", "Recommandé pour vous"),
                        ("continue", "Poursuivre votre parcours"),
                        ("strengthen", "Renforcer vos compétences"),
                        ("discover", "Découvrir un nouveau domaine"),
                        ("popular", "Formations populaires"),
                        ("certifying", "Formations certifiantes"),
                        ("short", "Formations courtes"),
                        ("path", "Parcours personnalisé"),
                    ],
                    default="for_you",
                    max_length=20,
                )),
                ("reason", models.CharField(blank=True, default="", max_length=280)),
                ("match_score", models.PositiveSmallIntegerField(default=50)),
                ("feedback", models.CharField(
                    choices=[
                        ("none", "Pas de retour"),
                        ("interested", "Intéressé"),
                        ("not_interested", "Pas intéressé"),
                        ("already_known", "Déjà maîtrisé"),
                        ("too_easy", "Trop facile"),
                        ("too_hard", "Trop difficile"),
                        ("later", "À voir plus tard"),
                    ],
                    default="none",
                    max_length=20,
                )),
                ("feedback_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("user", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="ai_recommendations",
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                "ordering": ["-created_at", "-id"],
                "verbose_name": "Recommandation IA",
                "verbose_name_plural": "Recommandations IA",
            },
        ),
        migrations.AddIndex(
            model_name="airecommendation",
            index=models.Index(fields=["user", "-created_at"], name="ai_reco_user_created_idx"),
        ),
        migrations.AddIndex(
            model_name="airecommendation",
            index=models.Index(fields=["user", "category"], name="ai_reco_user_cat_idx"),
        ),
        migrations.AddConstraint(
            model_name="airecommendation",
            constraint=models.UniqueConstraint(
                fields=["user", "course_id", "category"],
                name="ai_reco_unique_user_course_category",
            ),
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
                ],
                max_length=32,
            ),
        ),
    ]
