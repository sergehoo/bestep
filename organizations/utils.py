from django.shortcuts import get_object_or_404

from core.permissions import is_platform_admin
from organizations.models import Organization, OrganizationMembership


def get_user_admin_organizations(user):
    if is_platform_admin(user):
        return Organization.objects.filter(is_active=True)

    return Organization.objects.filter(
        is_active=True,
        memberships__user=user,
        memberships__is_active=True,
        memberships__role__in=[
            OrganizationMembership.Role.OWNER,
            OrganizationMembership.Role.ADMIN,
        ],
    ).distinct()


def get_current_organization_for_user(user, organization_id=None):
    qs = get_user_admin_organizations(user)

    if organization_id:
        return get_object_or_404(qs, pk=organization_id)

    return qs.order_by("name").first()
