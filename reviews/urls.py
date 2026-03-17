
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path, include

# apps/courses/api/urls.py
from django.urls import path
from .views import CourseReviewViewSet

reviews_list = CourseReviewViewSet.as_view({"get": "list", "post": "create"})
reviews_detail = CourseReviewViewSet.as_view({"patch": "partial_update", "delete": "destroy"})
reviews_summary = CourseReviewViewSet.as_view({"get": "summary"})
reviews_me_get = CourseReviewViewSet.as_view({"get": "me"})
reviews_me_update = CourseReviewViewSet.as_view({"put": "me_update", "patch": "me_update"})
reviews_me_delete = CourseReviewViewSet.as_view({"delete": "me_delete"})

urlpatterns = [
    path("courses/<int:course_id>/reviews/", reviews_list, name="course_reviews"),
    path("courses/<int:course_id>/reviews/summary/", reviews_summary, name="course_reviews_summary"),

    path("courses/<int:course_id>/reviews/me/", reviews_me_get, name="course_reviews_me"),
    path("courses/<int:course_id>/reviews/me/", reviews_me_update, name="course_reviews_me_update"),
    path("courses/<int:course_id>/reviews/me/", reviews_me_delete, name="course_reviews_me_delete"),

    path("courses/<int:course_id>/reviews/<int:pk>/", reviews_detail, name="course_review_detail"),
]+ static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

