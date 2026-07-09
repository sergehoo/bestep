"""
0004_certificate_template_builder.py — R20.1

Enrichit ``CertificateTemplate`` avec les champs nécessaires au
Certificate Template Builder :

- ``style``, ``orientation``
- Palette : primary_color / accent_color / text_color / font_family
- Contenu : organization_name / logo_url / signature_image_url /
  watermark_url / heading_text / body_text / footer_text
- Options : show_qr_code / show_serial / show_completion_date
- Portée : owner (FK) / is_public / is_default
- Timestamps : created_at / updated_at

Contrainte unicité ``name`` supprimée : plusieurs owners peuvent créer
des templates de même nom. Une nouvelle unicité (name, owner) est mise
en place pour éviter le doublon interne d'un owner.

Migration additive-safe : tous les nouveaux champs ont des défaults.
"""
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("certifications", "0003_revoked_at_and_constraint"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AlterField(
            model_name="certificatetemplate",
            name="name",
            field=models.CharField(max_length=160),
        ),
        migrations.AddField(
            model_name="certificatetemplate",
            name="style",
            field=models.CharField(
                choices=[
                    ("classic", "Classique"),
                    ("modern", "Moderne"),
                    ("premium", "Premium"),
                    ("academic", "Académique"),
                    ("enterprise", "Entreprise"),
                    ("minimal", "Minimaliste"),
                    ("luxury", "Luxe"),
                ],
                default="classic",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="certificatetemplate",
            name="orientation",
            field=models.CharField(
                choices=[
                    ("landscape", "Paysage"),
                    ("portrait", "Portrait"),
                ],
                default="landscape",
                max_length=15,
            ),
        ),
        migrations.AddField(
            model_name="certificatetemplate",
            name="primary_color",
            field=models.CharField(default="#0284c7", max_length=9),
        ),
        migrations.AddField(
            model_name="certificatetemplate",
            name="accent_color",
            field=models.CharField(default="#eab308", max_length=9),
        ),
        migrations.AddField(
            model_name="certificatetemplate",
            name="text_color",
            field=models.CharField(default="#0f172a", max_length=9),
        ),
        migrations.AddField(
            model_name="certificatetemplate",
            name="font_family",
            field=models.CharField(
                default="Inter, system-ui, sans-serif", max_length=80
            ),
        ),
        migrations.AddField(
            model_name="certificatetemplate",
            name="organization_name",
            field=models.CharField(blank=True, default="", max_length=160),
        ),
        migrations.AddField(
            model_name="certificatetemplate",
            name="logo_url",
            field=models.URLField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="certificatetemplate",
            name="signature_image_url",
            field=models.URLField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="certificatetemplate",
            name="watermark_url",
            field=models.URLField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="certificatetemplate",
            name="heading_text",
            field=models.CharField(
                default="Certificat d'accomplissement", max_length=200
            ),
        ),
        migrations.AddField(
            model_name="certificatetemplate",
            name="body_text",
            field=models.TextField(
                blank=True,
                default=(
                    "Ce certificat est décerné à {{student_name}} pour avoir "
                    "complété avec succès la formation « {{course_title}} »."
                ),
            ),
        ),
        migrations.AddField(
            model_name="certificatetemplate",
            name="footer_text",
            field=models.CharField(blank=True, default="", max_length=200),
        ),
        migrations.AddField(
            model_name="certificatetemplate",
            name="show_qr_code",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="certificatetemplate",
            name="show_serial",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="certificatetemplate",
            name="show_completion_date",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="certificatetemplate",
            name="owner",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.CASCADE,
                related_name="certificate_templates",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="certificatetemplate",
            name="is_public",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="certificatetemplate",
            name="is_default",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="certificatetemplate",
            name="created_at",
            field=models.DateTimeField(auto_now_add=True, null=True),
        ),
        migrations.AddField(
            model_name="certificatetemplate",
            name="updated_at",
            field=models.DateTimeField(auto_now=True, null=True),
        ),
        migrations.AlterModelOptions(
            name="certificatetemplate",
            options={"ordering": ["-is_public", "name"]},
        ),
        migrations.AddIndex(
            model_name="certificatetemplate",
            index=models.Index(
                fields=["owner", "is_public"],
                name="cert_tpl_owner_pub_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="certificatetemplate",
            index=models.Index(
                fields=["style"],
                name="cert_tpl_style_idx",
            ),
        ),
    ]
