"""Migration T8 — Modèle LessonResource (ressources externes de leçon)."""
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0015_alter_course_certificate_template"),
    ]

    operations = [
        migrations.CreateModel(
            name="LessonResource",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("title", models.CharField(help_text="Nom affiché à l'apprenant. Par défaut, le nom du fichier.", max_length=200)),
                ("file", models.FileField(help_text="Fichier téléchargeable. Max 20 Mo.", upload_to="lesson_resources/%Y/%m/")),
                (
                    "kind",
                    models.CharField(
                        choices=[
                            ("pdf", "PDF"),
                            ("image", "Image"),
                            ("html", "HTML"),
                            ("zip", "Archive ZIP"),
                            ("other", "Autre"),
                        ],
                        default="other",
                        max_length=10,
                    ),
                ),
                ("size", models.PositiveBigIntegerField(default=0, help_text="Taille en octets (rempli automatiquement).")),
                ("content_type", models.CharField(blank=True, default="", max_length=120)),
                ("order", models.PositiveIntegerField(default=1)),
                (
                    "is_downloadable",
                    models.BooleanField(
                        default=True,
                        help_text=(
                            "Si False, le fichier reste visible mais pas téléchargeable "
                            "(streaming inline uniquement — utile pour PDF/HTML)."
                        ),
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "lesson",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="resources",
                        to="catalog.lesson",
                    ),
                ),
            ],
            options={
                "ordering": ["order", "id"],
                "indexes": [models.Index(fields=["lesson", "order"], name="catalog_les_lesson__98a012_idx")],
            },
        ),
    ]
