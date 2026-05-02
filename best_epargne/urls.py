"""URL configuration for best_epargne project.

Architecture des espaces (multi-rôles) :
- ``instructor:*`` (préfixe ``/dashboard/instructor/``) — espace formateur.
- ``learner:*``    (préfixe ``/dashboard/learner/``)   — espace apprenant.
- ``org:*``        (préfixe ``/organisation/``)         — espace organisation.

Les anciens noms plats (``instructor_dashboard``, ``learner_dashboard``,
``organization_dashboard``...) ont été supprimés au profit des noms
namespacés (``instructor:dashboard``, ``learner:dashboard``, ``org:dashboard``).
La seule exception est ``business_dashboard`` qui reste exposé comme
porte d'entrée routante (cible de redirection allauth historique).

Voir ``AUDIT_MULTIROLE.md`` pour la rationale.
"""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from compte.views import switch_workspace
from formations.views import HomeView, OrganisationDashboard, PlatformAdminDashboard


urlpatterns = [
    # Plateforme / utilitaires
    path("admin/", admin.site.urls),
    path("account/", include("allauth.urls")),
    path("tinymce/", include("tinymce.urls")),

    # Bascule entre espaces (Learner / Instructor / Org / Plateforme).
    # POST-only, CSRF protégé, voir ``compte.views.switch_workspace``.
    path("workspace/switch/", switch_workspace, name="switch_workspace"),

    # API + apps de domaine
    path("api/", include("best_epargne.apis.api_urls")),
    path("catalog/", include("catalog.urls")),
    path("learn/", include("enrollments.urls")),
    path("landinghome/", include("formations.landing_urls")),
    path("reviews/", include("reviews.urls")),
    path("assessments/", include("assessments.urls")),

    # Espaces multi-rôles avec namespaces
    path(
        "dashboard/instructor/",
        include(("formations.instructor_urls", "instructor"), namespace="instructor"),
    ),
    path(
        "dashboard/learner/",
        include(("formations.learner_urls", "learner"), namespace="learner"),
    ),
    path("organisation/", include("organizations.urls", namespace="org")),

    # Porte d'entrée business — redirige vers ``org:dashboard`` après
    # résolution. Conservée à l'identique pour la compat des anciens liens
    # (allauth, bookmarks). Voir formations.views.OrganisationDashboard.
    path("dashboard/business/", OrganisationDashboard.as_view(), name="business_dashboard"),

    # Dashboard administrateur plateforme (PLATFORM_ADMIN, distinct de
    # l'admin Django ``admin:index`` qui reste réservé au staff technique).
    path(
        "dashboard/admin/",
        PlatformAdminDashboard.as_view(),
        name="admin_dashboard",
    ),

    path("", HomeView.as_view(), name="home"),
] + static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
