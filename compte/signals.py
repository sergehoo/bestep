"""
compte/signals.py — Signaux post-save (P3.1).

Crée automatiquement un ``UserPreferences`` à l'inscription d'un nouvel
utilisateur. Utilisé en complément de ``UserPreferences.get_or_create_for``
qui sert de fallback pour les comptes existants (créés avant cette
migration).

Le signal est connecté dans ``compte/apps.py:ready()``.
"""
from __future__ import annotations

import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from compte.models import User, UserPreferences

logger = logging.getLogger(__name__)


@receiver(post_save, sender=User, dispatch_uid="compte.user.ensure_preferences")
def ensure_user_preferences(sender, instance, created, **kwargs):
    """Crée les préférences par défaut à la création d'un User."""
    if not created:
        return
    try:
        UserPreferences.objects.get_or_create(user=instance)
    except Exception:
        # Ne JAMAIS bloquer l'inscription si la création de Preferences échoue
        # (raison : tests qui mockent la DB, environnement transitoire post-migration).
        # On log et on continue — get_or_create_for() rattrape au premier accès.
        logger.warning(
            "ensure_user_preferences: échec création UserPreferences user=%s",
            instance.pk,
        )


# ─────────────────────────────────────────────────────────────
# SECURITE-05 — Sync allauth EmailAddress → User.is_email_verified
# ─────────────────────────────────────────────────────────────
try:
    from allauth.account.models import EmailAddress
    from django.utils import timezone

    @receiver(
        post_save,
        sender=EmailAddress,
        dispatch_uid="compte.user.sync_allauth_verified",
    )
    def sync_allauth_email_verified(sender, instance, **kwargs):
        """Quand allauth marque un e-mail comme vérifié, propage sur User.

        Deux flows peuvent vérifier un e-mail dans le système :
          1. Notre endpoint ``POST /api/auth/verify-email/`` (SECURITE-05)
             qui met à jour ``User.is_email_verified`` directement.
          2. Le flow allauth (registration + email confirmation via ses
             templates ou son SocialAccount adapter) qui coche
             ``EmailAddress.verified``.

        Sans ce signal, un user validé via allauth verrait toujours son
        ``User.is_email_verified`` à ``False``, avec les mêmes symptômes
        que si la vérif n'avait pas eu lieu (blocage sur /verify-email).
        """
        if not instance.verified:
            return
        user = instance.user
        # Idempotent : ne touche pas si déjà True.
        if getattr(user, "is_email_verified", False):
            return
        try:
            user.is_email_verified = True
            user.email_verified_at = user.email_verified_at or timezone.now()
            user.save(update_fields=["is_email_verified", "email_verified_at"])
        except Exception:
            logger.warning(
                "sync_allauth_email_verified: échec propagation user=%s",
                user.pk,
            )
except ImportError:
    # allauth non installé (tests unitaires isolés) — pas de signal
    pass
