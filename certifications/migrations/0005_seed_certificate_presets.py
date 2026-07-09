"""
0005_seed_certificate_presets.py — R20.1

Insère 7 presets globaux de templates de certificat, disponibles pour
tous les instructeurs (owner=NULL, is_public=True).

Idempotent : chaque preset est skippé s'il existe déjà (par name +
owner NULL).
"""
from django.db import migrations

PRESETS = [
    {
        "name": "Classique bleu & or",
        "style": "classic",
        "orientation": "landscape",
        "primary_color": "#0284c7",
        "accent_color": "#eab308",
        "text_color": "#0f172a",
        "heading_text": "Certificat d'accomplissement",
        "body_text": (
            "Ce certificat est décerné à {{student_name}} pour avoir "
            "complété avec succès la formation « {{course_title}} »."
        ),
        "footer_text": "BestÉpargne Academy — Excellence pédagogique",
    },
    {
        "name": "Moderne dégradé",
        "style": "modern",
        "orientation": "landscape",
        "primary_color": "#7c3aed",
        "accent_color": "#f472b6",
        "text_color": "#0f172a",
        "heading_text": "Certification professionnelle",
        "body_text": (
            "{{student_name}} a suivi et complété avec succès la "
            "formation « {{course_title}} » le {{completion_date}}."
        ),
    },
    {
        "name": "Premium noir & or",
        "style": "premium",
        "orientation": "landscape",
        "primary_color": "#111827",
        "accent_color": "#d4af37",
        "text_color": "#1f2937",
        "heading_text": "Certificat d'excellence",
        "body_text": (
            "Nous certifions que {{student_name}} a satisfait à l'ensemble "
            "des critères d'évaluation de « {{course_title}} »."
        ),
    },
    {
        "name": "Académique bordeaux",
        "style": "academic",
        "orientation": "landscape",
        "primary_color": "#7f1d1d",
        "accent_color": "#f59e0b",
        "text_color": "#1c1917",
        "heading_text": "Diplôme de fin de formation",
        "body_text": (
            "L'institut atteste que {{student_name}} a accompli "
            "l'intégralité du programme « {{course_title}} » avec un "
            "score de {{score}}%."
        ),
        "footer_text": "Délivré au titre de la formation professionnelle continue",
    },
    {
        "name": "Entreprise vert corporate",
        "style": "enterprise",
        "orientation": "landscape",
        "primary_color": "#065f46",
        "accent_color": "#10b981",
        "text_color": "#0f172a",
        "heading_text": "Attestation de formation",
        "body_text": (
            "{{organization_name}} atteste que {{student_name}} a suivi "
            "la formation interne « {{course_title}} »."
        ),
    },
    {
        "name": "Minimaliste blanc",
        "style": "minimal",
        "orientation": "landscape",
        "primary_color": "#111827",
        "accent_color": "#6b7280",
        "text_color": "#111827",
        "heading_text": "Certificat",
        "body_text": (
            "{{student_name}} — {{course_title}} — {{completion_date}}"
        ),
        "footer_text": "",
    },
    {
        "name": "Luxe doré",
        "style": "luxury",
        "orientation": "landscape",
        "primary_color": "#1a1a1a",
        "accent_color": "#c9a227",
        "text_color": "#1a1a1a",
        "heading_text": "Certificat d'honneur",
        "body_text": (
            "Le présent certificat est délivré à {{student_name}} en "
            "reconnaissance de sa réussite à la formation "
            "« {{course_title}} »."
        ),
        "footer_text": "Excellence · Rigueur · Distinction",
    },
]


def seed(apps, schema_editor):
    CertificateTemplate = apps.get_model("certifications", "CertificateTemplate")
    for p in PRESETS:
        CertificateTemplate.objects.get_or_create(
            name=p["name"],
            owner=None,
            defaults={
                **p,
                "font_family": "Inter, system-ui, sans-serif",
                "is_public": True,
                "is_default": p["style"] == "classic",  # 1er preset = défaut
                "show_qr_code": True,
                "show_serial": True,
                "show_completion_date": True,
            },
        )


def unseed(apps, schema_editor):
    CertificateTemplate = apps.get_model("certifications", "CertificateTemplate")
    CertificateTemplate.objects.filter(
        owner__isnull=True,
        name__in=[p["name"] for p in PRESETS],
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("certifications", "0004_certificate_template_builder"),
    ]

    operations = [migrations.RunPython(seed, unseed)]
