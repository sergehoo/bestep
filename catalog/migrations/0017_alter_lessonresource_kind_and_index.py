"""Migration idempotente pour AlterField kind + RenameIndex sur lessonresource.

Django auto-génère un rename d'index chaque fois que la liste des choices
change (T8 v2 a étendu les Kind). Le rename plante en prod si l'index
d'origine n'existe pas sous ce nom. On applique le pattern
``SeparateDatabaseAndState`` + ``RunSQL`` conditionnel pour rester safe.
"""
from django.db import migrations, models


def _rename_index_if_exists(old_name: str, new_name: str) -> migrations.RunSQL:
    return migrations.RunSQL(
        sql=(
            f"DO $$ BEGIN "
            f"IF EXISTS (SELECT 1 FROM pg_class WHERE relname = '{old_name}' AND relkind = 'i') "
            f"THEN ALTER INDEX \"{old_name}\" RENAME TO \"{new_name}\"; "
            f"END IF; END $$;"
        ),
        reverse_sql=(
            f"DO $$ BEGIN "
            f"IF EXISTS (SELECT 1 FROM pg_class WHERE relname = '{new_name}' AND relkind = 'i') "
            f"THEN ALTER INDEX \"{new_name}\" RENAME TO \"{old_name}\"; "
            f"END IF; END $$;"
        ),
    )


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0016_lesson_resource"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                _rename_index_if_exists(
                    "catalog_les_lesson__98a012_idx",
                    "catalog_les_lesson__6f83a5_idx",
                ),
            ],
            state_operations=[
                migrations.RenameIndex(
                    model_name="lessonresource",
                    new_name="catalog_les_lesson__6f83a5_idx",
                    old_name="catalog_les_lesson__98a012_idx",
                ),
            ],
        ),
        migrations.AlterField(
            model_name="lessonresource",
            name="kind",
            field=models.CharField(
                choices=[
                    ("pdf", "PDF"),
                    ("image", "Image"),
                    ("audio", "Audio"),
                    ("video", "Vidéo"),
                    ("doc", "Document Word"),
                    ("sheet", "Tableur"),
                    ("slides", "Présentation"),
                    ("html", "HTML"),
                    ("text", "Texte"),
                    ("code", "Code"),
                    ("zip", "Archive"),
                    ("other", "Autre"),
                ],
                default="other",
                max_length=10,
            ),
        ),
    ]
