"""tests/test_verify_email_endpoints.py — Endpoints de vérification e-mail.

Couverture SECURITE-05 :

    POST /api/auth/verify-email/          → uid+token, marque le user
    POST /api/auth/verify-email/resend/   → renvoie un nouveau token

Cas testés :
    - token valide → 200, user is_email_verified=True
    - token invalide → 400 + code=EMAIL_TOKEN_INVALID
    - token expiré → 400
    - user déjà vérifié → 200 (idempotent)
    - resend anonyme → 401
    - resend user vérifié → 400 + code=EMAIL_ALREADY_VERIFIED
    - resend cooldown → 429 + code=EMAIL_RESEND_COOLDOWN
"""
from __future__ import annotations

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

User = get_user_model()

VERIFY_URL = "/api/auth/verify-email/"
RESEND_URL = "/api/auth/verify-email/resend/"


@pytest.fixture
def unverified_user(db):
    from compte.email_verification import issue_token
    u = User.objects.create_user(
        email="unverified@example.com",
        password="pw123!Solid",
        is_email_verified=False,
    )
    token = issue_token(u)
    u.refresh_from_db()
    return u, token


@pytest.mark.django_db
class TestVerifyEmailEndpoint:
    def test_valid_token_marks_user_verified(self, unverified_user):
        user, token = unverified_user
        client = APIClient()
        r = client.post(
            VERIFY_URL,
            {"uid": user.pk, "token": token},
            format="json",
        )
        assert r.status_code == 200, r.data
        user.refresh_from_db()
        assert user.is_email_verified is True
        assert user.email_verified_at is not None
        # Token consommé
        assert user.email_verification_token == ""

    def test_invalid_token_returns_400_with_code(self, unverified_user):
        user, _ = unverified_user
        client = APIClient()
        r = client.post(
            VERIFY_URL,
            {"uid": user.pk, "token": "not-the-real-token"},
            format="json",
        )
        assert r.status_code == 400
        assert r.data.get("code") == "EMAIL_TOKEN_INVALID"
        user.refresh_from_db()
        assert user.is_email_verified is False

    def test_expired_token_rejected(self, unverified_user):
        user, token = unverified_user
        # Fabrique un envoi datant d'il y a 72h (> TTL 48h par défaut)
        user.email_verification_sent_at = timezone.now() - timedelta(hours=72)
        user.save(update_fields=["email_verification_sent_at"])
        client = APIClient()
        r = client.post(
            VERIFY_URL,
            {"uid": user.pk, "token": token},
            format="json",
        )
        assert r.status_code == 400
        user.refresh_from_db()
        assert user.is_email_verified is False

    def test_unknown_uid_returns_400(self):
        client = APIClient()
        r = client.post(
            VERIFY_URL,
            {"uid": 99_999_999, "token": "abc"},
            format="json",
        )
        assert r.status_code == 400
        assert r.data.get("code") == "EMAIL_TOKEN_INVALID"

    def test_already_verified_returns_200_idempotent(self):
        u = User.objects.create_user(
            email="already@example.com",
            password="pw123!Solid",
            is_email_verified=True,
        )
        client = APIClient()
        r = client.post(
            VERIFY_URL,
            {"uid": u.pk, "token": "whatever"},
            format="json",
        )
        # Contrat : ne pas casser l'expérience si le user clique 2x le lien
        assert r.status_code == 200


@pytest.mark.django_db
class TestResendEmailEndpoint:
    def _auth(self, client, user):
        from rest_framework_simplejwt.tokens import RefreshToken
        token = RefreshToken.for_user(user)
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")

    def test_anonymous_forbidden(self):
        client = APIClient()
        r = client.post(RESEND_URL)
        # 401 (via SessionAuthentication) ou 403 (JWT sans header) — les deux
        # sont acceptables pour "non authentifié".
        assert r.status_code in (401, 403), r.data

    def test_already_verified_returns_400(self):
        u = User.objects.create_user(
            email="already2@example.com",
            password="pw123!Solid",
            is_email_verified=True,
        )
        client = APIClient()
        self._auth(client, u)
        r = client.post(RESEND_URL)
        assert r.status_code == 400
        assert r.data.get("code") == "EMAIL_ALREADY_VERIFIED"

    def test_cooldown_returns_429(self):
        from compte.email_verification import issue_token
        u = User.objects.create_user(
            email="cooldown@example.com",
            password="pw123!Solid",
            is_email_verified=False,
        )
        issue_token(u)  # premier envoi maintenant
        client = APIClient()
        self._auth(client, u)
        # Second appel immédiat → cooldown
        r = client.post(RESEND_URL)
        assert r.status_code == 429
        assert r.data.get("code") == "EMAIL_RESEND_COOLDOWN"
        assert isinstance(r.data.get("retry_after_seconds"), int)

    def test_resend_after_cooldown_ok(self):
        from compte.email_verification import issue_token
        u = User.objects.create_user(
            email="resend.ok@example.com",
            password="pw123!Solid",
            is_email_verified=False,
        )
        issue_token(u)
        # Force le passage du cooldown
        u.email_verification_sent_at = timezone.now() - timedelta(minutes=5)
        u.save(update_fields=["email_verification_sent_at"])
        client = APIClient()
        self._auth(client, u)
        r = client.post(RESEND_URL)
        assert r.status_code == 200
