from django.shortcuts import render

# Create your views here.
from django.contrib.auth.mixins import LoginRequiredMixin
from django.views.generic import DetailView
from django.shortcuts import get_object_or_404
from .models import Enrollment, LessonProgress
from apps.catalog.models import Course, Lesson

class CourseLearnView(LoginRequiredMixin, DetailView):
    template_name = "learn/course_learn.html"
    model = Course
    slug_field = "slug"
    slug_url_kwarg = "slug"

    def dispatch(self, request, *args, **kwargs):
        course = self.get_object()
        get_object_or_404(Enrollment, user=request.user, course=course)
        return super().dispatch(request, *args, **kwargs)

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        enrollment = Enrollment.objects.get(user=self.request.user, course=self.object)
        ctx["enrollment"] = enrollment
        ctx["progress_map"] = {
            p.lesson_id: p for p in LessonProgress.objects.filter(enrollment=enrollment)
        }
        return ctx