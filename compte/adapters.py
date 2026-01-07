# compte/adapters.py
from allauth.account.adapter import DefaultAccountAdapter
from django.urls import reverse


class AccountAdapter(DefaultAccountAdapter):
    def get_login_redirect_url(self, request):
        u = request.user
        if getattr(u, "is_superuser", False) or getattr(u, "is_staff", False):
            return reverse("admin_dashboard")
        if getattr(u, "is_instructor", False):
            return reverse("instructor_dashboard")
        if getattr(u, "is_company_admin", False):
            return reverse("business_dashboard")
        return reverse("learner_dashboard")
