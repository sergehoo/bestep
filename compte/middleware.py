"""Middlewares applicatifs liés au compte utilisateur."""

from django.shortcuts import redirect
from django.urls import NoReverseMatch, reverse
from django.utils.deprecation import MiddlewareMixin


# Durée de vie du flag en session (booléen). L'utilisateur ne refait pas de
# requête SQL à chaque navigation ; si le flag disparaît de la session il
# est recalculé automatiquement.
ONBOARDING_SESSION_KEY = "onboarding_completed"


class OnboardingRequiredMiddleware(MiddlewareMixin):
    """Bloque la navigation d'un apprenant tant que l'onboarding quiz n'a
    pas été complété.

    Règles de non-blocage :
    - utilisateur non authentifié ;
    - super-user / staff / admin plateforme ;
    - formateur (individuel ou rattaché à une organisation) ;
    - admin / owner / manager d'une organisation ;
    - pages exemptées (admin, account, API, static, médias...).

    Optimisation : le résultat est mémorisé dans la session pour éviter une
    requête SQL par requête HTTP. Le flag est invalidé implicitement dès que
    la session est reconstruite ; le middleware recalcule alors depuis la
    base. Le signal ``assessments.signals`` sert de point d'ancrage pour une
    future invalidation active (cache Redis par utilisateur, etc.).
    """

    EXEMPT_URL_NAMES = {
        "assessments:onboarding_quiz",
        "account_logout",
        "account_login",
        "account_signup",
        "account_reset_password",
        "admin:index",
    }

    EXEMPT_PATH_PREFIXES = (
        "/static/",
        "/media/",
        "/admin/",
        "/account/",
        "/accounts/",      # allauth
        "/api/",           # les APIs gèrent leur propre auth
        "/tinymce/",
    )

    def process_request(self, request):
        user = getattr(request, "user", None)

        # 1. Utilisateur non connecté → hors scope.
        if user is None or not user.is_authenticated:
            return None

        # 2. Admins plateforme / staff / superuser : jamais bloqués.
        if user.is_superuser or user.is_staff:
            return None
        if getattr(user, "is_platform_admin", False):
            return None

        # 3. Utilisateurs avec un rôle élevé (admin org, manager, formateur)
        #    ne sont pas des apprenants purs → jamais bloqués.
        if getattr(user, "is_org_admin", False):
            return None
        if getattr(user, "is_instructor", False):
            return None

        # 4. Chemins exemptés.
        path = request.path or ""
        for prefix in self.EXEMPT_PATH_PREFIXES:
            if path.startswith(prefix):
                return None

        try:
            onboarding_url = reverse("assessments:onboarding_quiz")
        except NoReverseMatch:
            # Pas de route d'onboarding (tests / setup partiel) → on laisse
            # passer.
            return None

        if path == onboarding_url:
            return None

        # 5. Cache en session pour éviter la requête SQL répétée.
        session = getattr(request, "session", None)
        if session is not None:
            cached = session.get(ONBOARDING_SESSION_KEY)
            if cached is True:
                return None

        # Import local pour éviter les imports circulaires au démarrage.
        try:
            from assessments.models import Attempt
        except Exception:  # pragma: no cover - app pas encore migrée
            return None

        completed = Attempt.objects.filter(
            user=user,
            quiz__is_onboarding=True,
            submitted_at__isnull=False,
        ).exists()

        if session is not None and completed:
            session[ONBOARDING_SESSION_KEY] = True

        if not completed:
            return redirect(onboarding_url)

        return None
