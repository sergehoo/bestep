"""
catalog/views.py — CORRECTIF P1.C (audit CAT-01, CAT-02).

Avant : ``CourseDetailView.get_queryset`` retournait ``Course.objects.select_related(...)``
SANS aucun filtre — un internaute pouvait obtenir le détail d'un cours DRAFT,
ARCHIVED ou company_only=True via simple deviner du slug.

Après : on filtre systématiquement status=PUBLISHED et on respecte le scope
``company_only`` (cours interne d'org → visible uniquement par les membres
actifs de cette organisation). Le scoping passe par
``catalog.services.get_visible_courses_qs`` (nouveau service, factorisé pour
tout le projet).

À noter : ``catalog/urls.py`` reste vide pour l'instant (cf. CAT-02). Les
vues sont prêtes à être branchées dès qu'on les expose.
"""
from __future__ import annotations

from django.db.models import Avg, Count, Q
from django.views.generic import DetailView, ListView

from .models import Course
from .services import get_visible_courses_qs


class CourseListView(ListView):
    template_name = "catalog/course_list.html"
    model = Course
    context_object_name = "courses"
    paginate_by = 18

    def get_queryset(self):
        # Catalogue public : uniquement PUBLISHED + non company_only.
        qs = (
            get_visible_courses_qs(self.request.user, public_only=False)
            .select_related("category", "instructor")
            .annotate(
                avg_rating=Avg("reviews__rating"),
                reviews_count=Count("reviews"),
            )
        )
        q = self.request.GET.get("q")
        cat = self.request.GET.get("cat")
        ctype = self.request.GET.get("type")
        price = self.request.GET.get("price")  # free/paid/hybrid

        if q:
            qs = qs.filter(Q(title__icontains=q) | Q(subtitle__icontains=q) | Q(description__icontains=q))
        if cat:
            qs = qs.filter(category__slug=cat)
        if ctype:
            qs = qs.filter(course_type=ctype)
        if price:
            qs = qs.filter(pricing_type=price.upper())
        return qs.order_by("-published_at")


class CourseDetailView(DetailView):
    template_name = "catalog/course_detail.html"
    model = Course
    slug_field = "slug"
    slug_url_kwarg = "slug"

    def get_queryset(self):
        # CORRECTIF CAT-01 : filtrage strict via le service centralisé.
        return (
            get_visible_courses_qs(self.request.user)
            .select_related("category", "instructor")
            .prefetch_related("sections__lessons", "reviews")
        )
