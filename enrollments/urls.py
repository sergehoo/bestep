"""
enrollments/urls.py — CORRECTIF P1.J (audit ENROLL-01).

Avant : ``urlpatterns = []`` ; ``CourseLearnView`` définie dans
``enrollments/views.py`` n'était jamais branchée. Le bouton « Continuer le
cours » côté apprenant était mort.
"""
from django.urls import path

from .lesson_media_views import lesson_signed_stream
from .views import CourseLearnView

app_name = "learn"

urlpatterns = [
    path("course/<slug:slug>/", CourseLearnView.as_view(), name="course_learn"),
    # V5.D / SEC-33 : endpoint signed URL court pour le player vidéo.
    path("api/lessons/<int:lesson_id>/stream/", lesson_signed_stream, name="lesson_stream"),
]
