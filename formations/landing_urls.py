from django.conf import settings
from django.conf.urls.static import static
from django.urls import path
from .views import (
    PublicExploreCoursesView,
    LearnerExploreCoursesView,
    LearnerCourseDetailView, CourseDetailPageView, PublicCourseDetailView, PublicCourseRelatedView,
)

urlpatterns = [
    path("public/courses/", PublicExploreCoursesView.as_view(), name="landing_public_courses_explore"),
    path("courses/<int:course_id>/", CourseDetailPageView.as_view(), name="course_detail"),

    path("public/courses/<int:course_id>/", PublicCourseDetailView.as_view(), name="api_public_course_detail"),
    path("public/courses/<int:course_id>/related/", PublicCourseRelatedView.as_view(), name="public_course_related"),

    path("learner/courses/", LearnerExploreCoursesView.as_view(), name="api_learner_courses_explore"),
    path("learner/courses/<int:course_id>/", LearnerCourseDetailView.as_view(), name="api_learner_course_detail"),

]+ static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
