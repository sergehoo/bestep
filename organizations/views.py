from django.shortcuts import render

# Create your views here.
from django.contrib.auth.mixins import LoginRequiredMixin
from django.views.generic import TemplateView, ListView
from django.shortcuts import get_object_or_404
from .models import Company, CompanyMember

class CompanyDashboardView(LoginRequiredMixin, TemplateView):
    template_name = "company/dashboard.html"

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        membership = CompanyMember.objects.filter(user=self.request.user, company_role=CompanyMember.CompanyRole.ADMIN).first()
        ctx["company"] = membership.company if membership else None
        return ctx

class CompanyEmployeesView(LoginRequiredMixin, ListView):
    template_name = "company/employees.html"
    context_object_name = "members"
    paginate_by = 30

    def get_queryset(self):
        membership = CompanyMember.objects.filter(user=self.request.user, company_role=CompanyMember.CompanyRole.ADMIN).first()
        if not membership:
            return CompanyMember.objects.none()
        return CompanyMember.objects.filter(company=membership.company).select_related("user").order_by("user__full_name", "user__email")