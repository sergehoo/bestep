"""
Migration P1.1 — Cycle de vie des cours.

Ajoute :
  - Course.archived_at (datetime nullable) — peuplé au passage en ARCHIVED,
    remis à NULL au restore.
  - CourseLifecycleEvent — log d'audit des transitions (CREATED / PUBLISHED /
    UNPUBLISHED / ARCHIVED / RESTORED / DELETED).

Sans casse : aucun champ existant n'est modifié, aucune donnée n'est touchée.
Les cours déjà ARCHIVED gardent archived_at=NULL (legacy) — le service de
restore en tient compte. Un backfill optionnel peut être lancé via
``python manage.py shell -c "from catalog.lifecycle import backfill_archived_at;
backfill_archived_at()"`` mais ce n'est pas obligatoire.
"""
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("catalog", "0010_pg_trgm_and_perf_indexes"),
    ]

    operations = [
        migrations.AddField(
            model_name="course",
            name="archived_at",
            field=models.DateTimeField(
                blank=True,
                help_text="Renseigné lors du passage en ARCHIVED. Remis à NULL au restore.",
                null=True,
            ),
        ),
        migrations.CreateModel(
            name="CourseLifecycleEvent",
            fields=[
                ("id", models.AutoField(
                    auto_created=True,
                    primary_key=True,
                    serialize=False,
                    verbose_name="ID",
                )),
                ("course_title_snapshot", models.CharField(blank=True, max_length=200)),
                ("course_id_snapshot", models.PositiveIntegerField(blank=True, null=True)),
                ("action", models.CharField(
                    choices=[
                        ("CREATED", "Création"),
                        ("UPDATED", "Modification métier"),
                        ("SUBMITTED", "Soumis en validation"),
                        ("PUBLISHED", "Publié"),
                        ("UNPUBLISHED", "Dépublié"),
                        ("ARCHIVED", "Archivé"),
                        ("RESTORED", "Restauré"),
                        ("DELETED", "Supprimé"),
                    ],
                    max_length=20,
                )),
                ("from_status", models.CharField(blank=True, max_length=12)),
                ("to_status", models.CharField(blank=True, max_length=12)),
                ("note", models.CharField(
                    blank=True,
                    help_text="Justification optionnelle.",
                    max_length=500,
                )),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("actor", models.ForeignKey(
                    help_text="Utilisateur qui a déclenché la transition.",
                    null=True,
                    on_delete=models.deletion.SET_NULL,
                    related_name="course_lifecycle_events",
                    to=settings.AUTH_USER_MODEL,
                )),
                ("course", models.ForeignKey(
                    help_text="Cours concerné (SET_NULL pour préserver l'historique).",
                    null=True,
                    on_delete=models.deletion.SET_NULL,
                    related_name="lifecycle_events",
                    to="catalog.course",
                )),
            ],
            options={
                "verbose_name": "Événement de cycle de vie d'un cours",
                "verbose_name_plural": "Événements de cycle de vie des cours",
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="courselifecycleevent",
            index=models.Index(
                fields=["course", "-created_at"],
                name="catalog_cou_course__b5b8c1_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="courselifecycleevent",
            index=models.Index(
                fields=["actor", "-created_at"],
                name="catalog_cou_actor__a4e7f3_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="courselifecycleevent",
            index=models.Index(
                fields=["action", "-created_at"],
                name="catalog_cou_action__c2d9a8_idx",
            ),
        ),
    ]
