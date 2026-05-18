"""Migration V2.A — CORRECTIFS CERT-03, CERT-08.

- Ajoute revoked_at + revoked_reason sur IssuedCertificate.
- Remplace unique_together(user, course) par UniqueConstraint partielle
  (active uniquement quand revoked_at IS NULL).
- Ajoute deux indexes (verification_hash, issued_at).

Pas de risque sur les données existantes : tous les certificats actuels ont
``revoked_at=NULL`` et restent uniques.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("certifications", "0002_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="issuedcertificate",
            name="revoked_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="issuedcertificate",
            name="revoked_reason",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AlterUniqueTogether(
            name="issuedcertificate",
            unique_together=set(),
        ),
        migrations.AddConstraint(
            model_name="issuedcertificate",
            constraint=models.UniqueConstraint(
                condition=models.Q(("revoked_at__isnull", True)),
                fields=("user", "course"),
                name="uniq_active_cert_per_user_course",
            ),
        ),
        migrations.AddIndex(
            model_name="issuedcertificate",
            index=models.Index(fields=["verification_hash"], name="cert_verif_hash_idx"),
        ),
        migrations.AddIndex(
            model_name="issuedcertificate",
            index=models.Index(fields=["issued_at"], name="cert_issued_at_idx"),
        ),
    ]
