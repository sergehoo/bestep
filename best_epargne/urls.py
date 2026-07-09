"""
best_epargne/urls.py — URL configuration Django.

R26 — Bascule SPA React
──────────────────────────────────────────────────────────────
Le frontend HTML historique est remplacé par la SPA React
(`frontend/dist/` servie par le container `bestfront` derrière
Traefik). Le container `bestweb` n'est PLUS exposé au public :
seuls les préfixes suivants sont reverse-proxyés par nginx :

    /api/…             ← SPA React (JWT)
    /admin/…           ← admin Django
    /media/…           ← uploads utilisateur
    /static/…          ← assets admin/backend
    /healthz/, /readyz/ ← probes

Les autres URL déclarées ci-dessous (HomeView, `/catalog/`,
`/dashboard/…`, `/landinghome/`, etc.) restent définies POUR :
  1. Ne pas casser les `reverse()` utilisés dans les emails ou
     les redirections internes ;
  2. Servir de repli si l'admin frappe directement bestweb sur
     le network interne (debug).

Elles ne doivent plus être linkées depuis la SPA. Le grand ménage
de ces vues legacy est planifié en R27+ (une fois la SPA validée
en prod).
"""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from best_epargne.health import healthz, readyz
from best_epargne.two_factor_urls import build_two_factor_patterns
from compte.views import switch_workspace
from formations.views import (
    HomeView,
    OrganisationDashboard,
    PlatformAdminDashboard,
    PlatformOrganizationsView,
    PlatformUsersView,
)

urlpatterns = [
    # CORRECTIF INFRA-03 : health/readiness endpoints (non-authentifiés).
    path("healthz/", healthz, name="healthz"),
    path("readyz/", readyz, name="readyz"),

    # Plateforme / utilitaires
    path("admin/", admin.site.urls),
    path("account/", include("allauth.urls")),
    path("tinymce/", include("tinymce.urls")),

    # Bascule entre espaces (POST-only, CSRF).
    path("workspace/switch/", switch_workspace, name="switch_workspace"),

    # Profil utilisateur (accessible depuis tous les espaces).
    path("compte/", include(("compte.urls", "compte"), namespace="compte")),

    # API + apps de domaine
    path("api/", include("best_epargne.apis.api_urls")),
    path("catalog/", include("catalog.urls")),
    path("learn/", include("enrollments.urls")),
    path("landinghome/", include("formations.landing_urls")),
    path("reviews/", include("reviews.urls")),
    path("assessments/", include("assessments.urls")),
    # CORRECTIF V2.A (CERT-01) : vérification publique des certificats.
    path("certifications/", include("certifications.urls", namespace="certifications")),
    # CORRECTIF V2.C (COM-06) : checkout + webhooks commerce.
    path("commerce/", include("commerce.urls", namespace="commerce")),

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

    # Porte d'entrée business → redirige vers org:dashboard.
    path("dashboard/business/", OrganisationDashboard.as_view(), name="business_dashboard"),

    # Dashboard administrateur plateforme.
    path("dashboard/admin/", PlatformAdminDashboard.as_view(), name="admin_dashboard"),
    path(
        "dashboard/admin/organizations/",
        PlatformOrganizationsView.as_view(),
        name="platform_organizations",
    ),
    path(
        "dashboard/admin/users/",
        PlatformUsersView.as_view(),
        name="platform_users",
    ),

    path("", HomeView.as_view(), name="home"),
]

# CORRECTIF V6.D (SEC-06) : brancher les URLs django-two-factor-auth.
# from best_epargne.two_factor_urls import build_two_factor_patterns
urlpatterns += build_two_factor_patterns()

# CORRECTIF FORMATIONS-35 : static seulement en DEBUG (en prod WhiteNoise s'en charge).
if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
