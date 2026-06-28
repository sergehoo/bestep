"""Tests V2.B — Workflow invitation organisation."""
from __future__ import annotations

import pytest


@pytest.mark.django_db
def test_invite_member_creates_invitation(alice):
    """invite_member crée une invitation pending."""
    from organizations.models import Organization, OrganizationMembership
    from organizations.services import OrganizationMemberManagementService

    org = Organization.objects.create(name="Acme", slug="acme")
    OrganizationMembership.objects.create(
        user=alice, organization=org,
        role=OrganizationMembership.Role.OWNER, is_active=True,
    )

    invitation = OrganizationMemberManagementService.invite_member(
        actor=alice,
        organization=org,
        email="newbie@example.com",
        role=OrganizationMembership.Role.LEARNER,
        send_email=False,
    )
    assert invitation.email == "newbie@example.com"
    assert invitation.role == OrganizationMembership.Role.LEARNER
    assert invitation.token is not None
    assert invitation.accepted_at is None


@pytest.mark.django_db
def test_accept_invitation_idor(alice, bob):
    """Un user ne peut accepter une invitation adressée à un autre email."""
    from datetime import timedelta

    from django.core.exceptions import PermissionDenied
    from django.utils import timezone

    from organizations.models import Organization, OrganizationInvitation, OrganizationMembership
    from organizations.services import OrganizationMemberManagementService

    org = Organization.objects.create(name="Acme2", slug="acme-2")
    OrganizationMembership.objects.create(
        user=alice, organization=org,
        role=OrganizationMembership.Role.OWNER, is_active=True,
    )
    inv = OrganizationInvitation.objects.create(
        organization=org,
        email="alice@example.com",
        role=OrganizationMembership.Role.LEARNER,
        invited_by=alice,
        expires_at=timezone.now() + timedelta(days=7),
    )
    # bob tente d'accepter une invitation pour alice → PermissionDenied.
    with pytest.raises(PermissionDenied):
        OrganizationMemberManagementService.accept_invitation(user=bob, token=str(inv.token))


@pytest.mark.django_db
def test_accept_invitation_creates_membership(alice):
    """L'utilisateur cible peut accepter et le membership est créé."""
    from datetime import timedelta

    from django.utils import timezone

    from organizations.models import Organization, OrganizationInvitation, OrganizationMembership
    from organizations.services import OrganizationMemberManagementService

    org = Organization.objects.create(name="Acme3", slug="acme-3")
    # Pas de membership owner pour Alice → on prend un autre user comme inviter.
    from django.contrib.auth import get_user_model
    inviter = get_user_model().objects.create_user(email="boss@example.com", password="StrongPa$$w0rd!")
    OrganizationMembership.objects.create(
        user=inviter, organization=org,
        role=OrganizationMembership.Role.OWNER, is_active=True,
    )
    inv = OrganizationInvitation.objects.create(
        organization=org,
        email="alice@example.com",
        role=OrganizationMembership.Role.LEARNER,
        invited_by=inviter,
        expires_at=timezone.now() + timedelta(days=7),
    )
    membership = OrganizationMemberManagementService.accept_invitation(user=alice, token=str(inv.token))
    assert membership.user_id == alice.id
    assert membership.organization_id == org.id
    assert membership.role == OrganizationMembership.Role.LEARNER
    assert membership.is_active is True

    inv.refresh_from_db()
    assert inv.accepted_at is not None
