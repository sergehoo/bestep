from allauth.account.forms import LoginForm
from django.contrib.auth import login
from django.contrib.auth.mixins import LoginRequiredMixin, UserPassesTestMixin
from django.contrib.auth.views import LoginView
from django.db.models import Q
from django.shortcuts import render, redirect
from django.urls import reverse_lazy, reverse
from django.views.generic import TemplateView
# from requests import Response
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from best_epargne.apis.serializers import PublicCourseSerializer
from best_epargne.apis.views import _course_to_dict
from catalog.models import Course
from enrollments.models import Enrollment


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
    template_name = "allauth/../templates/account/login.html"
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


class HomeView(TemplateView):
    template_name = "home/index.html"


class PublicExploreCoursesView(APIView):
    """
    GET /api/public/courses/
    Filtres: q, type, pricing
    Pagination: limit, offset
    """
    permission_classes = [AllowAny]

    def get(self, request):
        q = (request.query_params.get("q") or "").strip()
        course_type = (request.query_params.get("type") or "").strip()
        pricing = (request.query_params.get("pricing") or "").strip()

        # ✅ safe parsing
        try:
            limit = int(request.query_params.get("limit") or 20)
        except ValueError:
            limit = 20
        try:
            offset = int(request.query_params.get("offset") or 0)
        except ValueError:
            offset = 0

        limit = max(1, min(limit, 50))
        offset = max(0, offset)

        qs = Course.objects.all().select_related('category')

        # ✅ uniquement cours publiés
        qs = qs.filter(status=Course.Status.PUBLISHED)

        if q:
            qs = qs.filter(
                Q(title__icontains=q) |
                Q(subtitle__icontains=q) |
                Q(description__icontains=q)
            )

        if course_type:
            qs = qs.filter(course_type=course_type)

        if pricing:
            qs = qs.filter(pricing_type=pricing)

        total = qs.count()

        # ✅ ordering
        qs = qs.order_by("-updated_at", "-id")

        items = qs[offset:offset + limit]

        serializer = PublicCourseSerializer(items, many=True, context={"request": request})

        return Response({
            "success": True,
            "count": total,  # standard
            "total": total,  # compat
            "limit": limit,
            "offset": offset,
            "results": serializer.data,  # standard
            "courses": serializer.data,  # compat front actuel
        })


class LearnerExploreCoursesView(APIView):
    """
    GET /api/learner/courses/
    Filtres:
    - q: recherche titre/description/sous-titre
    - type: course_type
    - pricing: pricing_type (FREE/PAID/HYBRID)
    - level: level (beginner/intermediate/advanced)
    - mine=1 -> seulement les cours où l'apprenant est inscrit
    Pagination:
    - limit (default 20)
    - offset (default 0)
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        q = (request.query_params.get("q") or "").strip()
        course_type = (request.query_params.get("type") or "").strip()
        pricing = (request.query_params.get("pricing") or "").strip()
        level = (request.query_params.get("level") or "").strip()
        mine = (request.query_params.get("mine") or "").strip() in ("1", "true", "yes")

        limit = int(request.query_params.get("limit") or 20)
        offset = int(request.query_params.get("offset") or 0)

        qs = Course.objects.all()
        try:
            qs = qs.filter(status=Course.Status.PUBLISHED)
        except Exception:
            qs = qs.filter(status="PUBLISHED")

        if q:
            qs = qs.filter(
                Q(title__icontains=q) |
                Q(description__icontains=q) |
                Q(subtitle__icontains=q)
            )

        if course_type:
            qs = qs.filter(course_type=course_type)

        if pricing:
            qs = qs.filter(pricing_type=pricing)

        if level:
            qs = qs.filter(level=level)

        # enroll map
        enroll_qs = Enrollment.objects.filter(user=request.user).select_related("course")
        enrolled_map = {e.course_id: e for e in enroll_qs}

        if mine:
            qs = qs.filter(id__in=enrolled_map.keys())

        total = qs.count()
        items = list(qs.order_by("-updated_at")[offset:offset + limit])

        results = []
        for c in items:
            e = enrolled_map.get(c.id)
            results.append(_course_to_dict(
                c,
                request=request,
                is_enrolled=bool(e),
                enrolled_at=getattr(e, "created_at", None) if e else None
            ))

        return Response({
            "count": total,
            "limit": limit,
            "offset": offset,
            "results": results,
        })


class LearnerCourseDetailView(APIView):
    """
    GET /api/learner/courses/<course_id>/
    """
    permission_classes = [AllowAny]

    def get(self, request, course_id: int):
        course = (
            Course.objects
            .select_related("instructor", "category")
            .filter(id=course_id)
            .first()
        )
        if not course:
            return Response({"detail": "Cours introuvable."}, status=status.HTTP_404_NOT_FOUND)

        if course.status != Course.Status.PUBLISHED:
            return Response({"detail": "Cours non disponible."}, status=status.HTTP_403_FORBIDDEN)

        e = Enrollment.objects.filter(user=request.user, course=course).first()

        return Response(
            _course_to_dict(
                course,
                request=request,
                is_enrolled=bool(e),
                enrolled_at=getattr(e, "created_at", None) if e else None
            ),
            status=status.HTTP_200_OK
        )


class RizView(TemplateView):
    template_name = "home/riz.html"