"""URLs de l'espace apprenant (namespace ``learner``).

Inclus dans ``best_epargne.urls`` via :

    path("learner/", include(("formations.learner_urls", "learner"),
                              namespace="learner"))
"""
from __future__ import annotations

from django.urls import path

from formations.views import (
    LearnerCoursePlayerView,
    LearnerExploreView,
    StudentDashboard,
)

app_name = "learner"

urlpatterns = [
    path("", StudentDashboard.as_view(), name="dashboard"),
    path("explore/", LearnerExploreView.as_view(), name="explore"),
    path(
        "courses/<int:course_id>/",
        LearnerCoursePlayerView.as_view(),
        name="course_player",
    ),
]
