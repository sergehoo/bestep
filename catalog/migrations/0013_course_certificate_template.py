"""
0013_course_certificate_template.py — R20.1

Ajoute un FK optionnel ``Course.certificate_template`` vers
``certifications.CertificateTemplate``. NULL par défaut → le certificat
utilise le template par défaut de la plateforme.

Migration additive-safe.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0012_course_r10_enrichment"),
        ("certifications", "0004_certificate_template_builder"),
    ]

    operations = [
        migrations.AddField(
            model_name="course",
            name="certificate_template",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.SET_NULL,
                related_name="courses",
                to="certifications.certificatetemplate",
            ),
        ),
    ]
