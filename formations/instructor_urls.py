"""URLs de l'espace formateur (namespace ``instructor``).

Inclus dans ``best_epargne.urls`` via :

    path("instructor/", include(("formations.instructor_urls", "instructor"),
                                 namespace="instructor"))

Côté templates et code Python, les anciens noms plats (``instructor_dashboard``
etc.) ont été remplacés par leurs équivalents namespacés (``instructor:dashboard``
etc.).
"""
from __future__ import annotations

from django.urls import path

from formations.instructor_lifecycle_views import (
    course_archive_view,
    course_publish_view,
    course_restore_view,
    course_unpublish_view,
)
from formations.views import (
    InstructorCourseBuilderView,
    InstructorCourseCreateView,
    InstructorCourseDetailView,
    InstructorCourseUpdateView,
    InstructorCourseView,
    InstructorDashboard,
    InstructorMediaDetailPageView,
    InstructorMediaLibraryView,
    InstructorQuizCreatePageView,
    InstructorQuizDetailPageView,
    InstructorQuizListPageView,
    InstructorQuizUpdatePageView,
)

app_name = "instructor"

urlpatterns = [
    path("", InstructorDashboard.as_view(), name="dashboard"),

    # Cours
    path("courses/", InstructorCourseView.as_view(), name="courses"),
    path("courses/create/", InstructorCourseCreateView.as_view(), name="course_create"),
    path(
        "courses/<int:course_id>/",
        InstructorCourseDetailView.as_view(),
        name="course_detail",
    ),
    path(
        "courses/<int:course_id>/edit/",
        InstructorCourseUpdateView.as_view(),
        name="course_update",
    ),
    path(
        "courses/<int:course_id>/builder/",
        InstructorCourseBuilderView.as_view(),
        name="course_builder",
    ),

    # ── P1.3 — Cycle de vie cours (POST forms CSRF, redirect vers detail) ──
    path(
        "courses/<int:course_id>/publish/",
        course_publish_view,
        name="course_publish",
    ),
    path(
        "courses/<int:course_id>/unpublish/",
        course_unpublish_view,
        name="course_unpublish",
    ),
    path(
        "courses/<int:course_id>/archive/",
        course_archive_view,
        name="course_archive",
    ),
    path(
        "courses/<int:course_id>/restore/",
        course_restore_view,
        name="course_restore",
    ),

    # Médias
    path("media/", InstructorMediaLibraryView.as_view(), name="media"),
    path(
        "media/<uuid:asset_id>/",
        InstructorMediaDetailPageView.as_view(),
        name="media_detail",
    ),

    # Quiz
    path("quizzes/", InstructorQuizListPageView.as_view(), name="quiz_list"),
    path("quizzes/create/", InstructorQuizCreatePageView.as_view(), name="quiz_create"),
    path(
        "quizzes/<int:quiz_id>/",
        InstructorQuizDetailPageView.as_view(),
        name="quiz_detail",
    ),
    path(
        "quizzes/<int:quiz_id>/edit/",
        InstructorQuizUpdatePageView.as_view(),
        name="quiz_update",
    ),
]
