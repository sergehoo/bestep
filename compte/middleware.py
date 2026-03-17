from django.contrib.auth import get_user_model
from django.shortcuts import redirect
from django.urls import reverse
from django.utils.deprecation import MiddlewareMixin

from assessments.models import Attempt
User = get_user_model()


class OnboardingRequiredMiddleware(MiddlewareMixin):
    """
    Bloque la navigation d'un LEARNER tant que l'onboarding quiz n'est pas complété.
    """

    EXEMPT_URL_NAMES = {
        "assessments:onboarding_quiz",
        "account_logout",
        "account_login",
        "admin:index",
    }

    EXEMPT_PATH_PREFIXES = (
        "/static/",
        "/media/",
    )

    def process_request(self, request):
        # utilisateur non connecté → pas concerné
        if not request.user.is_authenticated:
            return None

        # ✅ 1) Superuser/staff : jamais bloqués
        if getattr(request.user, "is_superuser", False) or getattr(request.user, "is_staff", False):
            return None

        # ✅ 2) Ton rôle SUPERADMIN : jamais bloqué (au cas où)
        if getattr(request.user, "role", None) == "SUPERADMIN":
            return None

        # uniquement les learners
        if getattr(request.user, "role", None) != "LEARNER":
            return None

        # URLs exemptées (static, media…)
        path = request.path
        for prefix in self.EXEMPT_PATH_PREFIXES:
            if path.startswith(prefix):
                return None

        # URL onboarding
        onboarding_url = reverse("assessments:onboarding_quiz")

        # si déjà sur onboarding → ok
        if path == onboarding_url:
            return None

        # onboarding complété ?
        completed = Attempt.objects.filter(
            user=request.user,
            quiz__is_onboarding=True,
            submitted_at__isnull=False,
        ).exists()

        if not completed:
            return redirect(onboarding_url)

        return None