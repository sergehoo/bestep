from django.shortcuts import get_object_or_404

from organizations.models import Organization, OrganizationMembership


def get_user_admin_organizations(user):
    if getattr(user, "is_platform_admin", False):
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