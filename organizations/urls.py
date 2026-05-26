"""URLs de l'espace organisation (namespace ``org``).

CORRECTIF V2.B (ORG-02) : route ``invitation_accept`` ajoutée.
"""
from django.urls import path

from organizations.invitation_views import accept_invitation
from organizations.views import (
    OrganisationDashboard,
    OrganizationCourseAssignInstructorView,
    OrganizationCourseAssignLearnersView,
    OrganizationCourseBuilderView,
    OrganizationCourseCreateView,
    OrganizationCourseDetailView,
    OrganizationCourseQuizListView,
    OrganizationCourseSectionCreateView,
    OrganizationCoursesView,
    OrganizationInstructorCreateView,
    OrganizationLearnerCreateView,
    OrganizationLessonCreateView,
    OrganizationMediaLibraryView,
    OrganizationMemberCreateView,
    OrganizationMemberDeactivateView,
    OrganizationMemberDetailView,
    OrganizationMemberReactivateView,
    OrganizationMemberUpdateView,
    OrganizationMembersView,
    OrganizationQuizCreateView,
    OrganizationQuizDetailView,
)

app_name = "org"

urlpatterns = [
    # CORRECTIF V2.B : acceptation d'invitation (UUID token).
    path(
        "invitations/accept/<uuid:token>/",
        accept_invitation,
        name="invitation_accept",
    ),

    path(
        "<int:organization_id>/dashboard/",
        OrganisationDashboard.as_view(),
        name="dashboard",
    ),

    # Membres
    path("<int:organization_id>/members/", OrganizationMembersView.as_view(), name="members"),
    path("<int:organization_id>/members/create/", OrganizationMemberCreateView.as_view(), name="member_create"),
    path("<int:organization_id>/members/create/instructor/", OrganizationInstructorCreateView.as_view(), name="instructor_create"),
    path("<int:organization_id>/members/create/learner/", OrganizationLearnerCreateView.as_view(), name="learner_create"),
    path("<int:organization_id>/members/<int:membership_id>/", OrganizationMemberDetailView.as_view(), name="member_detail"),
    path("<int:organization_id>/members/<int:membership_id>/edit/", OrganizationMemberUpdateView.as_view(), name="member_update"),
    path("<int:organization_id>/members/<int:membership_id>/deactivate/", OrganizationMemberDeactivateView.as_view(), name="member_deactivate"),
    path("<int:organization_id>/members/<int:membership_id>/reactivate/", OrganizationMemberReactivateView.as_view(), name="member_reactivate"),

    # Cours
    path("<int:organization_id>/courses/", OrganizationCoursesView.as_view(), name="courses"),
    path("<int:organization_id>/courses/create/", OrganizationCourseCreateView.as_view(), name="course_create"),
    path("<int:organization_id>/courses/<int:course_id>/", OrganizationCourseDetailView.as_view(), name="course_detail"),
    path("<int:organization_id>/courses/<int:course_id>/builder/", OrganizationCourseBuilderView.as_view(), name="course_builder"),
    path("<int:organization_id>/courses/<int:course_id>/sections/create/", OrganizationCourseSectionCreateView.as_view(), name="section_create"),
    path("<int:organization_id>/courses/<int:course_id>/sections/<int:section_id>/lessons/create/", OrganizationLessonCreateView.as_view(), name="lesson_create"),
    path("<int:organization_id>/courses/<int:course_id>/assign-learners/", OrganizationCourseAssignLearnersView.as_view(), name="course_assign_learners"),
    path("<int:organization_id>/courses/<int:course_id>/assign-instructor/", OrganizationCourseAssignInstructorView.as_view(), name="course_assign_instructor"),

    # Quiz
    path("<int:organization_id>/courses/<int:course_id>/quizzes/", OrganizationCourseQuizListView.as_view(), name="quiz_list"),
    path("<int:organization_id>/courses/<int:course_id>/quizzes/create/", OrganizationQuizCreateView.as_view(), name="quiz_create"),
    path("<int:organization_id>/courses/<int:course_id>/quizzes/<int:quiz_id>/", OrganizationQuizDetailView.as_view(), name="quiz_detail"),

    # Bibliothèque média
    path("<int:organization_id>/media/", OrganizationMediaLibraryView.as_view(), name="media_library"),
]
