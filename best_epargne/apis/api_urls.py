# config/api_urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from best_epargne.apis.views import CategoryViewSet, CourseViewSet, InstructorCourseDetailView, \
    InstructorCoursePublishView, InstructorCourseArchiveView, InstructorSectionListView, InstructorSectionCreateView, \
    InstructorSectionUpdateView, InstructorSectionDeleteView, InstructorLessonListView, InstructorLessonCreateView, \
    InstructorLessonUpdateView, InstructorLessonDeleteView, MediaUploadFinalizeView, MediaUploadInitView, \
    InstructorMeView, InstructorKpisView, InstructorReviewsView, InstructorPayoutsView, InstructorNotificationsView, \
    MediaSignedGetView, InstructorMediaListView, LearnerMeView, LearnerKpisView, LearnerEnrollmentsView, \
    LearnerCourseDetailView, LearnerCourseProgressView, LearnerNotificationsView, LearnerPaymentsView, \
    LearnerProgressView, LearnerExploreCoursesView, LearnerEnrollView, LearnerCourseOutlineView, LearnerContinueView, \
    LearnerLessonStateView, LearnerLessonProgressUpdateView, LearnerSetCurrentLessonView
# from catalog.api.views import CourseViewSet, CategoryViewSet
from enrollments.api import EnrollmentViewSet, LessonProgressViewSet
from organizations.api import CompanyMembersViewSet

router = DefaultRouter()
router.register("categories", CategoryViewSet, basename="categories")
router.register("courses", CourseViewSet, basename="courses")
router.register("enrollments", EnrollmentViewSet, basename="enrollments")
router.register("progress", LessonProgressViewSet, basename="progress")
router.register("company/members", CompanyMembersViewSet, basename="company-members")

urlpatterns = [
    path("apis/", include(router.urls)),

    # --- Instructor dashboard ---
    path("instructor/me/", InstructorMeView.as_view(), name="api_instructor_me"),
    path("instructor/kpis/", InstructorKpisView.as_view(), name="api_instructor_kpis"),
    path("instructor/reviews/", InstructorReviewsView.as_view(), name="api_instructor_reviews"),
    path("instructor/payouts/", InstructorPayoutsView.as_view(), name="api_instructor_payouts"),
    path("instructor/notifications/", InstructorNotificationsView.as_view(), name="api_instructor_notifications"),
    path(
        "instructor/courses/",
        CourseViewSet.as_view({"get": "my_courses"}),
        name="api_instructor_courses",
    ),
    path(
        "instructor/courses/create/",
        CourseViewSet.as_view({"post": "create"}),
        name="api_instructor_course_create",
    ),

    # (optionnel mais utile)
    path(
        "instructor/courses/<int:pk>/update/",
        CourseViewSet.as_view({"patch": "partial_update"}),
        name="api_instructor_course_update",
    ),

    # --- Instructor builder: course actions ---
    path("instructor/courses/<int:course_id>/", InstructorCourseDetailView.as_view()),
    path("instructor/courses/<int:course_id>/publish/", InstructorCoursePublishView.as_view()),
    path("instructor/courses/<int:course_id>/archive/", InstructorCourseArchiveView.as_view()),

    # --- Builder: sections ---
    path("instructor/courses/<int:course_id>/sections/", InstructorSectionListView.as_view()),
    path("instructor/courses/<int:course_id>/sections/create/", InstructorSectionCreateView.as_view()),
    path("instructor/courses/<int:course_id>/sections/<int:section_id>/update/",
         InstructorSectionUpdateView.as_view()),
    path("instructor/courses/<int:course_id>/sections/<int:section_id>/delete/",
         InstructorSectionDeleteView.as_view()),

    # --- Builder: lessons ---
    path("instructor/courses/<int:course_id>/sections/<int:section_id>/lessons/",
         InstructorLessonListView.as_view(), name="api_instructor_lessons",),
    path("instructor/courses/<int:course_id>/sections/<int:section_id>/lessons/create/",
         InstructorLessonCreateView.as_view(),name="api_instructor_lesson_create"),
    path("instructor/courses/<int:course_id>/sections/<int:section_id>/lessons/<int:lesson_id>/update/",
         InstructorLessonUpdateView.as_view(),name="api_instructor_lesson_update"),
    path("instructor/courses/<int:course_id>/sections/<int:section_id>/lessons/<int:lesson_id>/delete/",
         InstructorLessonDeleteView.as_view(),
        name="api_instructor_lesson_delete"),

    path("learner/me/", LearnerMeView.as_view(), name="api_learner_me"),
    path("learner/kpis/", LearnerKpisView.as_view(), name="api_learner_kpis"),
    path("learner/enrollments/", LearnerEnrollmentsView.as_view(), name="api_learner_enrollments"),
    path("learner/progress/", LearnerProgressView.as_view(), name="api_learner_progress"),

    path("learner/courses/<int:course_id>/", LearnerCourseDetailView.as_view(), name="api_learner_course_detail"),
    path("learner/courses/<int:course_id>/progress/", LearnerCourseProgressView.as_view(),
         name="api_learner_course_progress"),


    path("learner/notifications/", LearnerNotificationsView.as_view(), name="api_learner_notifications"),
    path("learner/payments/", LearnerPaymentsView.as_view(), name="api_learner_payments"),

    path("learner/courses/", LearnerExploreCoursesView.as_view(), name="api_learner_courses_explore"),
    path("learner/courses/<int:course_id>/enroll/", LearnerEnrollView.as_view(), name="api_learner_enroll"),

    path("learner/courses/<int:course_id>/outline/", LearnerCourseOutlineView.as_view(), name="api_learner_course_outline"),
    path("learner/courses/<int:course_id>/continue/", LearnerContinueView.as_view(), name="api_learner_continue"),

    path("learner/courses/<int:course_id>/lessons/<int:lesson_id>/state/", LearnerLessonStateView.as_view(), name="api_learner_lesson_state"),
    path("learner/courses/<int:course_id>/lessons/<int:lesson_id>/progress/", LearnerLessonProgressUpdateView.as_view(), name="api_learner_lesson_progress_update"),
    path("learner/courses/<int:course_id>/set-current/", LearnerSetCurrentLessonView.as_view(), name="api_learner_set_current"),


    # --- Media / MinIO upload ---
    path("media/upload/init/", MediaUploadInitView.as_view(), name="api_media_upload_init"),
    path("media/upload/finalize/", MediaUploadFinalizeView.as_view(), name="api_media_upload_finalize"),
    path("media/<uuid:asset_id>/signed/", MediaSignedGetView.as_view(), name="api_media_signed_get"),
    path("instructor/media/", InstructorMediaListView.as_view(), name="api_instructor_media"),

]