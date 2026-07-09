# config/api_urls.py
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from best_epargne.apis.views import (
    CategoryViewSet,
    InstructorCourseArchiveView,
    InstructorCourseDetailView,
    InstructorCoursePublishView,
    InstructorCourseRestoreView,
    InstructorCourseUnpublishView,
    InstructorCourseQuizListView,
    InstructorCourseViewSet,
    InstructorKpisView,
    InstructorLessonCreateView,
    InstructorLessonDeleteView,
    InstructorLessonListView,
    InstructorLessonUpdateView,
    InstructorMediaDeleteView,
    InstructorMediaDetailView,
    InstructorMediaListView,
    InstructorMediaUpdateView,
    InstructorMeView,
    InstructorNotificationsView,
    InstructorPayoutsView,
    InstructorQuizCreateView,
    InstructorQuizDetailView,
    InstructorQuizListApiView,
    InstructorQuizQuestionCreateView,
    InstructorQuizQuestionDeleteView,
    InstructorQuizQuestionUpdateView,
    InstructorQuizUpdateView,
    InstructorReviewsView,
    InstructorSectionCreateView,
    InstructorSectionDeleteView,
    InstructorSectionListView,
    InstructorSectionQuizAssignView,
    InstructorSectionQuizCreateView,
    InstructorSectionQuizUnassignView,
    InstructorSectionUpdateView,
    LearnerContinueView,
    LearnerCourseDetailView,
    LearnerCourseOutlineView,
    LearnerCoursePlayerDataView,
    LearnerCourseProgressView,
    LearnerEnrollmentsView,
    LearnerEnrollView,
    LearnerExploreCoursesView,
    LearnerKpisView,
    LearnerLessonCompleteView,
    LearnerLessonProgressUpdateView,
    LearnerLessonStateView,
    LearnerMediaSignedGetView,
    LearnerMeView,
    LearnerNotificationsView,
    LearnerOrganizationCoursesAPIView,
    LearnerPaymentsView,
    LearnerProgressView,
    LearnerSectionQuizSubmitView,
    LearnerSectionQuizView,
    LearnerSetCurrentLessonView,
    MediaMultipartAbortView,
    MediaMultipartCompleteView,
    MediaMultipartInitView,
    MediaMultipartListPartsView,
    MediaMultipartPartUrlView,
    MediaSignedGetView,
    MediaThumbnailSignedGetView,
    MediaUploadFinalizeView,
    MediaUploadInitView,
    OrganizationCourseViewSet,
    PublicCourseViewSet,
)

# from catalog.api.views import CourseViewSet, CategoryViewSet
from enrollments.api import EnrollmentViewSet, LessonProgressViewSet

router = DefaultRouter()
router.register("categories", CategoryViewSet, basename="categories")
router.register("courses", PublicCourseViewSet, basename="courses")
router.register("instructor/courses-private", InstructorCourseViewSet, basename="instructor-courses")
router.register("organization/courses-private", OrganizationCourseViewSet, basename="organization-courses")
router.register("enrollments", EnrollmentViewSet, basename="enrollments")
router.register("progress", LessonProgressViewSet, basename="progress")

from drf_spectacular.views import (  # noqa: E402
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)

urlpatterns = [
    # V_OBS.A : documentation OpenAPI auto-générée.
    path("schema/", SpectacularAPIView.as_view(), name="api-schema"),
    path("docs/", SpectacularSwaggerView.as_view(url_name="api-schema"), name="api-docs"),
    path("redoc/", SpectacularRedocView.as_view(url_name="api-schema"), name="api-redoc"),

    # R1 — Auth JWT pour SPA React (register/login/refresh/logout/me + password)
    path("auth/", include(("compte.urls_api", "compte_api"), namespace="compte_api")),

    # R2.1 — Endpoints publics unifiés pour SPA (cours, catégories, previews)
    path(
        "public/courses/",
        __import__(
            "best_epargne.apis.api_public", fromlist=["PublicCourseListView"]
        ).PublicCourseListView.as_view(),
        name="api_public_courses_list",
    ),
    path(
        "public/courses/<slug:slug>/",
        __import__(
            "best_epargne.apis.api_public", fromlist=["PublicCourseDetailView"]
        ).PublicCourseDetailView.as_view(),
        name="api_public_course_detail",
    ),
    path(
        "public/courses/<slug:slug>/lessons/<int:lesson_id>/preview/",
        __import__(
            "best_epargne.apis.api_public",
            fromlist=["PublicCoursePreviewLessonView"],
        ).PublicCoursePreviewLessonView.as_view(),
        name="api_public_lesson_preview",
    ),
    path(
        "public/categories/",
        __import__(
            "best_epargne.apis.api_public", fromlist=["PublicCategoryListView"]
        ).PublicCategoryListView.as_view(),
        name="api_public_categories",
    ),

    # R4 — Reviews publics + related courses
    path(
        "public/courses/<slug:slug>/reviews/",
        __import__(
            "best_epargne.apis.api_public", fromlist=["PublicCourseReviewsView"]
        ).PublicCourseReviewsView.as_view(),
        name="api_public_course_reviews",
    ),
    path(
        "public/courses/<slug:slug>/reviews/summary/",
        __import__(
            "best_epargne.apis.api_public",
            fromlist=["PublicCourseReviewsSummaryView"],
        ).PublicCourseReviewsSummaryView.as_view(),
        name="api_public_course_reviews_summary",
    ),
    path(
        "public/courses/<slug:slug>/related/",
        __import__(
            "best_epargne.apis.api_public", fromlist=["PublicRelatedCoursesView"]
        ).PublicRelatedCoursesView.as_view(),
        name="api_public_course_related",
    ),

    # R7 — Admin plateforme (users + config, restreint platform_admin)
    path(
        "admin/users/",
        __import__(
            "best_epargne.apis.api_admin", fromlist=["AdminUserListView"]
        ).AdminUserListView.as_view(),
        name="api_admin_users_list",
    ),
    path(
        "admin/users/<int:user_id>/",
        __import__(
            "best_epargne.apis.api_admin", fromlist=["AdminUserDetailView"]
        ).AdminUserDetailView.as_view(),
        name="api_admin_user_detail",
    ),
    path(
        "admin/users/<int:user_id>/reset-password/",
        __import__(
            "best_epargne.apis.api_admin",
            fromlist=["AdminUserResetPasswordView"],
        ).AdminUserResetPasswordView.as_view(),
        name="api_admin_user_reset_password",
    ),
    path(
        "admin/config/",
        __import__(
            "best_epargne.apis.api_admin", fromlist=["AdminConfigView"]
        ).AdminConfigView.as_view(),
        name="api_admin_config",
    ),

    # R2.2 — Dashboards par rôle (hydratation SPA en 1 call)
    path(
        "dashboard/student/",
        __import__(
            "best_epargne.apis.api_dashboards", fromlist=["StudentDashboardView"]
        ).StudentDashboardView.as_view(),
        name="api_dashboard_student",
    ),
    path(
        "dashboard/instructor/",
        __import__(
            "best_epargne.apis.api_dashboards", fromlist=["InstructorDashboardView"]
        ).InstructorDashboardView.as_view(),
        name="api_dashboard_instructor",
    ),
    path(
        "dashboard/admin/",
        __import__(
            "best_epargne.apis.api_dashboards", fromlist=["AdminDashboardView"]
        ).AdminDashboardView.as_view(),
        name="api_dashboard_admin",
    ),

    path("apis/", include(router.urls)),

    # --- Instructor dashboard ---
    path("instructor/me/", InstructorMeView.as_view(), name="api_instructor_me"),
    path("instructor/kpis/", InstructorKpisView.as_view(), name="api_instructor_kpis"),
    path("instructor/reviews/", InstructorReviewsView.as_view(), name="api_instructor_reviews"),
    path("instructor/payouts/", InstructorPayoutsView.as_view(), name="api_instructor_payouts"),
    path("instructor/notifications/", InstructorNotificationsView.as_view(), name="api_instructor_notifications"),
    path("instructor/courses/", InstructorCourseViewSet.as_view({"get": "my_courses"}), name="api_instructor_courses", ),
    path("instructor/courses/create/",
         InstructorCourseViewSet.as_view({"post": "create"}),
         name="api_instructor_course_create",
         ),

    # (optionnel mais utile)
    path(
        "instructor/courses/<int:pk>/update/",
        InstructorCourseViewSet.as_view({"patch": "partial_update"}),
        name="api_instructor_course_update",
    ),

    # --- Instructor builder: course actions ---
    path("instructor/courses/<int:course_id>/", InstructorCourseDetailView.as_view()),
    # ── P1.2 — Cycle de vie cours (4 transitions via catalog.lifecycle) ──
    path(
        "instructor/courses/<int:course_id>/publish/",
        InstructorCoursePublishView.as_view(),
        name="api_instructor_course_publish",
    ),
    path(
        "instructor/courses/<int:course_id>/unpublish/",
        InstructorCourseUnpublishView.as_view(),
        name="api_instructor_course_unpublish",
    ),
    path(
        "instructor/courses/<int:course_id>/archive/",
        InstructorCourseArchiveView.as_view(),
        name="api_instructor_course_archive",
    ),
    path(
        "instructor/courses/<int:course_id>/restore/",
        InstructorCourseRestoreView.as_view(),
        name="api_instructor_course_restore",
    ),

    # --- Builder: sections ---
    path("instructor/courses/<int:course_id>/sections/", InstructorSectionListView.as_view()),
    path("instructor/courses/<int:course_id>/sections/create/", InstructorSectionCreateView.as_view()),
    path("instructor/courses/<int:course_id>/sections/<int:section_id>/update/",
         InstructorSectionUpdateView.as_view()),
    path("instructor/courses/<int:course_id>/sections/<int:section_id>/delete/",
         InstructorSectionDeleteView.as_view()),

    # --- Builder: lessons ---
    path("instructor/courses/<int:course_id>/sections/<int:section_id>/lessons/",
         InstructorLessonListView.as_view(), name="api_instructor_lessons", ),
    path("instructor/courses/<int:course_id>/sections/<int:section_id>/lessons/create/",
         InstructorLessonCreateView.as_view(), name="api_instructor_lesson_create"),
    path("instructor/courses/<int:course_id>/sections/<int:section_id>/lessons/<int:lesson_id>/update/",
         InstructorLessonUpdateView.as_view(), name="api_instructor_lesson_update"),
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
    path(
        "learner/organization-courses/",
        LearnerOrganizationCoursesAPIView.as_view(),
        name="api_learner_organization_courses",
    ),
    path("learner/player/<int:course_id>/", LearnerCoursePlayerDataView.as_view(), name="api_learner_player"),
    path("learner/media/<uuid:asset_id>/signed/", LearnerMediaSignedGetView.as_view(),
         name="api_learner_media_signed"),

    path("learner/notifications/", LearnerNotificationsView.as_view(), name="api_learner_notifications"),
    path("learner/payments/", LearnerPaymentsView.as_view(), name="api_learner_payments"),

    path("learner/courses/", LearnerExploreCoursesView.as_view(), name="api_learner_courses_explore"),
    path("learner/courses/<int:course_id>/enroll/", LearnerEnrollView.as_view(), name="api_learner_enroll"),

    path("learner/courses/<int:course_id>/outline/", LearnerCourseOutlineView.as_view(),
         name="api_learner_course_outline"),
    path("learner/courses/<int:course_id>/continue/", LearnerContinueView.as_view(), name="api_learner_continue"),

    path("learner/courses/<int:course_id>/lessons/<int:lesson_id>/state/", LearnerLessonStateView.as_view(),
         name="api_learner_lesson_state"),
    path("learner/courses/<int:course_id>/lessons/<int:lesson_id>/progress/", LearnerLessonProgressUpdateView.as_view(),
         name="api_learner_lesson_progress_update"),
    # R14 : marquage manuel (docs / articles / audios / quiz)
    path("learner/courses/<int:course_id>/lessons/<int:lesson_id>/complete/",
         LearnerLessonCompleteView.as_view(),
         name="api_learner_lesson_complete"),
    path("learner/courses/<int:course_id>/set-current/", LearnerSetCurrentLessonView.as_view(),
         name="api_learner_set_current"),

    # Instructor quiz APIs
    path(
        "instructor/quizzes/",
        InstructorQuizListApiView.as_view(),
        name="api_instructor_quiz_list"
    ),
    path(
        "instructor/quizzes/create/",
        InstructorQuizCreateView.as_view(),
        name="api_instructor_quiz_create"
    ),
    path(
        "instructor/courses/<int:course_id>/quizzes/",
        InstructorCourseQuizListView.as_view(),
        name="api_instructor_course_quizzes"
    ),
    # path(
    #     "instructor/quizzes/<int:quiz_id>/update/",
    #     InstructorQuizUpdateView.as_view(),
    #     name="api_instructor_quiz_update"
    # ),
    path(
        "instructor/courses/<int:course_id>/sections/<int:section_id>/quiz/create/",
        InstructorSectionQuizCreateView.as_view(),
        name="api_instructor_section_quiz_create"
    ),
    path(
        "instructor/courses/<int:course_id>/sections/<int:section_id>/quiz/assign/",
        InstructorSectionQuizAssignView.as_view(),
        name="api_instructor_section_quiz_assign"
    ),
    path(
        "instructor/courses/<int:course_id>/sections/<int:section_id>/quiz/unassign/",
        InstructorSectionQuizUnassignView.as_view(),
        name="api_instructor_section_quiz_unassign"
    ),
    path(
        "instructor/quizzes/<int:quiz_id>/",
        InstructorQuizDetailView.as_view(),
        name="api_instructor_quiz_detail"
    ),
    path(
        "instructor/quizzes/<int:quiz_id>/questions/create/",
        InstructorQuizQuestionCreateView.as_view(),
        name="api_instructor_quiz_question_create"
    ),
    path(
        "instructor/questions/<int:question_id>/update/",
        InstructorQuizQuestionUpdateView.as_view(),
        name="api_instructor_quiz_question_update"
    ),
    path(
        "instructor/questions/<int:question_id>/delete/",
        InstructorQuizQuestionDeleteView.as_view(),
        name="api_instructor_quiz_question_delete"
    ),

    # Learner quiz APIs
    path(
        "learner/courses/<int:course_id>/sections/<int:section_id>/quiz/",
        LearnerSectionQuizView.as_view(),
        name="api_learner_section_quiz"
    ),
    path(
        "learner/courses/<int:course_id>/sections/<int:section_id>/quiz/submit/",
        LearnerSectionQuizSubmitView.as_view(),
        name="api_learner_section_quiz_submit"
    ),
    path(
        "instructor/quizzes/<int:quiz_id>/update/",
        InstructorQuizUpdateView.as_view(),
        name="api_instructor_quiz_update"
    ),
    # --- R20 — Certificate Template Builder ---
    path(
        "instructor/certificate-templates/",
        __import__(
            "best_epargne.apis.api_certificate_templates",
            fromlist=["CertificateTemplateListCreateView"],
        ).CertificateTemplateListCreateView.as_view(),
        name="api_instructor_certificate_templates",
    ),
    path(
        "instructor/certificate-templates/<int:template_id>/",
        __import__(
            "best_epargne.apis.api_certificate_templates",
            fromlist=["CertificateTemplateDetailView"],
        ).CertificateTemplateDetailView.as_view(),
        name="api_instructor_certificate_template_detail",
    ),
    path(
        "instructor/certificate-templates/<int:template_id>/duplicate/",
        __import__(
            "best_epargne.apis.api_certificate_templates",
            fromlist=["CertificateTemplateDuplicateView"],
        ).CertificateTemplateDuplicateView.as_view(),
        name="api_instructor_certificate_template_duplicate",
    ),

    # --- Media / MinIO upload ---
    path("media/upload/init/", MediaUploadInitView.as_view(), name="api_media_upload_init"),
    path("media/upload/finalize/", MediaUploadFinalizeView.as_view(), name="api_media_upload_finalize"),
    path("media/<uuid:asset_id>/signed/", MediaSignedGetView.as_view(), name="api_media_signed_get"),
    path("media/<uuid:asset_id>/thumbnail/", MediaThumbnailSignedGetView.as_view(),
         name="api_media_thumbnail_signed_get"),

path("media/upload/multipart/init/", MediaMultipartInitView.as_view(), name="api_media_multipart_init"),
path("media/upload/multipart/part-url/", MediaMultipartPartUrlView.as_view(), name="api_media_multipart_part_url"),
path("media/upload/multipart/complete/", MediaMultipartCompleteView.as_view(), name="api_media_multipart_complete"),
path("media/upload/multipart/abort/", MediaMultipartAbortView.as_view(), name="api_media_multipart_abort"),
path( "media/upload/multipart/list-parts/", MediaMultipartListPartsView.as_view(), name="api_media_multipart_list_parts",),
    path("instructor/media/<uuid:asset_id>/", InstructorMediaDetailView.as_view(),
         name="api_instructor_media_detail"),
    path("instructor/media/<uuid:asset_id>/update/", InstructorMediaUpdateView.as_view(),
         name="api_instructor_media_update"),
    path("instructor/media/<uuid:asset_id>/delete/", InstructorMediaDeleteView.as_view(),
         name="api_instructor_media_delete"),

    path("instructor/media/", InstructorMediaListView.as_view(), name="api_instructor_media"),

]
