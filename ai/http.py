"""ai.http — helpers HTTP partagés par les vues Best-AI.

Centralise la fabrication des réponses 403 pour que le frontend reçoive
toujours un ``code`` stable (voir compte/drf_exception_handler.py pour
la logique équivalente sur les exceptions).
"""
from __future__ import annotations

from rest_framework import status
from rest_framework.response import Response


def forbidden_for(user) -> Response:
    """Renvoie un 403 avec le ``code`` stable adapté à l'état du user.

    Ordre d'inspection :
        - non authentifié           → NOT_AUTHENTICATED (401 techniquement,
          mais si la vue est arrivée jusqu'ici c'est qu'IsAuthenticated a
          passé — on répond 403 explicite pour cohérence)
        - inactif                   → ACCOUNT_SUSPENDED
        - email non vérifié          → EMAIL_NOT_VERIFIED
        - défaut                    → BEST_AI_UNAVAILABLE
    """
    code = "BEST_AI_UNAVAILABLE"
    detail = "Best-AI indisponible pour ce compte."

    if user is None or not getattr(user, "is_authenticated", False):
        code = "NOT_AUTHENTICATED"
        detail = "Authentification requise."
    elif getattr(user, "is_active", True) is False:
        code = "ACCOUNT_SUSPENDED"
        detail = "Compte suspendu par l'administration."
    elif getattr(user, "is_email_verified", True) is False:
        code = "EMAIL_NOT_VERIFIED"
        detail = "Adresse e-mail non vérifiée."

    return Response(
        {"detail": detail, "code": code},
        status=status.HTTP_403_FORBIDDEN,
    )
