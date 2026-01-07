from __future__ import annotations

from django.db import models

# Create your models here.
from django.db import models
from django.utils import timezone
from django.conf import settings
import uuid


class CertificateTemplate(models.Model):
    name = models.CharField(max_length=160, unique=True)
    background = models.ImageField(upload_to="certificates/templates/", null=True, blank=True)
    signature_name = models.CharField(max_length=160, blank=True)
    signature_title = models.CharField(max_length=160, blank=True)


class IssuedCertificate(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="certificates")
    course = models.ForeignKey("catalog.Course", on_delete=models.CASCADE, related_name="issued_certificates")

    template = models.ForeignKey("certifications.CertificateTemplate", on_delete=models.SET_NULL, null=True, blank=True)

    issued_at = models.DateTimeField(default=timezone.now)
    score_percent = models.PositiveIntegerField(default=0)

    serial = models.CharField(max_length=32, unique=True, editable=False)
    verification_hash = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)

    pdf_file = models.FileField(upload_to="certificates/pdfs/", null=True, blank=True)

    class Meta:
        unique_together = ("user", "course")

    def save(self, *args, **kwargs):
        if not self.serial:
            self.serial = uuid.uuid4().hex[:16].upper()
        super().save(*args, **kwargs)
