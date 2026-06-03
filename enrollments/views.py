"""
enrollments/views.py — CORRECTIF P1.J (audit ENROLL-02) + HOTFIX V_FIN.

CourseLearnView convertie en redirect vers ``LearnerCoursePlayerView`` :
le template ``learn/course_learn.html`` n'existait pas et le player
définitif vit dans ``learner/learner_course_player.html`` côté
``LearnerCoursePlayerView``. On résout le slug → course_id puis redirige.
"""
from __future__ import annotations

from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin
from django.shortcuts import get_object_or_404, redirect
from django.urls import NoReverseMatch, reverse
from django.views.generic import View

from catalog.models import Course

from .models import Enrollment


class CourseLearnView(LoginRequiredMixin, View):
    """
    HOTFIX : redirige ``/learn/course/<slug>/`` vers le vrai player apprenant
    ``LearnerCoursePlayerView`` (``/dashboard/learner/courses/<id>/``).

    Vérifications :
    1. Cours PUBLISHED obligatoire (anti-énumération).
    2. Enrollment actif obligatoire ; sinon redirect vers la page publique
       du cours avec un flash message UX.
    """

    def get(self, request, slug, *args, **kwargs):
        # Course PUBLISHED.
        course = get_object_or_404(
            Course.objects.filter(status=Course.Status.PUBLISHED),
            slug=slug,
        )

        # Enrollment actif.
        if not (
            Enrollment.objects.filter(user=request.user, course=course)
            .exclude(status=Enrollment.Status.CANCELED)
            .exists()
        ):
            messages.warning(
                request,
                "Vous devez être inscrit à ce cours pour le suivre.",
            )
            try:
                target = reverse(
                    "course_public_page",
                    kwargs={"slug": course.slug or "", "course_id": course.id},
                )
            except NoReverseMatch:
                target = f"/landinghome/courses/{course.id}/"
            return redirect(target)

        # Redirige vers le player apprenant définitif.
        try:
            target = reverse(
                "learner:course_player",
                kwargs={"course_id": course.id},
            )
        except NoReverseMatch:
            target = f"/dashboard/learner/courses/{course.id}/"
        return redirect(target)
