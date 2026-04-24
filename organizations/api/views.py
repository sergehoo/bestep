from __future__ import annotations

from django.db.models import Q
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from best_epargne.apis.permissions import IsOrganizationAdmin
from serializers import OrganizationInvitationSerializer, CreateOrganizationInvitationSerializer

from organizations.models import OrganizationInvitation, OrganizationMembership

from __future__ import annotations

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from best_epargne.apis.permissions import IsOrganizationAdmin
from serializers import (
    CreateOrganizationMemberSerializer,
    OrganizationMemberSerializer,
)
from organizations.models import OrganizationMembership


class OrganizationMembersManagementViewSet(viewsets.GenericViewSet):
    """
    Gestion des membres par les admins d'organisation.
    """

    permission_classes = [IsAuthenticated, IsOrganizationAdmin]
    queryset = OrganizationMembership.objects.select_related("user", "organization", "invited_by")
    serializer_class = OrganizationMemberSerializer

    @action(detail=False, methods=["post"], url_path="create-member")
    def create_member(self, request):
        serializer = CreateOrganizationMemberSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        membership = serializer.save()
        output = OrganizationMemberSerializer(membership, context={"request": request})
        return Response(output.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"], url_path="create-instructor")
    def create_instructor(self, request):
        payload = request.data.copy()
        payload["role"] = OrganizationMembership.Role.INSTRUCTOR

        serializer = CreateOrganizationMemberSerializer(
            data=payload,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        membership = serializer.save()
        output = OrganizationMemberSerializer(membership, context={"request": request})
        return Response(output.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"], url_path="create-learner")
    def create_learner(self, request):
        payload = request.data.copy()
        payload["role"] = OrganizationMembership.Role.LEARNER

        serializer = CreateOrganizationMemberSerializer(
            data=payload,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        membership = serializer.save()
        output = OrganizationMemberSerializer(membership, context={"request": request})
        return Response(output.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"], url_path="create-admin")
    def create_admin(self, request):
        payload = request.data.copy()
        payload["role"] = OrganizationMembership.Role.ADMIN

        serializer = CreateOrganizationMemberSerializer(
            data=payload,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        membership = serializer.save()
        output = OrganizationMemberSerializer(membership, context={"request": request})
        return Response(output.data, status=status.HTTP_201_CREATED)


class OrganizationInvitationsViewSet(viewsets.ModelViewSet):
    """
    Invitations d'organisation.

    Permissions :
    - admin plateforme : tout voir
    - admin org : invitations de ses organisations
    """

    permission_classes = [IsAuthenticated, IsOrganizationAdmin]
    serializer_class = OrganizationInvitationSerializer

    def get_queryset(self):
        user = self.request.user

        if getattr(user, "is_platform_admin", False):
            return (
                OrganizationInvitation.objects.select_related("organization", "invited_by")
                .order_by("-created_at")
            )

        admin_org_ids = user.organization_memberships.filter(
            is_active=True,
            role__in=[
                OrganizationMembership.Role.OWNER,
                OrganizationMembership.Role.ADMIN,
            ],
        ).values_list("organization_id", flat=True)

        queryset = (
            OrganizationInvitation.objects.filter(organization_id__in=admin_org_ids)
            .select_related("organization", "invited_by")
            .order_by("-created_at")
        )

        organization_id = self.request.query_params.get("organization")
        if organization_id:
            queryset = queryset.filter(organization_id=organization_id)

        status_filter = self.request.query_params.get("status")
        if status_filter == "pending":
            queryset = queryset.filter(accepted_at__isnull=True)
        elif status_filter == "accepted":
            queryset = queryset.filter(accepted_at__isnull=False)
        elif status_filter == "expired":
            from django.utils import timezone
            queryset = queryset.filter(accepted_at__isnull=True, expires_at__lt=timezone.now())

        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(
                Q(email__icontains=search)
                | Q(organization__name__icontains=search)
                | Q(invited_by__email__icontains=search)
            )

        return queryset

    def get_serializer_class(self):
        if self.action == "create":
            return CreateOrganizationInvitationSerializer
        return OrganizationInvitationSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        invitation = serializer.save()
        output = OrganizationInvitationSerializer(invitation, context={"request": request})
        return Response(output.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def revoke(self, request, pk=None):
        invitation = self.get_object()
        invitation.delete()
        return Response({"detail": "Invitation revoked successfully."}, status=status.HTTP_200_OK)
