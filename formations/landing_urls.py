from django.conf import settings
from django.conf.urls.static import static
from django.urls import path
from .views import (
    PublicExploreCoursesView,
    LearnerExploreCoursesView,
    LearnerCourseDetailView,
)

urlpatterns = [
    path("public/courses/", PublicExploreCoursesView.as_view(), name="landing_public_courses_explore"),
    path("learner/courses/", LearnerExploreCoursesView.as_view(), name="api_learner_courses_explore"),
    path("learner/courses/<int:course_id>/", LearnerCourseDetailView.as_view(), name="api_learner_course_detail"),
]+ static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
