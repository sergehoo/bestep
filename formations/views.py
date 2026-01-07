from allauth.account.forms import LoginForm
from django.contrib.auth import login
from django.contrib.auth.mixins import LoginRequiredMixin, UserPassesTestMixin
from django.contrib.auth.views import LoginView
from django.shortcuts import render, redirect
from django.urls import reverse_lazy, reverse
from django.views.generic import TemplateView


# Create your views here.
def _redirect_by_role(user):
    if user.is_superuser or user.is_staff:
        return reverse("admin_dashboard")

    if user.role == user.Role.INSTRUCTOR:
        return reverse("instructor_dashboard")
    if user.role == user.Role.COMPANY_ADMIN:
        return reverse("business_dashboard")
    return reverse("learner_dashboard")


class UserLoginView(LoginView):
    template_name = "accounts/login.html"
    authentication_form = LoginForm
    redirect_authenticated_user = True

    def get_success_url(self):
        return _redirect_by_role(self.request.user)


class RoleRequiredMixin(UserPassesTestMixin):
    allowed_roles = ()  # ex: (User.Role.INSTRUCTOR,)

    def test_func(self):
        u = self.request.user
        if not u.is_authenticated:
            return False
        if u.is_superuser or u.is_staff:
            return True
        return bool(self.allowed_roles) and u.role in self.allowed_roles

    def handle_no_permission(self):
        # optionnel: redirige au lieu de 403
        from django.shortcuts import redirect
        return redirect(_redirect_by_role(self.request.user))


class InstructorDashboard(LoginRequiredMixin, RoleRequiredMixin, TemplateView):
    template_name = "home/instructor_dash.html"
    allowed_roles = ("INSTRUCTOR",)  # ou User.Role.INSTRUCTOR


class StudentDashboard(LoginRequiredMixin, RoleRequiredMixin, TemplateView):
    template_name = "home/student_dash.html"
    allowed_roles = ("LEARNER",)
    # Si tu utilises déjà RoleRequiredMixin chez toi, garde-le:
    # class StudentDashboard(LoginRequiredMixin, RoleRequiredMixin, TemplateView):
    # allowed_roles = ("LEARNER",)

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        # endpoints côté template (pratique pour Alpine)
        ctx["learner_endpoints"] = {
            "me": "/api/learner/me/",
            "kpis": "/api/learner/kpis/",
            "enrollments": "/api/learner/enrollments/",
            "notifications": "/api/learner/notifications/",
            "payments": "/api/learner/payments/",
            # détail/progress via /api/learner/courses/<id>/...
        }
        return ctx

class LearnerExploreView(LoginRequiredMixin, RoleRequiredMixin, TemplateView):
    template_name = "home/learner_explore.html"
    allowed_roles = ("LEARNER",)

class LearnerCoursePlayerView(LoginRequiredMixin, TemplateView):
    template_name = "home/learner_course_player.html"
class OrganisationDashboard(LoginRequiredMixin, RoleRequiredMixin, TemplateView):
    template_name = "home/organisation_dash.html"
    allowed_roles = ("COMPANY_ADMIN",)


class AdminDashboard(LoginRequiredMixin, TemplateView):
    template_name = "home/admin_dash.html"

    def dispatch(self, request, *args, **kwargs):
        if not (request.user.is_staff or request.user.is_superuser):
            return redirect(_redirect_by_role(request.user))
        return super().dispatch(request, *args, **kwargs)

# class HomeView(TemplateView):
#     template_name = "home/index.html"
