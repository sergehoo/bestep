"""Migration COMPTE-07 — Ajoute les champs de vérification e-mail.

Champs ajoutés sur ``compte.User`` :
    is_email_verified          (bool, default False, indexé)
    email_verification_token   (str 64, blank)
    email_verification_sent_at (datetime null)
    email_verified_at          (datetime null)
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("compte", "0006_user_avatar_userpreferences"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="is_email_verified",
            field=models.BooleanField(default=False, db_index=True),
        ),
        migrations.AddField(
            model_name="user",
            name="email_verification_token",
            field=models.CharField(max_length=64, blank=True, default=""),
        ),
        migrations.AddField(
            model_name="user",
            name="email_verification_sent_at",
            field=models.DateTimeField(null=True, blank=True),
        ),
        migrations.AddField(
            model_name="user",
            name="email_verified_at",
            field=models.DateTimeField(null=True, blank=True),
        ),
    ]
