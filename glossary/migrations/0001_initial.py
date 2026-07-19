"""Migration initiale du module lexique (GLOSS-1)."""
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("catalog", "0016_lesson_resource"),
    ]

    operations = [
        migrations.CreateModel(
            name="GlossaryCategory",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=120, unique=True)),
                ("slug", models.SlugField(max_length=140, unique=True)),
                ("description", models.TextField(blank=True)),
                ("icon", models.CharField(blank=True, help_text="Nom lucide-react (ex. 'landmark', 'trending-up').", max_length=40)),
                ("color", models.CharField(blank=True, help_text="Ex. 'primary', 'emerald', 'amber' pour palette Tailwind.", max_length=20)),
                ("is_active", models.BooleanField(default=True)),
                ("order", models.PositiveIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("parent", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="children", to="glossary.glossarycategory")),
            ],
            options={
                "verbose_name": "Catégorie du lexique",
                "verbose_name_plural": "Catégories du lexique",
                "ordering": ["order", "name"],
            },
        ),
        migrations.CreateModel(
            name="GlossaryTerm",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("word", models.CharField(max_length=200)),
                ("slug", models.SlugField(max_length=220, unique=True)),
                ("search_key", models.CharField(blank=True, db_index=True, help_text="Version normalisée du mot (lowercase, sans accents).", max_length=240)),
                ("short_definition", models.CharField(help_text="Définition courte affichée dans les tooltips (≤ 400 car).", max_length=400)),
                ("long_definition", models.TextField(blank=True, help_text="Définition complète (HTML propre) affichée sur la page détail.")),
                ("pronunciation", models.CharField(blank=True, help_text="Prononciation phonétique (facultatif).", max_length=200)),
                ("language", models.CharField(default="fr", max_length=8)),
                ("level", models.CharField(choices=[("beginner", "Débutant"), ("intermediate", "Intermédiaire"), ("advanced", "Avancé")], default="beginner", max_length=16)),
                ("domain", models.CharField(blank=True, help_text="Domaine métier (finance, épargne, immobilier…).", max_length=80)),
                ("scope", models.CharField(choices=[("global", "Global (toute la plateforme)"), ("course", "Cours spécifique"), ("section", "Section spécifique"), ("lesson", "Leçon spécifique")], default="global", help_text="Portée du terme.", max_length=16)),
                ("status", models.CharField(choices=[("draft", "Brouillon"), ("pending", "En attente de validation"), ("validated", "Validé"), ("rejected", "Rejeté"), ("archived", "Archivé")], default="draft", max_length=16)),
                ("is_active", models.BooleanField(default=True)),
                ("is_case_sensitive", models.BooleanField(default=False)),
                ("enable_auto_detection", models.BooleanField(default=True, help_text="Détecte ce terme automatiquement dans le contenu des leçons.")),
                ("illustration_url", models.URLField(blank=True)),
                ("external_source", models.URLField(blank=True)),
                ("view_count", models.PositiveIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("published_at", models.DateTimeField(blank=True, null=True)),
                ("category", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="terms", to="glossary.glossarycategory")),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="glossary_terms_created", to=settings.AUTH_USER_MODEL)),
                ("validated_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="glossary_terms_validated", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "verbose_name": "Terme du lexique",
                "verbose_name_plural": "Termes du lexique",
                "ordering": ["word"],
                "indexes": [
                    models.Index(fields=["search_key"], name="glossary_gl_search__c05a45_idx"),
                    models.Index(fields=["status", "is_active"], name="glossary_gl_status_11e30e_idx"),
                    models.Index(fields=["scope"], name="glossary_gl_scope_1b3fd0_idx"),
                ],
            },
        ),
        migrations.CreateModel(
            name="GlossaryVariant",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("variant", models.CharField(max_length=200)),
                ("search_key", models.CharField(blank=True, db_index=True, max_length=240)),
                ("variant_type", models.CharField(choices=[("synonym", "Synonyme"), ("acronym", "Acronyme"), ("plural", "Pluriel"), ("abbreviation", "Abréviation"), ("alternative_spelling", "Orthographe alternative")], default="synonym", max_length=32)),
                ("is_case_sensitive", models.BooleanField(default=False)),
                ("term", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="variants", to="glossary.glossaryterm")),
            ],
            options={
                "ordering": ["variant"],
                "indexes": [
                    models.Index(fields=["search_key"], name="glossary_gl_search__c69e78_idx"),
                ],
            },
        ),
        migrations.AddConstraint(
            model_name="glossaryvariant",
            constraint=models.UniqueConstraint(fields=("term", "variant"), name="glossary_variant_unique"),
        ),
        migrations.CreateModel(
            name="GlossaryExample",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("example", models.TextField()),
                ("source", models.CharField(blank=True, max_length=240)),
                ("order", models.PositiveIntegerField(default=0)),
                ("term", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="examples", to="glossary.glossaryterm")),
            ],
            options={"ordering": ["order", "id"]},
        ),
        migrations.CreateModel(
            name="GlossaryAssociation",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("priority", models.PositiveIntegerField(default=100, help_text="Plus haut = priorité plus forte (custom > global).")),
                ("custom_short_definition", models.CharField(blank=True, max_length=400)),
                ("custom_long_definition", models.TextField(blank=True)),
                ("is_detection_enabled", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("course", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="glossary_associations", to="catalog.course")),
                ("lesson", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="glossary_associations", to="catalog.lesson")),
                ("section", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="glossary_associations", to="catalog.coursesection")),
                ("term", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="associations", to="glossary.glossaryterm")),
            ],
            options={
                "indexes": [
                    models.Index(fields=["course", "is_detection_enabled"], name="glossary_gl_course__c8de1a_idx"),
                    models.Index(fields=["term", "course"], name="glossary_gl_term_id_57e0a3_idx"),
                ],
            },
        ),
        migrations.AddConstraint(
            model_name="glossaryassociation",
            constraint=models.UniqueConstraint(fields=("term", "course", "section", "lesson"), name="glossary_association_unique_scope"),
        ),
        migrations.CreateModel(
            name="GlossaryRelation",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("relation_type", models.CharField(choices=[("related", "Terme connexe"), ("synonym", "Synonyme"), ("antonym", "Antonyme"), ("broader", "Terme plus général"), ("narrower", "Terme plus spécifique")], default="related", max_length=16)),
                ("source_term", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="relations_out", to="glossary.glossaryterm")),
                ("target_term", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="relations_in", to="glossary.glossaryterm")),
            ],
        ),
        migrations.AddConstraint(
            model_name="glossaryrelation",
            constraint=models.UniqueConstraint(fields=("source_term", "target_term", "relation_type"), name="glossary_relation_unique"),
        ),
        migrations.AddConstraint(
            model_name="glossaryrelation",
            constraint=models.CheckConstraint(check=~models.Q(source_term=models.F("target_term")), name="glossary_relation_not_self"),
        ),
        migrations.CreateModel(
            name="GlossarySuggestion",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("kind", models.CharField(choices=[("new_term", "Nouveau terme"), ("definition_update", "Amélioration de définition"), ("error_report", "Signalement d'erreur")], default="new_term", max_length=32)),
                ("proposed_word", models.CharField(blank=True, max_length=200)),
                ("proposed_definition", models.TextField(blank=True)),
                ("context", models.TextField(blank=True, help_text="Extrait de contexte où le terme a été rencontré.")),
                ("status", models.CharField(choices=[("pending", "En attente"), ("approved", "Approuvée"), ("rejected", "Rejetée")], default="pending", max_length=16)),
                ("review_comment", models.TextField(blank=True)),
                ("reviewed_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("course", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="glossary_suggestions", to="catalog.course")),
                ("lesson", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="glossary_suggestions", to="catalog.lesson")),
                ("reviewed_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="glossary_suggestions_reviewed", to=settings.AUTH_USER_MODEL)),
                ("suggested_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="glossary_suggestions", to=settings.AUTH_USER_MODEL)),
                ("term", models.ForeignKey(blank=True, help_text="Terme concerné (null si nouveau terme proposé).", null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="suggestions", to="glossary.glossaryterm")),
            ],
            options={
                "ordering": ["-created_at"],
                "indexes": [
                    models.Index(fields=["status", "created_at"], name="glossary_gl_status_15a3a4_idx"),
                ],
            },
        ),
        migrations.CreateModel(
            name="GlossaryFavorite",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("term", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="favorited_by", to="glossary.glossaryterm")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="glossary_favorites", to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.AddConstraint(
            model_name="glossaryfavorite",
            constraint=models.UniqueConstraint(fields=("user", "term"), name="glossary_favorite_unique"),
        ),
        migrations.CreateModel(
            name="GlossaryUserNote",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("note", models.TextField(blank=True)),
                ("status", models.CharField(choices=[("new", "Nouveau"), ("understood", "Compris"), ("review", "À revoir")], default="new", max_length=16)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("term", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="user_notes", to="glossary.glossaryterm")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="glossary_notes", to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.AddConstraint(
            model_name="glossaryusernote",
            constraint=models.UniqueConstraint(fields=("user", "term"), name="glossary_note_unique"),
        ),
        migrations.CreateModel(
            name="GlossaryView",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("viewed_at", models.DateTimeField(auto_now_add=True)),
                ("course", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to="catalog.course")),
                ("lesson", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to="catalog.lesson")),
                ("term", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="view_events", to="glossary.glossaryterm")),
                ("user", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="glossary_views", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "ordering": ["-viewed_at"],
                "indexes": [
                    models.Index(fields=["user", "-viewed_at"], name="glossary_gl_user_id_37c0a1_idx"),
                ],
            },
        ),
        migrations.CreateModel(
            name="GlossaryRevision",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("version", models.PositiveIntegerField(default=1)),
                ("previous_data", models.JSONField(blank=True, default=dict)),
                ("new_data", models.JSONField(blank=True, default=dict)),
                ("change_reason", models.CharField(blank=True, max_length=240)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("modified_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="glossary_revisions", to=settings.AUTH_USER_MODEL)),
                ("term", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="revisions", to="glossary.glossaryterm")),
            ],
            options={
                "ordering": ["-created_at"],
                "indexes": [
                    models.Index(fields=["term", "-version"], name="glossary_gl_term_id_a5b1c0_idx"),
                ],
            },
        ),
    ]
