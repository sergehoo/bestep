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
