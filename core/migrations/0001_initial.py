"""R46 — Migration initiale core : PlatformSettings + Historique.

Additive-safe : les deux tables sont neuves, aucune donnée existante
n'est touchée. Une `RunPython` crée la ligne singleton (pk=1) avec
les valeurs par défaut pour que la première lecture soit garantie.
"""
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone

import core.models as core_models


def seed_singleton(apps, schema_editor):
    PlatformSettings = apps.get_model("core", "PlatformSettings")
    if not PlatformSettings.objects.filter(pk=1).exists():
        PlatformSettings.objects.create(
            pk=1,
            data=core_models._default_settings(),
            version=1,
        )


def unseed_singleton(apps, schema_editor):
    PlatformSettings = apps.get_model("core", "PlatformSettings")
    PlatformSettings.objects.filter(pk=1).delete()


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="PlatformSettings",
            fields=[
                (
                    "id",
                    models.AutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "data",
                    models.JSONField(default=core_models._default_settings),
                ),
                ("version", models.PositiveIntegerField(default=1)),
                (
                    "updated_at",
                    models.DateTimeField(default=django.utils.timezone.now),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "Paramètres plateforme",
                "verbose_name_plural": "Paramètres plateforme",
            },
        ),
        migrations.CreateModel(
            name="PlatformSettingsHistory",
            fields=[
                (
                    "id",
                    models.AutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("version", models.PositiveIntegerField()),
                ("before", models.JSONField(default=dict)),
                ("after", models.JSONField(default=dict)),
                (
                    "note",
                    models.CharField(blank=True, default="", max_length=280),
                ),
                (
                    "created_at",
                    models.DateTimeField(default=django.utils.timezone.now),
                ),
                (
                    "actor",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at", "-id"],
                "verbose_name": "Historique paramètres",
                "verbose_name_plural": "Historique paramètres",
            },
        ),
        migrations.AddIndex(
            model_name="platformsettingshistory",
            index=models.Index(
                fields=["-created_at"], name="core_platfo_created_idx"
            ),
        ),
        migrations.RunPython(seed_singleton, reverse_code=unseed_singleton),
    ]
