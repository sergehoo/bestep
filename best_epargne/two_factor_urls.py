"""best_epargne/two_factor_urls.py — Branchement two_factor + admin protégé.

CORRECTIF V6.D (audit SEC-06) : django-otp + django-two-factor-auth sont
installés (V1) mais leurs URLs n'étaient pas branchées. Ce module les
expose et patche l'admin Django pour forcer 2FA.

À inclure depuis ``best_epargne/urls.py`` :

    from best_epargne.two_factor_urls import build_two_factor_patterns
    urlpatterns = [
        # ... routes existantes ...
    ] + build_two_factor_patterns()

Routes exposées (sous ``/account/two-factor/``) :
- /account/two-factor/login/   (alternative au login allauth pour les
                                comptes qui ont activé 2FA)
- /account/two-factor/setup/   (configuration TOTP)
- /account/two-factor/backup/  (tokens de secours)
- /account/two-factor/disable/

L'admin Django (``/admin/``) reste sur sa propre route — mais on **patche
AdminSite** pour exiger un device OTP vérifié. Avec
``TWO_FACTOR_PATCH_ADMIN = True`` dans settings, c'est automatique côté
two_factor.

Recommandation : exiger 2FA pour tous les ``is_staff`` ou
``platform_role == PLATFORM_ADMIN`` via middleware. À brancher V7.
"""
from __future__ import annotations

from django.urls import include, path


def build_two_factor_patterns():
    """Retourne les URLs two_factor à concaténer aux ``urlpatterns``."""
    try:
        # two_factor.urls.urlpatterns est un 2-tuple (patterns_list, 'two_factor').
        # Les URLs portent déjà leur préfixe account/login/, account/two_factor/...
        # On passe le 2-tuple directement à include() pour respecter cette convention.
        from two_factor.urls import urlpatterns as tf_urlpatterns
    except ImportError:
        # En dev sans le package installé, on retourne une liste vide.
        return []

    return [
        path("", include(tf_urlpatterns)),
    ]


def patch_admin_site():
    """Force 2FA sur /admin/ Django (à appeler depuis settings ou ready())."""
    try:
        from django.contrib import admin
        from two_factor.admin import AdminSiteOTPRequired
    except ImportError:
        return
    admin.site.__class__ = AdminSiteOTPRequired
