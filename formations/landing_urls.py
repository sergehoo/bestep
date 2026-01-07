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
]
