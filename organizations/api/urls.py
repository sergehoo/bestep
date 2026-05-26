"""organizations/api/urls.py — CORRECTIF V2.B (ORG-01).

Avant : ``from views import ...`` (import absolu sur un module inexistant).
Après : import qualifié ``from organizations.api.views import ...``.

À brancher dans ``best_epargne/apis/api_urls.py`` :

    path("organizations/", include("organizations.api.urls")),
"""
from __future__ import annotations

from rest_framework.routers import DefaultRouter

from organizations.api.views import (
    OrganizationInvitationsViewSet,
    OrganizationMembersManagementViewSet,
)

router = DefaultRouter()
router.register(
    "organization-invitations",
    OrganizationInvitationsViewSet,
    basename="organization-invitations",
)
router.register(
    "organization-members-management",
    OrganizationMembersManagementViewSet,
    basename="organization-members-management",
)

urlpatterns = router.urls
