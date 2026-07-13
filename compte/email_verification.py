"""compte/email_verification.py — Génération + envoi + validation du token
d'e-mail.

Politique de sécurité :
    - Token opaque (secrets.token_urlsafe 32 → 43 chars, stocké en clair
      dans ``User.email_verification_token`` car son secret ne concerne
      que l'invalidation, jamais un accès permanent).
    - Durée de vie 48h (configurable via ``EMAIL_VERIFICATION_TTL_HOURS``).
    - Un compte non vérifié est bloqué au niveau des permissions DRF
      (voir ``compte/permissions.py::IsEmailVerified``).
    - L'envoi effectif du mail passe par Django ``send_mail``. En dev
      c'est le backend console. En prod, SMTP/SES doit être configuré.
    - Anti-spam : ``resend`` refuse si un envoi date de < 60s
      (``EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS``).

Fonctions publiques :
    - ``issue_token(user)`` → réinitialise + envoie le mail
    - ``verify_token(user, token)`` → valide, marque, retourne bool
    - ``can_resend(user)`` → True/False + timedelta restante
"""
from __future__ import annotations

import secrets
from datetime import timedelta
from typing import Tuple

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils import timezone


TTL_HOURS = getattr(settings, "EMAIL_VERIFICATION_TTL_HOURS", 48)
RESEND_COOLDOWN_SECONDS = getattr(
    settings, "EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS", 60
)


def _build_verification_link(user, token: str) -> str:
    base = getattr(settings, "FRONTEND_BASE_URL", "") or ""
    base = base.rstrip("/")
    return f"{base}/verify-email?uid={user.pk}&token={token}"


def issue_token(user) -> str:
    """Génère un token, le stocke sur le user, envoie l'e-mail.

    Retourne le token en clair (utile pour tests / debug). En prod ne
    JAMAIS logger cette valeur.
    """
    token = secrets.token_urlsafe(32)
    user.email_verification_token = token
    user.email_verification_sent_at = timezone.now()
    # Ne pas toucher à is_email_verified ici — le renvoi doit être
    # possible même après une première vérification tentée.
    user.save(
        update_fields=[
            "email_verification_token",
            "email_verification_sent_at",
        ]
    )
    _send_email(user, token)
    return token


def _send_email(user, token: str) -> None:
    link = _build_verification_link(user, token)
    subject = "Vérifiez votre adresse e-mail — Best-Épargne"
    ctx = {
        "user": user,
        "user_name": user.full_name,
        "link": link,
        "ttl_hours": TTL_HOURS,
    }
    text_body = render_to_string("emails/security/verify_email.txt", ctx)
    html_body = render_to_string("emails/security/verify_email.html", ctx)
    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "no-reply@best-epargne.local")
    try:
        msg = EmailMultiAlternatives(subject, text_body, from_email, [user.email])
        msg.attach_alternative(html_body, "text/html")
        msg.send(fail_silently=False)
    except Exception:
        # En dev/CI l'envoi peut échouer ; l'audit reste utile mais on ne
        # bloque pas l'inscription.
        pass


def verify_token(user, token: str) -> bool:
    """Vérifie un token pour ``user``. Effet de bord si succès.

    Règles :
        - token vide → False
        - token != stocké → False
        - âge > TTL → False (mais on autorise le renvoi côté endpoint)
        - succès → set is_email_verified=True, clear token
    """
    if not token or not user.email_verification_token:
        return False
    if not secrets.compare_digest(token, user.email_verification_token):
        return False
    sent = user.email_verification_sent_at
    if sent is None:
        return False
    if timezone.now() - sent > timedelta(hours=TTL_HOURS):
        return False
    user.is_email_verified = True
    user.email_verified_at = timezone.now()
    user.email_verification_token = ""
    user.save(
        update_fields=[
            "is_email_verified",
            "email_verified_at",
            "email_verification_token",
        ]
    )
    return True


def can_resend(user) -> Tuple[bool, int]:
    """Retourne (allowed, retry_after_seconds)."""
    sent = user.email_verification_sent_at
    if sent is None:
        return True, 0
    delta = (timezone.now() - sent).total_seconds()
    if delta >= RESEND_COOLDOWN_SECONDS:
        return True, 0
    return False, int(RESEND_COOLDOWN_SECONDS - delta)
