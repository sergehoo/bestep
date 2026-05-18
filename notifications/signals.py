"""notifications/signals.py — Auto-notifications V_FIN.B.

Connecte les events métier critiques pour notifier automatiquement les
utilisateurs concernés. Couvert ici :

- Enrollment B2B créé via CompanyAssignmentTarget → notification apprenant.
- IssuedCertificate créé → notification apprenant.

Les autres notifications (review reçue, paiement réussi, course publié)
peuvent être branchées de la même façon.
"""
from __future__ import annotations

import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)


@receiver(post_save, sender="enrollments.Enrollment")
def _notify_on_b2b_enrollment(sender, instance, created, **kwargs):
    """Quand un Enrollment B2B est créé (source=COMPANY), notifie l'apprenant."""
    if not created:
        return
    try:
        if str(instance.source).upper() != "COMPANY":
            return
        from .services import notify_enrollment_assigned
        notify_enrollment_assigned(instance.user, instance.course)
    except Exception as exc:  # noqa: BLE001
        logger.warning("notif.b2b_enrollment.failed", extra={"exc": str(exc)})


@receiver(post_save, sender="certifications.IssuedCertificate")
def _notify_on_certificate(sender, instance, created, **kwargs):
    """Quand un certificat est émis (ou ré-émis), notifie l'apprenant."""
    if not created:
        return
    if getattr(instance, "revoked_at", None):
        return
    try:
        from .services import notify_certificate_issued
        notify_certificate_issued(instance.user, instance)
    except Exception as exc:  # noqa: BLE001
        logger.warning("notif.certificate.failed", extra={"exc": str(exc)})
