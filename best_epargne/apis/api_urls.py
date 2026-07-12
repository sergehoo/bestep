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
    # --- R45 — Admin overview (cockpit consolidé) ---
    path(
        "admin/overview/",
        __import__(
            "best_epargne.apis.api_admin_overview",
            fromlist=["AdminOverviewView"],
        ).AdminOverviewView.as_view(),
        name="api_admin_overview",
    ),

    # --- AI Phase 6 — Centre admin IA ---
    path(
        "ai/admin/overview/",
        __import__("best_epargne.apis.api_ai_admin", fromlist=["AIAdminOverviewView"]).AIAdminOverviewView.as_view(),
        name="api_ai_admin_overview",
    ),
    path(
        "ai/admin/providers/",
        __import__("best_epargne.apis.api_ai_admin", fromlist=["AIProviderListView"]).AIProviderListView.as_view(),
        name="api_ai_admin_providers",
    ),
    path(
        "ai/admin/providers/<int:provider_id>/",
        __import__("best_epargne.apis.api_ai_admin", fromlist=["AIProviderDetailView"]).AIProviderDetailView.as_view(),
        name="api_ai_admin_provider_detail",
    ),
    path(
        "ai/admin/providers/<int:provider_id>/test/",
        __import__("best_epargne.apis.api_ai_admin", fromlist=["AIProviderTestView"]).AIProviderTestView.as_view(),
        name="api_ai_admin_provider_test",
    ),
    path(
        "ai/admin/models/",
        __import__("best_epargne.apis.api_ai_admin", fromlist=["AIModelListView"]).AIModelListView.as_view(),
        name="api_ai_admin_models",
    ),
    path(
        "ai/admin/models/<int:model_id>/",
        __import__("best_epargne.apis.api_ai_admin", fromlist=["AIModelDetailView"]).AIModelDetailView.as_view(),
        name="api_ai_admin_model_detail",
    ),
    path(
        "ai/admin/quotas/",
        __import__("best_epargne.apis.api_ai_admin", fromlist=["AIQuotaListView"]).AIQuotaListView.as_view(),
        name="api_ai_admin_quotas",
    ),
    path(
        "ai/admin/quotas/<int:quota_id>/",
        __import__("best_epargne.apis.api_ai_admin", fromlist=["AIQuotaDetailView"]).AIQuotaDetailView.as_view(),
        name="api_ai_admin_quota_detail",
    ),
    path(
        "ai/admin/audit-logs/",
        __import__("best_epargne.apis.api_ai_admin", fromlist=["AIAuditLogListView"]).AIAuditLogListView.as_view(),
        name="api_ai_admin_audit_logs",
    ),
    path(
        "ai/admin/usage/",
        __import__("best_epargne.apis.api_ai_admin", fromlist=["AIUsageRecordListView"]).AIUsageRecordListView.as_view(),
        name="api_ai_admin_usage",
    ),
    path(
        "ai/image-generate/",
        __import__("best_epargne.apis.api_ai_admin", fromlist=["AIImageGenerateView"]).AIImageGenerateView.as_view(),
        name="api_ai_image_generate",
    ),

    # --- AI Phase 5 — Knowledge base (RAG) + Web search ---
    path(
        "ai/knowledge/spaces/",
        __import__(
            "best_epargne.apis.api_ai_kb",
            fromlist=["KBSpaceListView"],
        ).KBSpaceListView.as_view(),
        name="api_ai_kb_spaces",
    ),
    path(
        "ai/knowledge/documents/",
        __import__(
            "best_epargne.apis.api_ai_kb",
            fromlist=["KBDocumentListView"],
        ).KBDocumentListView.as_view(),
        name="api_ai_kb_documents",
    ),
    path(
        "ai/knowledge/documents/<int:document_id>/",
        __import__(
            "best_epargne.apis.api_ai_kb",
            fromlist=["KBDocumentDetailView"],
        ).KBDocumentDetailView.as_view(),
        name="api_ai_kb_document_detail",
    ),
    path(
        "ai/knowledge/documents/<int:document_id>/reindex/",
        __import__(
            "best_epargne.apis.api_ai_kb",
            fromlist=["KBDocumentReindexView"],
        ).KBDocumentReindexView.as_view(),
        name="api_ai_kb_document_reindex",
    ),
    path(
        "ai/knowledge/search/",
        __import__(
            "best_epargne.apis.api_ai_kb",
            fromlist=["KBSearchView"],
        ).KBSearchView.as_view(),
        name="api_ai_kb_search",
    ),
    path(
        "ai/web-search/",
        __import__(
            "best_epargne.apis.api_ai_kb",
            fromlist=["WebSearchView"],
        ).WebSearchView.as_view(),
        name="api_ai_web_search",
    ),

    # --- AI Phase 4 — Agent outillé (tools + approvals) ---
    path(
        "ai/tools/",
        __import__(
            "best_epargne.apis.api_ai_tools",
            fromlist=["AIToolsListView"],
        ).AIToolsListView.as_view(),
        name="api_ai_tools_list",
    ),
    path(
        "ai/tools/execute/",
        __import__(
            "best_epargne.apis.api_ai_tools",
            fromlist=["AIToolExecuteView"],
        ).AIToolExecuteView.as_view(),
        name="api_ai_tools_execute",
    ),
    path(
        "ai/tools/approvals/",
        __import__(
            "best_epargne.apis.api_ai_tools",
            fromlist=["AIToolApprovalListView"],
        ).AIToolApprovalListView.as_view(),
        name="api_ai_tools_approvals",
    ),
    path(
        "ai/tools/approvals/<int:approval_id>/confirm/",
        __import__(
            "best_epargne.apis.api_ai_tools",
            fromlist=["AIToolApprovalConfirmView"],
        ).AIToolApprovalConfirmView.as_view(),
        name="api_ai_tools_approval_confirm",
    ),
    path(
        "ai/tools/approvals/<int:approval_id>/cancel/",
        __import__(
            "best_epargne.apis.api_ai_tools",
            fromlist=["AIToolApprovalCancelView"],
        ).AIToolApprovalCancelView.as_view(),
        name="api_ai_tools_approval_cancel",
    ),
    path(
        "ai/tools/executions/",
        __import__(
            "best_epargne.apis.api_ai_tools",
            fromlist=["AIToolExecutionsView"],
        ).AIToolExecutionsView.as_view(),
        name="api_ai_tools_executions",
    ),

    # --- AI Phase 3 — Text transforms + recommendations ---
    path(
        "ai/text-transform/",
        __import__(
            "best_epargne.apis.api_ai_p3",
            fromlist=["TextTransformView"],
        ).TextTransformView.as_view(),
        name="api_ai_text_transform",
    ),
    path(
        "ai/text-transform/actions/",
        __import__(
            "best_epargne.apis.api_ai_p3",
            fromlist=["TextTransformActionsView"],
        ).TextTransformActionsView.as_view(),
        name="api_ai_text_transform_actions",
    ),
    path(
        "ai/recommendations/",
        __import__(
            "best_epargne.apis.api_ai_p3",
            fromlist=["RecommendationsView"],
        ).RecommendationsView.as_view(),
        name="api_ai_recommendations",
    ),
    path(
        "ai/recommendations/feedback/",
        __import__(
            "best_epargne.apis.api_ai_p3",
            fromlist=["RecommendationFeedbackView"],
        ).RecommendationFeedbackView.as_view(),
        name="api_ai_recommendation_feedback",
    ),

    # --- AI Phase 2 — Générateur de cours IA (assistant guidé 6 étapes) ---
    path(
        "ai/course-generations/",
        __import__(
            "best_epargne.apis.api_ai_course_gen",
            fromlist=["AICourseGenerationListView"],
        ).AICourseGenerationListView.as_view(),
        name="api_ai_course_gen_list",
    ),
    path(
        "ai/course-generations/<int:generation_id>/",
        __import__(
            "best_epargne.apis.api_ai_course_gen",
            fromlist=["AICourseGenerationDetailView"],
        ).AICourseGenerationDetailView.as_view(),
        name="api_ai_course_gen_detail",
    ),
    path(
        "ai/course-generations/<int:generation_id>/plan/",
        __import__(
            "best_epargne.apis.api_ai_course_gen",
            fromlist=["AICourseGenerationPlanView"],
        ).AICourseGenerationPlanView.as_view(),
        name="api_ai_course_gen_plan",
    ),
    path(
        "ai/course-generations/<int:generation_id>/lesson/",
        __import__(
            "best_epargne.apis.api_ai_course_gen",
            fromlist=["AICourseGenerationLessonView"],
        ).AICourseGenerationLessonView.as_view(),
        name="api_ai_course_gen_lesson",
    ),
    path(
        "ai/course-generations/<int:generation_id>/quiz/",
        __import__(
            "best_epargne.apis.api_ai_course_gen",
            fromlist=["AICourseGenerationQuizView"],
        ).AICourseGenerationQuizView.as_view(),
        name="api_ai_course_gen_quiz",
    ),
    path(
        "ai/course-generations/<int:generation_id>/certification/",
        __import__(
            "best_epargne.apis.api_ai_course_gen",
            fromlist=["AICourseGenerationCertificationView"],
        ).AICourseGenerationCertificationView.as_view(),
        name="api_ai_course_gen_certification",
    ),
    path(
        "ai/course-generations/<int:generation_id>/finalize/",
        __import__(
            "best_epargne.apis.api_ai_course_gen",
            fromlist=["AICourseGenerationFinalizeView"],
        ).AICourseGenerationFinalizeView.as_view(),
        name="api_ai_course_gen_finalize",
    ),

    # --- AI Phase 1 — Assistant IA (conversations, messages, usage) ---
    path(
        "ai/conversations/",
        __import__(
            "best_epargne.apis.api_ai",
            fromlist=["AIConversationListView"],
        ).AIConversationListView.as_view(),
        name="api_ai_conversations",
    ),
    path(
        "ai/conversations/<int:conversation_id>/",
        __import__(
            "best_epargne.apis.api_ai",
            fromlist=["AIConversationDetailView"],
        ).AIConversationDetailView.as_view(),
        name="api_ai_conversation_detail",
    ),
    path(
        "ai/conversations/<int:conversation_id>/messages/",
        __import__(
            "best_epargne.apis.api_ai",
            fromlist=["AIMessagePostView"],
        ).AIMessagePostView.as_view(),
        name="api_ai_conversation_message",
    ),
    path(
        "ai/messages/<int:message_id>/feedback/",
        __import__(
            "best_epargne.apis.api_ai",
            fromlist=["AIMessageFeedbackView"],
        ).AIMessageFeedbackView.as_view(),
        name="api_ai_message_feedback",
    ),
    path(
        "ai/usage/",
        __import__(
            "best_epargne.apis.api_ai",
            fromlist=["AIUsageView"],
        ).AIUsageView.as_view(),
        name="api_ai_usage",
    ),
    path(
        "ai/config/",
        __import__(
            "best_epargne.apis.api_ai",
            fromlist=["AIConfigView"],
        ).AIConfigView.as_view(),
        name="api_ai_config",
    ),

    # --- R46 — Admin platform settings (persisted + versioned) ---
    path(
        "admin/platform-settings/",
        __import__(
            "best_epargne.apis.api_admin_platform_settings",
            fromlist=["AdminPlatformSettingsView"],
        ).AdminPlatformSettingsView.as_view(),
        name="api_admin_platform_settings",
    ),
    path(
        "admin/platform-settings/history/",
        __import__(
            "best_epargne.apis.api_admin_platform_settings",
            fromlist=["AdminPlatformSettingsHistoryView"],
        ).AdminPlatformSettingsHistoryView.as_view(),
        name="api_admin_platform_settings_history",
    ),

    # --- R43 — Admin reports (CSV exports) ---
    path(
        "admin/reports/users.csv",
        __import__(
            "best_epargne.apis.api_admin_reports",
            fromlist=["ReportUsersCSVView"],
        ).ReportUsersCSVView.as_view(),
        name="api_admin_report_users",
    ),
    path(
        "admin/reports/courses.csv",
        __import__(
            "best_epargne.apis.api_admin_reports",
            fromlist=["ReportCoursesCSVView"],
        ).ReportCoursesCSVView.as_view(),
        name="api_admin_report_courses",
    ),
    path(
        "admin/reports/enrollments.csv",
        __import__(
            "best_epargne.apis.api_admin_reports",
            fromlist=["ReportEnrollmentsCSVView"],
        ).ReportEnrollmentsCSVView.as_view(),
        name="api_admin_report_enrollments",
    ),
    path(
        "admin/reports/orders.csv",
        __import__(
            "best_epargne.apis.api_admin_reports",
            fromlist=["ReportOrdersCSVView"],
        ).ReportOrdersCSVView.as_view(),
        name="api_admin_report_orders",
    ),
    path(
        "admin/reports/payouts.csv",
        __import__(
            "best_epargne.apis.api_admin_reports",
            fromlist=["ReportPayoutsCSVView"],
        ).ReportPayoutsCSVView.as_view(),
        name="api_admin_report_payouts",
    ),

    # --- R42 — Admin payouts ---
    path(
        "admin/payouts/",
        __import__(
            "best_epargne.apis.api_admin_payouts",
            fromlist=["AdminPayoutsListView"],
        ).AdminPayoutsListView.as_view(),
        name="api_admin_payouts",
    ),
    path(
        "admin/payouts/<int:payout_id>/",
        __import__(
            "best_epargne.apis.api_admin_payouts",
            fromlist=["AdminPayoutDetailView"],
        ).AdminPayoutDetailView.as_view(),
        name="api_admin_payout_detail",
    ),
    path(
        "admin/payouts/<int:payout_id>/validate/",
        __import__(
            "best_epargne.apis.api_admin_payouts",
            fromlist=["AdminPayoutValidateView"],
        ).AdminPayoutValidateView.as_view(),
        name="api_admin_payout_validate",
    ),
    path(
        "admin/payouts/<int:payout_id>/mark_paid/",
        __import__(
            "best_epargne.apis.api_admin_payouts",
            fromlist=["AdminPayoutMarkPaidView"],
        ).AdminPayoutMarkPaidView.as_view(),
        name="api_admin_payout_mark_paid",
    ),
    path(
        "admin/payouts/<int:payout_id>/cancel/",
        __import__(
            "best_epargne.apis.api_admin_payouts",
            fromlist=["AdminPayoutCancelView"],
        ).AdminPayoutCancelView.as_view(),
        name="api_admin_payout_cancel",
    ),

    # --- R41 — Admin commissions ---
    path(
        "admin/commissions/",
        __import__(
            "best_epargne.apis.api_admin_commissions",
            fromlist=["AdminCommissionsListView"],
        ).AdminCommissionsListView.as_view(),
        name="api_admin_commissions",
    ),
    path(
        "admin/commissions/<int:rule_id>/",
        __import__(
            "best_epargne.apis.api_admin_commissions",
            fromlist=["AdminCommissionDetailView"],
        ).AdminCommissionDetailView.as_view(),
        name="api_admin_commission_detail",
    ),
    path(
        "admin/commissions/simulate/",
        __import__(
            "best_epargne.apis.api_admin_commissions",
            fromlist=["AdminCommissionSimulateView"],
        ).AdminCommissionSimulateView.as_view(),
        name="api_admin_commission_simulate",
    ),

    # --- R40 — Admin notifications (proxy support MVP) ---
    path(
        "admin/notifications/",
        __import__(
            "best_epargne.apis.api_admin_notifications",
            fromlist=["AdminNotificationsListView"],
        ).AdminNotificationsListView.as_view(),
        name="api_admin_notifications",
    ),

    # --- R39 — Admin roles (Django Groups) ---
    path(
        "admin/roles/",
        __import__(
            "best_epargne.apis.api_admin_roles",
            fromlist=["AdminRolesListView"],
        ).AdminRolesListView.as_view(),
        name="api_admin_roles",
    ),
    path(
        "admin/roles/<int:role_id>/",
        __import__(
            "best_epargne.apis.api_admin_roles",
            fromlist=["AdminRoleDetailView"],
        ).AdminRoleDetailView.as_view(),
        name="api_admin_role_detail",
    ),
    path(
        "admin/roles/<int:role_id>/users/",
        __import__(
            "best_epargne.apis.api_admin_roles",
            fromlist=["AdminRoleUsersView"],
        ).AdminRoleUsersView.as_view(),
        name="api_admin_role_users",
    ),
    path(
        "admin/roles/<int:role_id>/users/<int:user_id>/",
        __import__(
            "best_epargne.apis.api_admin_roles",
            fromlist=["AdminRoleUserRemoveView"],
        ).AdminRoleUserRemoveView.as_view(),
        name="api_admin_role_user_remove",
    ),

    # --- R38 — Admin marketing coupons ---
    path(
        "admin/marketing/coupons/",
        __import__(
            "best_epargne.apis.api_admin_marketing",
            fromlist=["AdminCouponsListView"],
        ).AdminCouponsListView.as_view(),
        name="api_admin_coupons",
    ),
    path(
        "admin/marketing/coupons/<int:coupon_id>/",
        __import__(
            "best_epargne.apis.api_admin_marketing",
            fromlist=["AdminCouponDetailView"],
        ).AdminCouponDetailView.as_view(),
        name="api_admin_coupon_detail",
    ),

    # --- R37 — Admin payments ---
    path(
        "admin/payments/",
        __import__(
            "best_epargne.apis.api_admin_payments",
            fromlist=["AdminPaymentsListView"],
        ).AdminPaymentsListView.as_view(),
        name="api_admin_payments",
    ),

    # --- R35 — Admin content lessons ---
    path(
        "admin/content/lessons/",
        __import__(
            "best_epargne.apis.api_admin_content",
            fromlist=["AdminContentLessonsView"],
        ).AdminContentLessonsView.as_view(),
        name="api_admin_content_lessons",
    ),

    # --- R33 — Admin quizzes ---
    path(
        "admin/quizzes/",
        __import__(
            "best_epargne.apis.api_admin_quizzes",
            fromlist=["AdminQuizzesListView"],
        ).AdminQuizzesListView.as_view(),
        name="api_admin_quizzes",
    ),

    # --- R32 — Admin moderation reviews ---
    path(
        "admin/reviews/",
        __import__(
            "best_epargne.apis.api_admin_moderation",
            fromlist=["AdminReviewsListView"],
        ).AdminReviewsListView.as_view(),
        name="api_admin_reviews",
    ),
    path(
        "admin/reviews/<int:review_id>/",
        __import__(
            "best_epargne.apis.api_admin_moderation",
            fromlist=["AdminReviewDetailView"],
        ).AdminReviewDetailView.as_view(),
        name="api_admin_review_detail",
    ),

    # --- R31 — Admin organizations ---
    path(
        "admin/organizations/",
        __import__(
            "best_epargne.apis.api_admin_organizations",
            fromlist=["AdminOrganizationsListView"],
        ).AdminOrganizationsListView.as_view(),
        name="api_admin_organizations",
    ),
    path(
        "admin/organizations/<int:org_id>/",
        __import__(
            "best_epargne.apis.api_admin_organizations",
            fromlist=["AdminOrganizationDetailView"],
        ).AdminOrganizationDetailView.as_view(),
        name="api_admin_organization_detail",
    ),

    # --- R30 — Admin instructors ---
    path(
        "admin/instructors/",
        __import__(
            "best_epargne.apis.api_admin_instructors",
            fromlist=["AdminInstructorsListView"],
        ).AdminInstructorsListView.as_view(),
        name="api_admin_instructors",
    ),

    # --- R28 — Admin enrollments ---
    path(
        "admin/enrollments/",
        __import__(
            "best_epargne.apis.api_admin_enrollments",
            fromlist=["AdminEnrollmentsListView"],
        ).AdminEnrollmentsListView.as_view(),
        name="api_admin_enrollments",
    ),

    # --- R28 — Admin audit log (lifecycle cours) ---
    path(
        "admin/audit/course-lifecycle/",
        __import__(
            "best_epargne.apis.api_admin_audit",
            fromlist=["AdminAuditCourseLifecycleView"],
        ).AdminAuditCourseLifecycleView.as_view(),
        name="api_admin_audit_course_lifecycle",
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
