from rest_framework import serializers
from rest_framework.viewsets import ReadOnlyModelViewSet
from rest_framework.permissions import IsAuthenticated
from organizations.models import CompanyMember


# from compte.api.permissions import IsCompanyAdmin

class CompanyMemberSerializer(serializers.ModelSerializer):
    email = serializers.CharField(source="user.email", read_only=True)
    full_name = serializers.CharField(source="user.full_name", read_only=True)

    class Meta:
        model = CompanyMember
        fields = ["id", "company", "user", "email", "full_name", "company_role", "joined_at"]


class CompanyMembersViewSet(ReadOnlyModelViewSet):
    serializer_class = CompanyMemberSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # admin entreprise -> ne voit que ses employés
        membership = CompanyMember.objects.filter(user=self.request.user,
                                                  company_role=CompanyMember.CompanyRole.ADMIN).select_related(
            "company").first()
        if not membership:
            return CompanyMember.objects.none()
        return CompanyMember.objects.filter(company=membership.company).select_related("user").order_by("user__email")
