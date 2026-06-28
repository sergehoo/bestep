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
    name = models.CharField(max_length=160, unique=True)
    background = models.ImageField(upload_to="certificates/templates/", null=True, blank=True)
    signature_name = models.CharField(max_length=160, blank=True)
    signature_title = models.CharField(max_length=160, blank=True)


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
