"""URLs de l'espace organisation (namespace ``org``).

Inclus dans ``best_epargne.urls`` via :

    path("organisation/", include("organizations.urls", namespace="org"))

(Le préfixe d'URL reste ``/organisation/`` pour ne pas casser les bookmarks
historiques. Le rebranding du préfixe est volontairement reporté à une
itération séparée pour éviter de péter les anciens liens.)
"""
from django.urls import path

from organizations.views import (
    OrganisationDashboard,
    OrganizationCourseAssignLearnersView,
    OrganizationCourseBuilderView,
    OrganizationCourseCreateView,
    OrganizationCourseDetailView,
    OrganizationCourseSectionCreateView,
    OrganizationCoursesView,
    OrganizationInstructorCreateView,
    OrganizationLearnerCreateView,
    OrganizationLessonCreateView,
    OrganizationMemberCreateView,
    OrganizationMembersView,
)

app_name = "org"

urlpatterns = [
    path(
        "<int:organization_id>/dashboard/",
        OrganisationDashboard.as_view(),
        name="dashboard",
    ),

    # Membres
    path(
        "<int:organization_id>/members/",
        OrganizationMembersView.as_view(),
        name="members",
    ),
    path(
        "<int:organization_id>/members/create/",
        OrganizationMemberCreateView.as_view(),
        name="member_create",
    ),
    path(
        "<int:organization_id>/members/create/instructor/",
        OrganizationInstructorCreateView.as_view(),
        name="instructor_create",
    ),
    path(
        "<int:organization_id>/members/create/learner/",
        OrganizationLearnerCreateView.as_view(),
        name="learner_create",
    ),

    # Cours
    path(
        "<int:organization_id>/courses/",
        OrganizationCoursesView.as_view(),
        name="courses",
    ),
    path(
        "<int:organization_id>/courses/create/",
        OrganizationCourseCreateView.as_view(),
        name="course_create",
    ),
    path(
        "<int:organization_id>/courses/<int:course_id>/",
        OrganizationCourseDetailView.as_view(),
        name="course_detail",
    ),
    path(
        "<int:organization_id>/courses/<int:course_id>/builder/",
        OrganizationCourseBuilderView.as_view(),
        name="course_builder",
    ),
    path(
        "<int:organization_id>/courses/<int:course_id>/sections/create/",
        OrganizationCourseSectionCreateView.as_view(),
        name="section_create",
    ),
    path(
        "<int:organization_id>/courses/<int:course_id>/sections/<int:section_id>/lessons/create/",
        OrganizationLessonCreateView.as_view(),
        name="lesson_create",
    ),
    # Pattern remis dans la même hiérarchie que les autres routes Cours
    # (anciennement ``course_assign/<org>/courses/<id>/-learners/`` qui
    # cassait la cohérence du préfixe ``<int:organization_id>/courses/...``
    # et exposait un ``/-learners/`` peu engageant côté URL).
    path(
        "<int:organization_id>/courses/<int:course_id>/assign-learners/",
        OrganizationCourseAssignLearnersView.as_view(),
        name="course_assign_learners",
    ),
]
