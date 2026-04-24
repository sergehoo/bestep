from rest_framework.routers import DefaultRouter

from views import (
    OrganizationInvitationsViewSet,
    OrganizationMembersManagementViewSet,
)

router = DefaultRouter()
router.register("organization-invitations", OrganizationInvitationsViewSet, basename="organization-invitations")
router.register("organization-members-management", OrganizationMembersManagementViewSet, basename="organization-members-management")

urlpatterns = router.urls