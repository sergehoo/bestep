"""notifications/models.py — Modèle Notification transverse (V_FIN.B).

CORRECTIF audit CAT-11 : le modèle ``Notification`` était logé dans ``catalog/``
ce qui est un mauvais découpage. On l'externalise dans une app dédiée
``notifications`` (label ``notifications_app`` pour éviter la collision
avec ``django-notifications-hq`` déjà présent).

Cette app remplace progressivement les notifications existantes ; pour la
transition, l'ancien modèle catalog.Notification peut continuer à vivre
en lecture seule.

Modèle minimaliste mais extensible :
- ``kind`` : ``enrollment_assigned`` / ``certificate_issued`` /
  ``invitation_received`` / ``course_published`` / ``payment_succeeded``...
- ``payload`` : JSON libre pour le contexte (course_id, certificate_id…).
- ``url`` : lien profond (peut être généré à partir de payload côté template).
- ``read_at`` : null = non-lu.
"""
from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils import timezone


class Notification(models.Model):
    class Kind(models.TextChoices):
        ENROLLMENT_ASSIGNED = "enrollment_assigned", "Cours assigné"
        CERTIFICATE_ISSUED = "certificate_issued", "Certificat émis"
        INVITATION_RECEIVED = "invitation_received", "Invitation reçue"
        COURSE_PUBLISHED = "course_published", "Cours publié"
        PAYMENT_SUCCEEDED = "payment_succeeded", "Paiement réussi"
        REVIEW_RECEIVED = "review_received", "Avis reçu"
        SYSTEM = "system", "Système"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="app_notifications",
    )
    kind = models.CharField(max_length=40, choices=Kind.choices)
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True)
    url = models.CharField(max_length=500, blank=True)
    payload = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "read_at"]),
            models.Index(fields=["kind"]),
        ]

    @property
    def is_read(self) -> bool:
        return self.read_at is not None

    def mark_read(self):
        if not self.read_at:
            self.read_at = timezone.now()
            self.save(update_fields=["read_at"])

    def __str__(self):
        return f"{self.kind} — {self.user_id} : {self.title}"
