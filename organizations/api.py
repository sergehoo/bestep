from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.viewsets import ReadOnlyModelViewSet

from organizations.models import OrganizationMembership


class OrganizationMemberSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source="user.email", read_only=True)
    full_name = serializers.CharField(source="user.full_name", read_only=True)
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    role_display = serializers.CharField(source="get_role_display", read_only=True)

    class Meta:
        model = OrganizationMembership
        fields = [
            "id",
            "organization",
            "organization_name",
            "user",
            "email",
            "full_name",
            "role",
            "role_display",
            "is_active",
            "joined_at",
        ]


class OrganizationMembersViewSet(ReadOnlyModelViewSet):
    serializer_class = OrganizationMemberSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        organization_id = self.kwargs.get("organization_id")

        if not user.is_authenticated or not user.is_active:
            return OrganizationMembership.objects.none()

        qs = OrganizationMembership.objects.select_related(
            "user",
            "organization",
            "invited_by",
        )

        if getattr(user, "is_platform_admin", False):
            if organization_id:
                qs = qs.filter(organization_id=organization_id)
            return qs.filter(is_active=True).order_by("organization__name", "user__email")

        is_org_admin = user.organization_memberships.filter(
            organization_id=organization_id,
            is_active=True,
            role__in=[
                OrganizationMembership.Role.OWNER,
                OrganizationMembership.Role.ADMIN,
            ],
        ).exists()

        if not is_org_admin:
            return OrganizationMembership.objects.none()

        return qs.filter(
            organization_id=organization_id,
            is_active=True,
        ).order_by("user__email")