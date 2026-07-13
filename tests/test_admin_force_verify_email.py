"""tests/test_admin_force_verify_email.py — SECURITE-05 support technique.

Endpoint : POST /api/admin/users/<id>/verify-email/

Cas testés :
    - non-admin refusé
    - user inconnu → 404
    - user déjà vérifié → 200 + code=EMAIL_ALREADY_VERIFIED (idempotent)
    - marquage réussi → 200 + is_email_verified=True + timestamp
"""
from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

User = get_user_model()


def _auth(client, user):
    token = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")


@pytest.fixture
def platform_admin(db):
    return User.objects.create_user(
        email="pa@example.com",
        password="pw123!Solid",
        is_staff=True,
        is_superuser=True,
        is_email_verified=True,
    )


@pytest.fixture
def unverified_target(db):
    return User.objects.create_user(
        email="target@example.com",
        password="pw123!Solid",
        is_email_verified=False,
    )


@pytest.mark.django_db
class TestForceVerifyEmail:
    def test_non_admin_forbidden(self, unverified_target):
        client = APIClient()
        _auth(client, unverified_target)
        r = client.post(f"/api/admin/users/{unverified_target.pk}/verify-email/")
        assert r.status_code in (403, 302), r.data

    def test_unknown_user_returns_404(self, platform_admin):
        client = APIClient()
        _auth(client, platform_admin)
        r = client.post("/api/admin/users/99999999/verify-email/")
        assert r.status_code == 404
        assert r.data.get("code") == "NOT_FOUND"

    def test_already_verified_idempotent(self, platform_admin, db):
        already = User.objects.create_user(
            email="already3@example.com",
            password="pw123!Solid",
            is_email_verified=True,
        )
        client = APIClient()
        _auth(client, platform_admin)
        r = client.post(f"/api/admin/users/{already.pk}/verify-email/")
        assert r.status_code == 200
        assert r.data.get("code") == "EMAIL_ALREADY_VERIFIED"

    def test_marks_verified_and_returns_timestamp(
        self, platform_admin, unverified_target
    ):
        client = APIClient()
        _auth(client, platform_admin)
        r = client.post(f"/api/admin/users/{unverified_target.pk}/verify-email/")
        assert r.status_code == 200, r.data
        assert "email_verified_at" in r.data
        unverified_target.refresh_from_db()
        assert unverified_target.is_email_verified is True
        assert unverified_target.email_verified_at is not None
        assert unverified_target.email_verification_token == ""
