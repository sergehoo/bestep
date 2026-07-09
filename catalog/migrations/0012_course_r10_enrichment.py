"""
0012_course_r10_enrichment.py — R10.1

Ajoute 4 champs enrichis au modèle Course pour lever les dérivations
client-side de R9 :

    - level (choices : BEGINNER / INTERMEDIATE / ADVANCED / ALL, default ALL)
    - language (varchar 8, default 'fr')
    - old_price (Decimal, nullable) — prix barré pour badge promo
    - promotion_until (DateTime, nullable) — fin de promo

Migration additive-only, safe à déployer live (aucun DROP, tous les
champs ont un default ou sont nullable).
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0011_course_lifecycle"),
    ]

    operations = [
        migrations.AddField(
            model_name="course",
            name="level",
            field=models.CharField(
                choices=[
                    ("BEGINNER", "Débutant"),
                    ("INTERMEDIATE", "Intermédiaire"),
                    ("ADVANCED", "Avancé"),
                    ("ALL", "Tous niveaux"),
                ],
                default="ALL",
                help_text="Niveau ciblé du cours. Affiché en badge sur les cartes.",
                max_length=15,
            ),
        ),
        migrations.AddField(
            model_name="course",
            name="language",
            field=models.CharField(
                default="fr",
                help_text="Code langue ISO 639-1 (ex. 'fr', 'en'). Affiché en clair côté UI.",
                max_length=8,
            ),
        ),
        migrations.AddField(
            model_name="course",
            name="old_price",
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                help_text="Prix barré. Active le badge 'Promotion' si > price.",
                max_digits=12,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="course",
            name="promotion_until",
            field=models.DateTimeField(
                blank=True,
                help_text="Fin de la promotion. Après cette date, old_price doit être ignoré.",
                null=True,
            ),
        ),
    ]
