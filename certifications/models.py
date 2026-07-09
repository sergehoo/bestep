"""certifications/models.py — CORRECTIFS V2.A (audit CERT-03, CERT-05, CERT-08).

- CERT-03 : ajout de ``revoked_at`` + ``revoked_reason`` ; remplacement de
  ``unique_together(user, course)`` par une ``UniqueConstraint`` partielle
  conditionnée à ``revoked_at IS NULL``. On peut désormais REVOKER puis
  REEMETTRE un certificat sans violer la contrainte d'unicité.
- CERT-05 : ajout du champ ``is_final`` sur ``Quiz`` n'est PAS dans cet
  audit (côté assessments). On laisse cette refonte à V3.
"""

from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class CertificateTemplate(models.Model):
    """
    Template de certificat R20 — bibliothèque de modèles personnalisables.

    Un template peut être :
    - Global (owner=NULL, is_public=True) — presets fournis par la plateforme
    - Personnel (owner=<user>) — créé par un instructeur pour ses cours
    - Organisationnel (organization=<org>) — partagé entre membres d'une org

    L'éditeur DnD complet (Canva-like) est prévu R21. Pour l'instant, la
    personnalisation se fait via des champs typés (couleurs, polices,
    orientation, textes avec variables).
    """

    class Style(models.TextChoices):
        CLASSIC = "classic", "Classique"
        MODERN = "modern", "Moderne"
        PREMIUM = "premium", "Premium"
        ACADEMIC = "academic", "Académique"
        ENTERPRISE = "enterprise", "Entreprise"
        MINIMAL = "minimal", "Minimaliste"
        LUXURY = "luxury", "Luxe"

    class Orientation(models.TextChoices):
        LANDSCAPE = "landscape", "Paysage"
        PORTRAIT = "portrait", "Portrait"

    name = models.CharField(max_length=160)
    style = models.CharField(max_length=20, choices=Style.choices, default=Style.CLASSIC)
    orientation = models.CharField(
        max_length=15, choices=Orientation.choices, default=Orientation.LANDSCAPE
    )

    # Legacy R2.A — conservé pour compat
    background = models.ImageField(
        upload_to="certificates/templates/", null=True, blank=True
    )
    signature_name = models.CharField(max_length=160, blank=True)
    signature_title = models.CharField(max_length=160, blank=True)

    # R20 — Personnalisation visuelle
    primary_color = models.CharField(
        max_length=9,
        default="#0284c7",
        help_text="Couleur principale (hex #rrggbb).",
    )
    accent_color = models.CharField(
        max_length=9,
        default="#eab308",
        help_text="Couleur d'accent / dorée.",
    )
    text_color = models.CharField(
        max_length=9,
        default="#0f172a",
        help_text="Couleur du texte principal.",
    )
    font_family = models.CharField(
        max_length=80,
        default="Inter, system-ui, sans-serif",
        help_text="CSS font-family.",
    )

    # R20 — Contenu / identité
    organization_name = models.CharField(max_length=160, blank=True, default="")
    logo_url = models.URLField(blank=True, default="")
    signature_image_url = models.URLField(blank=True, default="")
    watermark_url = models.URLField(blank=True, default="")

    # R20 — Texte principal, supporte les variables {{student_name}} etc.
    heading_text = models.CharField(
        max_length=200,
        default="Certificat d'accomplissement",
    )
    body_text = models.TextField(
        blank=True,
        default=(
            "Ce certificat est décerné à {{student_name}} pour avoir "
            "complété avec succès la formation « {{course_title}} »."
        ),
        help_text=(
            "Variables supportées : {{student_name}}, {{course_title}}, "
            "{{instructor_name}}, {{organization_name}}, {{completion_date}}, "
            "{{certificate_number}}, {{hours}}, {{score}}, {{verification_url}}"
        ),
    )
    footer_text = models.CharField(
        max_length=200, blank=True, default="", help_text="Ex : mention légale, devise."
    )

    # R20 — Options de sécurité / affichage
    show_qr_code = models.BooleanField(default=True)
    show_serial = models.BooleanField(default=True)
    show_completion_date = models.BooleanField(default=True)

    # R20 — Portée / permissions
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="certificate_templates",
        null=True,
        blank=True,
        help_text="Propriétaire (NULL = preset global de la plateforme).",
    )
    is_public = models.BooleanField(
        default=False,
        help_text="Visible et utilisable par tous les instructeurs.",
    )
    is_default = models.BooleanField(
        default=False,
        help_text="Preset appliqué par défaut aux nouveaux cours certifiants.",
    )

    created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True, null=True, blank=True)

    class Meta:
        ordering = ["-is_public", "name"]
        indexes = [
            models.Index(fields=["owner", "is_public"]),
            models.Index(fields=["style"]),
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.style})"


class IssuedCertificate(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="certificates",
    )
    course = models.ForeignKey(
        "catalog.Course",
        on_delete=models.CASCADE,
        related_name="issued_certificates",
    )

    template = models.ForeignKey(
        "certifications.CertificateTemplate",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )

    issued_at = models.DateTimeField(default=timezone.now)
    score_percent = models.PositiveIntegerField(default=0)

    serial = models.CharField(max_length=32, unique=True, editable=False)
    verification_hash = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)

    pdf_file = models.FileField(upload_to="certificates/pdfs/", null=True, blank=True)

    # CORRECTIF CERT-03 : révocation explicite + ré-émission possible.
    revoked_at = models.DateTimeField(null=True, blank=True)
    revoked_reason = models.CharField(max_length=255, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "course"],
                condition=models.Q(revoked_at__isnull=True),
                name="uniq_active_cert_per_user_course",
            ),
        ]
        indexes = [
            models.Index(fields=["verification_hash"], name="cert_verif_hash_idx"),
            models.Index(fields=["issued_at"], name="cert_issued_at_idx"),
        ]

    @property
    def is_revoked(self) -> bool:
        return self.revoked_at is not None

    def save(self, *args, **kwargs):
        if not self.serial:
            self.serial = uuid.uuid4().hex[:16].upper()
        super().save(*args, **kwargs)

    def __str__(self):  # pragma: no cover
        suffix = " (révoqué)" if self.is_revoked else ""
        return f"{self.serial} — {self.user_id} / {self.course_id}{suffix}"
