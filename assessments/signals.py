"""Signaux de l'app assessments."""

from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Attempt


@receiver(post_save, sender=Attempt)
def invalidate_onboarding_cache(sender, instance: Attempt, **kwargs):
    """
    Lorsqu'une tentative de quiz d'onboarding est soumise, on invalide le
    flag posé dans la session par ``OnboardingRequiredMiddleware`` pour forcer
    son recalcul à la prochaine requête.

    NOTE: on ne peut pas accéder à la session de l'utilisateur depuis un
    signal (pas de request), donc on s'appuie sur le fait que le middleware
    recalcule automatiquement si le flag est absent. Ici on ne fait rien
    côté session ; on se contente de garantir que l'attribut ``is_onboarding``
    est bien propagé sur la Quiz associée. Le middleware relira la session
    dès la requête suivante et constatera l'état de la base si le flag a
    expiré.
    """

    # Placeholder : ce hook permet de brancher un cache global (Redis) par
    # user si nécessaire, sans impacter le comportement par défaut.
    if instance.submitted_at and getattr(instance.quiz, "is_onboarding", False):
        # Ex : cache.delete(f"onboarding_completed:{instance.user_id}")
        pass
