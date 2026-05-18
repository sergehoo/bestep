"""Migration V4.D — CORRECTIFS audit CAT-14, API-50.

- CAT-14 : index pg_trgm sur ``Course.title`` pour accélérer les
  recherches `icontains` (catalogue + admin search).
- API-50 : index composé ``(-published_at, -created_at)`` pour
  matcher l'ordering par défaut du CourseViewSet.

PREREQUIS : l'extension PostgreSQL ``pg_trgm`` doit être activée. Cette
migration la crée si elle n'existe pas (nécessite des droits SUPERUSER
ou que l'extension soit autorisée par config DBA).

Compatibilité données : aucune.
"""
from django.contrib.postgres.indexes import GinIndex
from django.contrib.postgres.operations import TrigramExtension
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0009_mediauploadlog"),
    ]

    operations = [
        # Active l'extension pg_trgm (idempotent).
        TrigramExtension(),

        # Index GIN trigramme sur title pour ILIKE/icontains rapides.
        migrations.AddIndex(
            model_name="course",
            index=GinIndex(
                fields=["title"],
                opclasses=["gin_trgm_ops"],
                name="course_title_trgm_idx",
            ),
        ),
        # Index composé pour l'ordering principal.
        migrations.AddIndex(
            model_name="course",
            index=models.Index(
                fields=["-published_at", "-created_at"],
                name="course_pub_created_idx",
            ),
        ),
        # Index sur company_only (filtre fréquent côté API publique).
        migrations.AddIndex(
            model_name="course",
            index=models.Index(
                fields=["status", "company_only"],
                name="course_status_company_idx",
            ),
        ),
    ]
