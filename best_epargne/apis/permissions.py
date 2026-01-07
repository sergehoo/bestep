from rest_framework.permissions import BasePermission
from apps.accounts.models import User
from apps.organizations.models import CompanyMember

class IsInstructor(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in {User.Role.INSTRUCTOR, User.Role.SUPERADMIN}

class IsCompanyAdmin(BasePermission):
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if request.user.role == User.Role.SUPERADMIN:
            return True
        return CompanyMember.objects.filter(user=request.user, company_role=CompanyMember.CompanyRole.ADMIN).exists()

class IsSuperAdmin(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == User.Role.SUPERADMIN