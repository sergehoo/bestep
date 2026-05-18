"""
reviews/urls.py — CORRECTIF P1.D (audit REV-07, REV-08).

REV-07 : avant, 3 ``path`` distincts au même chemin ``courses/<id>/reviews/me/`` ;
Django ne prenait que le 1er (GET), donc PUT/PATCH/DELETE étaient morts. On
fusionne en un seul ``as_view`` qui dispatche par méthode HTTP.

REV-08 : on retire ``static(STATIC_URL, …)`` qui n'a rien à faire dans une app
métier — c'est la responsabilité du ``best_epargne/urls.py`` global.
"""
from __future__ import annotations

from django.urls import path

from .views import CourseReviewViewSet

app_name = "reviews"

reviews_list = CourseReviewViewSet.as_view({"get": "list", "post": "create"})
reviews_detail = CourseReviewViewSet.as_view({"patch": "partial_update", "delete": "destroy"})
reviews_summary = CourseReviewViewSet.as_view({"get": "summary"})
# CORRECTIF REV-07 : une seule route /me/ qui dispatche tous les verbes.
reviews_me = CourseReviewViewSet.as_view({
    "get": "me",
    "put": "me_update",
    "patch": "me_update",
    "delete": "me_delete",
})

urlpatterns = [
    path("courses/<int:course_id>/reviews/", reviews_list, name="course_reviews"),
    path("courses/<int:course_id>/reviews/summary/", reviews_summary, name="course_reviews_summary"),
    path("courses/<int:course_id>/reviews/me/", reviews_me, name="course_reviews_me"),
    path("courses/<int:course_id>/reviews/<int:pk>/", reviews_detail, name="course_review_detail"),
]
