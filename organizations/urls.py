from django.urls import path

from organizations.views import OrganizationMembersView, OrganisationDashboard, OrganizationMemberCreateView, \
    OrganizationInstructorCreateView, OrganizationLearnerCreateView, OrganizationCoursesView, \
    OrganizationCourseCreateView, OrganizationCourseBuilderView, OrganizationCourseSectionCreateView, \
    OrganizationLessonCreateView, OrganizationCourseDetailView, OrganizationCourseAssignLearnersView

urlpatterns = [
    path("<int:organization_id>/dashboard/", OrganisationDashboard.as_view(), name="organization_dashboard"),
    path("<int:organization_id>/members/", OrganizationMembersView.as_view(), name="organization_members"),
    path("<int:organization_id>/members/create/", OrganizationMemberCreateView.as_view(),
         name="organization_member_create"),
    path("<int:organization_id>/members/create/instructor/", OrganizationInstructorCreateView.as_view(),
         name="organization_instructor_create"),
    path("<int:organization_id>/members/create/learner/", OrganizationLearnerCreateView.as_view(),
         name="organization_learner_create"),
    path("<int:organization_id>/courses/", OrganizationCoursesView.as_view(), name="organization_courses"),
    path("<int:organization_id>/courses/create/", OrganizationCourseCreateView.as_view(),
         name="organization_course_create"),

    path(

        "<int:organization_id>/courses/<int:course_id>/builder/",

        OrganizationCourseBuilderView.as_view(),

        name="organization_course_builder",

    ),

    path(

        "<int:organization_id>/courses/<int:course_id>/sections/create/",

        OrganizationCourseSectionCreateView.as_view(),

        name="organization_course_section_create",

    ),

    path(

        "<int:organization_id>/courses/<int:course_id>/sections/<int:section_id>/lessons/create/",

        OrganizationLessonCreateView.as_view(),

        name="organization_lesson_create",

    ),
    path(
        "<int:organization_id>/courses/<int:course_id>/",
        OrganizationCourseDetailView.as_view(),
        name="organization_course_detail",
    ),
    path("course_assign/<int:organization_id>/courses/<int:course_id>/-learners/",
        OrganizationCourseAssignLearnersView.as_view(),
        name="organization_course_assign_learners",

    ),
]
