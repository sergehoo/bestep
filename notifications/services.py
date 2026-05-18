"""notifications/services.py — Service d'envoi unifié (V_FIN.B).

CORRECTIFS audit ORG-17 (assignment cours sans notif), CAT-11 (mauvais
emplacement du modèle), COM-10 partiel (B2B assignment → notif).

API publique :

    from notifications.services import notify

    notify(user, kind, title, body="", url="", payload=None, *, send_email=False)

- Crée une ``Notification`` in-app.
- Si ``send_email=True`` ET l'user a un email + ``DEFAULT_FROM_EMAIL`` configuré,
  envoie également un email simple (texte). Idéalement async via Celery.
- Tolère les exceptions de transport email (loggue WARNING, ne propage pas).
"""
from __future__ import annotations

import logging

from django.conf import settings
from django.core.mail import send_mail

from .models import Notification

logger = logging.getLogger(__name__)


def notify(
    user,
    kind: str,
    title: str,
    *,
    body: str = "",
    url: str = "",
    payload: dict | None = None,
    send_email: bool = False,
) -> Notification | None:
    """Crée une Notification + envoi email optionnel.

    Retourne la Notification créée, ou None si user invalide.
    """
    if not user or not getattr(user, "id", None):
        return None
    if not getattr(user, "is_active", True):
        return None

    notif = Notification.objects.create(
        user=user,
        kind=kind,
        title=title[:200],
        body=(body or "")[:5000],
        url=(url or "")[:500],
        payload=payload or {},
    )

    if send_email and getattr(user, "email", ""):
        from_email = getattr(settings, "DEFAULT_FROM_EMAIL", None)
        try:
            send_mail(
                subject=title[:200],
                message=(body or title)[:5000],
                from_email=from_email,
                recipient_list=[user.email],
                fail_silently=True,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "notification.email.failed",
                extra={"kind": kind, "user_id": user.id, "exc": str(exc)},
            )
    return notif


def notify_enrollment_assigned(user, course, *, assigned_by=None) -> Notification | None:
    """Helper : notification d'assignment B2B (COM-10 partiel + ORG-17)."""
    title = f"Nouveau cours assigné : {course.title}"
    body = (
        f"Vous avez été inscrit au cours « {course.title} »"
        + (f" par {assigned_by.email}" if assigned_by else "")
        + "."
    )
    return notify(
        user,
        Notification.Kind.ENROLLMENT_ASSIGNED,
        title,
        body=body,
        url=f"/catalog/courses/{course.slug}/" if getattr(course, "slug", None) else "",
        payload={"course_id": course.id, "course_slug": course.slug},
        send_email=True,
    )


def notify_certificate_issued(user, certificate) -> Notification | None:
    """Helper : notification d'émission de certificat (V2.A)."""
    title = "Félicitations, votre certificat est disponible !"
    body = f"Votre certificat pour le cours « {certificate.course.title} » a été émis."
    return notify(
        user,
        Notification.Kind.CERTIFICATE_ISSUED,
        title,
        body=body,
        url=f"/certifications/verify/{certificate.verification_hash}/",
        payload={
            "certificate_id": certificate.id,
            "verification_hash": str(certificate.verification_hash),
            "course_id": certificate.course_id,
        },
        send_email=True,
    )


def notify_invitation_received(user_or_email, organization, *, accept_url: str = "") -> Notification | None:
    """Helper : notification d'invitation org (V2.B). Si user_or_email est
    une string (user pas encore créé), on n'in-app-notify pas — l'email
    suffit."""
    if isinstance(user_or_email, str):
        return None
    title = f"Invitation à rejoindre {organization.name}"
    body = f"Vous avez été invité à rejoindre l'organisation {organization.name}."
    return notify(
        user_or_email,
        Notification.Kind.INVITATION_RECEIVED,
        title,
        body=body,
        url=accept_url,
        payload={"organization_id": organization.id},
        send_email=True,
    )
