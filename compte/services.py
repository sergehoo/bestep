from django.contrib.auth.models import User
from django.core.exceptions import PermissionDenied
from django.db import transaction

from compte.models import InstructorProfile, LearnerProfile
from organizations.models import OrganizationMembership


class AccessService:
    @staticmethod
    def can_access_platform_admin(user) -> bool:
        return user.is_authenticated and user.is_platform_admin

    @staticmethod
    def can_access_business_dashboard(user) -> bool:
        return user.is_authenticated and user.is_org_admin

    @staticmethod
    def can_access_instructor_dashboard(user) -> bool:
        return user.is_authenticated and (user.is_instructor or user.is_org_instructor)

    @staticmethod
    def can_access_learner_dashboard(user) -> bool:
        return user.is_authenticated and (user.is_learner or user.is_org_learner)

    @staticmethod
    def can_manage_organization_users(user, organization) -> bool:
        return user.is_authenticated and user.organization_memberships.filter(
            organization=organization,
            role__in=[
                OrganizationMembership.Role.OWNER,
                OrganizationMembership.Role.ADMIN,
            ],
            is_active=True,
        ).exists()

    @staticmethod
    def can_create_org_instructor(user, organization) -> bool:
        return AccessService.can_manage_organization_users(user, organization)

    @staticmethod
    def can_create_org_learner(user, organization) -> bool:
        return AccessService.can_manage_organization_users(user, organization)



