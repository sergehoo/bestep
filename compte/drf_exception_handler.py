"""compte/drf_exception_handler.py — Enrichit les réponses d'erreur DRF.

Objectif : quand une permission DRF est refusée (403) ou l'auth manquante
(401), on injecte un champ ``code`` stable dans le payload pour piloter
la redirection côté frontend.

Détection :
    - ``request.user`` non authentifié            → ``NOT_AUTHENTICATED``
    - ``request.user.is_active == False``          → ``ACCOUNT_SUSPENDED``
    - ``request.user.is_email_verified == False``  → ``EMAIL_NOT_VERIFIED``
    - défaut                                       → ``PERMISSION_DENIED``

L'exception handler doit être branché dans ``settings.REST_FRAMEWORK`` :

    "EXCEPTION_HANDLER": "compte.drf_exception_handler.enriched_exception_handler",
"""
from __future__ import annotations

from rest_framework.views import exception_handler as drf_exception_handler


def enriched_exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is None:
        return response

    # Ne jamais écraser un code déjà mis explicitement par la view.
    data = response.data if isinstance(response.data, dict) else None
    if data is None or "code" in data:
        return response

    request = context.get("request")
    user = getattr(request, "user", None) if request is not None else None

    code = None
    if response.status_code == 401:
        code = "NOT_AUTHENTICATED"
    elif response.status_code == 403 and user is not None and user.is_authenticated:
        if getattr(user, "is_active", True) is False:
            code = "ACCOUNT_SUSPENDED"
        elif getattr(user, "is_email_verified", True) is False:
            code = "EMAIL_NOT_VERIFIED"
        else:
            code = "PERMISSION_DENIED"
    elif response.status_code == 403:
        code = "PERMISSION_DENIED"

    if code is not None:
        data["code"] = code
        response.data = data
    return response
