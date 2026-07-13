"""tests/test_permissions_email_verified.py — SECURITE-05 vérif e-mail.

Vérifie que ``BaseActivePermission`` (et par transitivité ``IsInstructor``,
``IsLearner``, ``IsPlatformAdmin``) refuse un user dont l'e-mail n'est pas
vérifié — sauf pour les admins plateforme.

Ces tests utilisent ``RequestFactory`` + les permissions DRF directement
sans passer par une URL (pour ne pas dépendre du câblage global).
"""
from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.test import RequestFactory
from rest_framework.views import APIView

from best_epargne.apis.permissions import (
    IsInstructor,
    IsLearner,
    IsPlatformAdmin,
    IsAuthenticatedAndActive,
)


User = get_user_model()


def _req(rf, user):
    req = rf.get("/")
    req.user = user
    return req


@pytest.mark.django_db
class TestBaseActivePermissionEmailVerified:
    def test_unverified_user_blocked_on_isinstructor(self, rf):
        """Un formateur non vérifié doit être refusé."""
        u = User.objects.create_user(
            email="teacher.unverified@example.com",
            password="pw",
            is_email_verified=False,
        )
        from compte.models import InstructorProfile
        InstructorProfile.objects.create(user=u, is_verified=False, payout_percent=70)
        assert IsInstructor().has_permission(_req(rf, u), APIView()) is False

    def test_verified_user_allowed_on_isinstructor(self, rf):
        u = User.objects.create_user(
            email="teacher.verified@example.com",
            password="pw",
            is_email_verified=True,
        )
        from compte.models import InstructorProfile
        InstructorProfile.objects.create(user=u, is_verified=False, payout_percent=70)
        assert IsInstructor().has_permission(_req(rf, u), APIView()) is True

    def test_unverified_user_blocked_on_islearner(self, rf):
        u = User.objects.create_user(
            email="learner.unverified@example.com",
            password="pw",
            is_email_verified=False,
        )
        from compte.models import LearnerProfile
        LearnerProfile.objects.create(user=u)
        assert IsLearner().has_permission(_req(rf, u), APIView()) is False

    def test_verified_learner_allowed(self, rf):
        u = User.objects.create_user(
            email="learner.verified@example.com",
            password="pw",
            is_email_verified=True,
        )
        from compte.models import LearnerProfile
        LearnerProfile.objects.create(user=u)
        assert IsLearner().has_permission(_req(rf, u), APIView()) is True

    def test_platform_admin_bypass_email_verified(self, rf):
        """Un admin plateforme passe même si son e-mail n'est pas vérifié."""
        u = User.objects.create_user(
            email="admin.unverified@example.com",
            password="pw",
            is_superuser=True,
            is_staff=True,
            is_email_verified=False,
        )
        assert IsPlatformAdmin().has_permission(_req(rf, u), APIView()) is True

    def test_inactive_user_always_blocked(self, rf):
        """SECURITE-04 — is_active=False → refus systématique."""
        u = User.objects.create_user(
            email="inactive@example.com",
            password="pw",
            is_active=False,
            is_email_verified=True,
        )
        assert IsAuthenticatedAndActive().has_permission(_req(rf, u), APIView()) is False
        assert IsInstructor().has_permission(_req(rf, u), APIView()) is False

    def test_anonymous_always_blocked(self, rf):
        from django.contrib.auth.models import AnonymousUser
        req = _req(rf, AnonymousUser())
        assert IsAuthenticatedAndActive().has_permission(req, APIView()) is False
        assert IsInstructor().has_permission(req, APIView()) is False
        assert IsLearner().has_permission(req, APIView()) is False


@pytest.mark.django_db
class TestAssistantGate:
    """Vérifie ``ai.permissions.user_can_use_assistant`` SECURITE-05."""

    def test_unverified_user_denied(self):
        from ai.permissions import user_can_use_assistant
        u = User.objects.create_user(
            email="ai.unverified@example.com",
            password="pw",
            is_email_verified=False,
        )
        assert user_can_use_assistant(u) is False

    def test_verified_user_allowed(self):
        from ai.permissions import user_can_use_assistant
        u = User.objects.create_user(
            email="ai.verified@example.com",
            password="pw",
            is_email_verified=True,
        )
        assert user_can_use_assistant(u) is True

    def test_platform_admin_bypasses_email_check(self):
        from ai.permissions import user_can_use_assistant
        u = User.objects.create_user(
            email="ai.admin@example.com",
            password="pw",
            is_superuser=True,
            is_staff=True,
            is_email_verified=False,
        )
        assert user_can_use_assistant(u) is True

    def test_inactive_user_denied_even_if_verified(self):
        from ai.permissions import user_can_use_assistant
        u = User.objects.create_user(
            email="ai.inactive@example.com",
            password="pw",
            is_active=False,
            is_email_verified=True,
        )
        assert user_can_use_assistant(u) is False
