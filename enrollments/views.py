"""
enrollments/views.py — CORRECTIF P1.J (audit ENROLL-02).

Avant : ``CourseLearnView.dispatch`` faisait ``get_object_or_404(Enrollment, ...)``
puis ``get_context_data`` refaisait ``Enrollment.objects.get(...)``. La
``DetailView`` parente faisait elle aussi un ``get_object()`` → 3 requêtes
pour le même Enrollment sur la page la plus visitée du parcours apprenant.

Après : on mémorise ``self.object`` + ``self.enrollment`` dès ``dispatch`` et
on réutilise. Bonus : ``select_related`` sur ``course`` et ``current_lesson``.
"""
from __future__ import annotations

from django.contrib.auth.mixins import LoginRequiredMixin
from django.shortcuts import get_object_or_404
from django.views.generic import DetailView

from catalog.models import Course

from .models import Enrollment, LessonProgress


class CourseLearnView(LoginRequiredMixin, DetailView):
    template_name = "learn/course_learn.html"
    model = Course
    slug_field = "slug"
    slug_url_kwarg = "slug"

    def dispatch(self, request, *args, **kwargs):
        # 1. Récupère le Course (cache dans self.object pour éviter le double fetch).
        self.object = super().get_object()
        # 2. Récupère l'Enrollment du user pour ce cours, ou 404.
        self.enrollment = get_object_or_404(
            Enrollment.objects.select_related("course", "current_lesson"),
            user=request.user,
            course=self.object,
        )
        return super().dispatch(request, *args, **kwargs)

    def get_object(self, queryset=None):
        # Utilise la valeur mémorisée pour éviter le 3e fetch DetailView.
        if getattr(self, "object", None) is not None:
            return self.object
        return super().get_object(queryset)

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["enrollment"] = self.enrollment
        ctx["progress_map"] = {
            p.lesson_id: p
            for p in LessonProgress.objects.filter(enrollment=self.enrollment).select_related("lesson")
        }
        return ctx
