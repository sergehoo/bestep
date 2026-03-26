"""
URL configuration for best_epargne project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/4.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path, include

from formations.views import InstructorDashboard, StudentDashboard, \
    OrganisationDashboard, AdminDashboard, LearnerExploreView, LearnerCoursePlayerView, HomeView, InstructorCourseView, \
    InstructorCourseBuilderView, InstructorMediaLibraryView, InstructorCourseCreateView, InstructorCourseDetailView, \
    InstructorCourseUpdateView, InstructorQuizListPageView, InstructorQuizCreatePageView, InstructorQuizDetailPageView, \
    InstructorQuizUpdatePageView

urlpatterns = [
                  path('admin/', admin.site.urls),
                  path('account/', include('allauth.urls')),
                  path("tinymce/", include("tinymce.urls")),

                  # marketplace
                  path("api/", include("best_epargne.apis.api_urls")),  # marketplace
                  path("catalog/", include("catalog.urls")),  # marketplace
                  path("learn/", include("enrollments.urls")),  # player
                  path("company/", include("organizations.urls")),
                  path("landinghome/", include("formations.landing_urls")),
                  path("reviews/", include("reviews.urls")),
                  path("assessments/", include("assessments.urls")),
                  # path("login/", UserLoginView.as_view(), name="login"),
                  # path("register/", register_view, name="register"),

                  path("dashboard/instructor/", InstructorDashboard.as_view(), name="instructor_dashboard"),
                  path("dashboard/instructor/courses/", InstructorCourseView.as_view(), name="instructor_courses"),
                  # path("dashboard/instructor/courses/", InstructorCourseView.as_view(), name="instructor_courses"),
                  path("dashboard/instructor/courses/<int:course_id>/builder/", InstructorCourseBuilderView.as_view(),
                       name="instructor_course_builder"),
                  path("dashboard/instructor/media/", InstructorMediaLibraryView.as_view(), name="instructor_media"),

                  path("instructor/courses/create/page/", InstructorCourseCreateView.as_view(),
                       name="instructor_course_create_page"),
                  path("instructor/courses/<int:course_id>/detail/", InstructorCourseDetailView.as_view(),
                       name="instructor_course_detail"),
                  path("instructor/courses/<int:course_id>/edit/", InstructorCourseUpdateView.as_view(),
                       name="instructor_course_update"),

                  path(
                      "dashboard/instructor/quizzes/",
                      InstructorQuizListPageView.as_view(),
                      name="instructor_quiz_list_page"
                  ),
                  path(
                      "dashboard/instructor/quizzes/create/",
                      InstructorQuizCreatePageView.as_view(),
                      name="instructor_quiz_create_page"
                  ),
                  path(
                      "dashboard/instructor/quizzes/<int:quiz_id>/",
                      InstructorQuizDetailPageView.as_view(),
                      name="instructor_quiz_detail_page"
                  ),
                  path(
                      "dashboard/instructor/quizzes/<int:quiz_id>/edit/",
                      InstructorQuizUpdatePageView.as_view(),
                      name="instructor_quiz_update_page"
                  ),

                  path("dashboard/learner/", StudentDashboard.as_view(), name="learner_dashboard"),
                  path("dashboard/learner/explore/", LearnerExploreView.as_view(), name="learner_explore"),
                  path("dashboard/learner/courses/<int:course_id>/", LearnerCoursePlayerView.as_view(),
                       name="learner_course_player"),

                  path("dashboard/business/", OrganisationDashboard.as_view(), name="business_dashboard"),
                  path("dashboard/admin/", AdminDashboard.as_view(), name="admin_dashboard"),
                  path("", HomeView.as_view(), name="home"),

              ] + static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
