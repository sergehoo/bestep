"""
Migration P3.1 — Avatar + UserPreferences.

Ajoute :
  - User.avatar : ImageField nullable (photo de profil).
  - UserPreferences : modèle OneToOne(User) avec theme/language/notifications.

Sans casse :
  - avatar nullable → tous les utilisateurs existants restent valides.
  - UserPreferences créé à la volée pour les comptes existants via
    UserPreferences.get_or_create_for(user) (rattrapage paresseux).
  - Un signal post_save crée auto les préférences pour les nouveaux comptes.

Backfill optionnel (à exécuter une fois après deploy si besoin de pré-créer
les préférences pour tous les utilisateurs existants) :

    python manage.py shell -c "
    from compte.models import User, UserPreferences
    for u in User.objects.all():
        UserPreferences.objects.get_or_create(user=u)
    "
"""
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("compte", "0005_alter_user_managers_and_more"),
    ]

    operations = [
        # ── Avatar sur User ──
        migrations.AddField(
            model_name="user",
            name="avatar",
            field=models.ImageField(
                blank=True,
                help_text="Photo de profil (carrée recommandée, JPEG/PNG, max 5 Mo).",
                null=True,
                upload_to="avatars/",
            ),
        ),
        # ── UserPreferences ──
        migrations.CreateModel(
            name="UserPreferences",
            fields=[
                ("user", models.OneToOneField(
                    on_delete=models.deletion.CASCADE,
                    primary_key=True,
                    related_name="preferences",
                    serialize=False,
                    to=settings.AUTH_USER_MODEL,
                )),
                ("theme", models.CharField(
                    choices=[
                        ("system", "Suivre le système"),
                        ("light", "Clair"),
                        ("dark", "Sombre"),
                    ],
                    default="system",
                    help_text="Thème d'affichage (clair/sombre/auto).",
                    max_length=10,
                )),
                ("language", models.CharField(
                    choices=[("fr", "Français"), ("en", "English")],
                    default="fr",
                    help_text="Langue d'interface préférée.",
                    max_length=5,
                )),
                ("notifications_email", models.BooleanField(
                    default=True,
                    help_text=(
                        "Recevoir les notifications par email "
                        "(publications, inscriptions, paiements)."
                    ),
                )),
                ("notifications_marketing", models.BooleanField(
                    default=False,
                    help_text="Recevoir les emails marketing (nouveaux cours, offres).",
                )),
                ("notifications_course_reminders", models.BooleanField(
                    default=True,
                    help_text="Recevoir des rappels de cours non terminés.",
                )),
                ("public_profile", models.BooleanField(
                    default=False,
                    help_text="Rendre le profil visible publiquement (formateurs uniquement).",
                )),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "Préférences utilisateur",
                "verbose_name_plural": "Préférences utilisateurs",
            },
        ),
    ]
