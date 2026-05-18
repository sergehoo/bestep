"""commerce/signals.py — CORRECTIFS V2.D (COM-09, COM-10).

- COM-09 : ``CompanyLicense.seats_used`` recalculé automatiquement à chaque
  changement de ``CompanyAssignmentTarget``.
- COM-10 : lors de la création d'un ``CompanyAssignmentTarget``, on crée
  automatiquement l'``Enrollment`` correspondant avec ``source=COMPANY``
  et ``company=assignment.company``. L'apprenant voit donc immédiatement
  le cours dans son dashboard.
"""
from __future__ import annotations

import logging

from django.db import transaction
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .models import CompanyAssignmentTarget, CompanyLicense

logger = logging.getLogger(__name__)


def _sync_license_usage(org_id: int) -> None:
    """Recompute seats_used pour TOUTES les licenses actives d'une org."""
    used = (
        CompanyAssignmentTarget.objects.filter(assignment__company_id=org_id)
        .values("user_id")
        .distinct()
        .count()
    )
    CompanyLicense.objects.filter(company_id=org_id).update(seats_used=used)


@receiver(post_save, sender=CompanyAssignmentTarget)
def _on_target_created(sender, instance: CompanyAssignmentTarget, created: bool, **kwargs):
    """Création/MAJ d'une cible d'assignation :

    1. (COM-10) Crée l'Enrollment correspondant si pas encore présent.
    2. (COM-09) Sync seats_used.
    """
    if created:
        try:
            with transaction.atomic():
                from enrollments.models import Enrollment

                assignment = instance.assignment
                Enrollment.objects.get_or_create(
                    user=instance.user,
                    course=assignment.course,
                    defaults={
                        "source": Enrollment.Source.COMPANY,
                        "company": assignment.company,
                    },
                )
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "commerce.assignment.enrollment.create_failed",
                extra={"target_id": instance.id, "exc": str(exc)},
            )

    try:
        _sync_license_usage(instance.assignment.company_id)
    except Exception as exc:  # noqa: BLE001
        logger.warning("commerce.license.sync_failed", extra={"exc": str(exc)})


@receiver(post_delete, sender=CompanyAssignmentTarget)
def _on_target_deleted(sender, instance: CompanyAssignmentTarget, **kwargs):
    """Suppression d'une cible : juste recompute seats_used.

    On ne supprime PAS automatiquement l'Enrollment associé (l'apprenant
    peut avoir déjà commencé le cours et garder le droit de le terminer).
    Politique de hard-cancel à brancher dans un service refund/admin si besoin.
    """
    try:
        _sync_license_usage(instance.assignment.company_id)
    except Exception as exc:  # noqa: BLE001
        logger.warning("commerce.license.sync_failed", extra={"exc": str(exc)})
