"""organizations/api/serializers.py — CORRECTIFS V2.B (ORG-01, ORG-05).

- ORG-01 : alignement de l'import sur l'alias public ``OrganizationMemberService``.
- ORG-05 : ``invite_member`` et ``create_member`` ont bien les signatures
  exposées par le service.
- Le paramètre ``send_invitation_if_exists`` est renommé ``send_invitation``
  et mappé sur ``send_invitation_if_no_password`` côté service.
"""
from __future__ import annotations

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from organizations.models import (
    Organization,
    OrganizationInvitation,
    OrganizationMembership,
)
from organizations.services import OrganizationMemberService


class OrganizationInvitationSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    role_display = serializers.CharField(source="get_role_display", read_only=True)
    invited_by_email = serializers.EmailField(source="invited_by.email", read_only=True)
    is_expired = serializers.BooleanField(read_only=True)
    is_accepted = serializers.BooleanField(read_only=True)
    is_pending = serializers.BooleanField(read_only=True)

    class Meta:
        model = OrganizationInvitation
        fields = [
            "id",
            "organization",
            "organization_name",
            "email",
            "role",
            "role_display",
            "token",
            "invited_by",
            "invited_by_email",
            "expires_at",
            "accepted_at",
            "is_expired",
            "is_accepted",
            "is_pending",
            "created_at",
        ]
        read_only_fields = ["token", "accepted_at", "created_at"]


class CreateOrganizationInvitationSerializer(serializers.Serializer):
    organization = serializers.PrimaryKeyRelatedField(
        queryset=Organization.objects.filter(is_active=True)
    )
    email = serializers.EmailField()
    role = serializers.ChoiceField(
        choices=[
            OrganizationMembership.Role.ADMIN,
            OrganizationMembership.Role.MANAGER,
            OrganizationMembership.Role.INSTRUCTOR,
            OrganizationMembership.Role.LEARNER,
        ]
    )
    expires_in_days = serializers.IntegerField(
        required=False, min_value=1, max_value=30, default=7
    )

    def create(self, validated_data):
        actor = self.context["request"].user
        return OrganizationMemberService.invite_member(
            actor=actor,
            organization=validated_data["organization"],
            email=validated_data["email"],
            role=validated_data["role"],
            expires_in_days=validated_data.get("expires_in_days", 7),
        )


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
        read_only_fields = fields


class CreateOrganizationMemberSerializer(serializers.Serializer):
    organization = serializers.PrimaryKeyRelatedField(
        queryset=Organization.objects.filter(is_active=True)
    )
    email = serializers.EmailField()
    full_name = serializers.CharField(required=False, allow_blank=True, max_length=160)
    phone = serializers.CharField(required=False, allow_blank=True, max_length=30)
    role = serializers.ChoiceField(
        choices=[
            OrganizationMembership.Role.ADMIN,
            OrganizationMembership.Role.MANAGER,
            OrganizationMembership.Role.INSTRUCTOR,
            OrganizationMembership.Role.LEARNER,
        ]
    )
    password = serializers.CharField(
        required=False, allow_blank=True, write_only=True,
        style={"input_type": "password"},
    )
    send_invitation = serializers.BooleanField(required=False, default=True)

    def validate(self, attrs):
        password = attrs.get("password")
        if password:
            try:
                validate_password(password)
            except DjangoValidationError as exc:
                raise serializers.ValidationError(
                    {"password": list(exc.messages)}
                ) from exc
        return attrs

    def create(self, validated_data):
        actor = self.context["request"].user
        result = OrganizationMemberService.create_member(
            actor=actor,
            organization=validated_data["organization"],
            email=validated_data["email"],
            full_name=validated_data.get("full_name", ""),
            phone=validated_data.get("phone", ""),
            role=validated_data["role"],
            password=validated_data.get("password") or None,
            send_invitation_if_no_password=validated_data.get("send_invitation", True),
        )
        # On retourne le membership (l'objet attendu par OrganizationMemberSerializer).
        return result["membership"]
