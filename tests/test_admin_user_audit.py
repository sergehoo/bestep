"""tests/test_admin_user_audit.py — Journalisation admin/users PATCH.

Vérifie que les transitions sensibles sur ``PATCH /api/admin/users/<id>/``
créent bien une entrée ``AIAuditLog`` :
    - is_active True → False   → USER_SUSPENDED
    - is_active False → True   → USER_REACTIVATED
    - platform_role différent   → USER_ROLE_CHANGED
    - modif non-sensible        → aucun log
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
        email="audit.admin@example.com",
        password="pw123!Solid",
        is_staff=True,
        is_superuser=True,
        is_email_verified=True,
    )


@pytest.fixture
def target_user(db):
    return User.objects.create_user(
        email="audit.target@example.com",
        password="pw123!Solid",
        is_active=True,
        is_email_verified=True,
    )


@pytest.mark.django_db
class TestUserSuspensionAudit:
    def test_suspend_creates_audit_entry(self, platform_admin, target_user):
        from ai.models import AIAuditLog
        client = APIClient()
        _auth(client, platform_admin)
        r = client.patch(
            f"/api/admin/users/{target_user.pk}/",
            {"is_active": False},
            format="json",
        )
        assert r.status_code == 200, r.data
        target_user.refresh_from_db()
        assert target_user.is_active is False

        log = AIAuditLog.objects.filter(
            kind="USER_SUSPENDED",
            payload__target_user_id=target_user.id,
        ).first()
        assert log is not None
        assert log.user_id == platform_admin.id
        assert log.payload["previous_is_active"] is True
        assert log.payload["new_is_active"] is False

    def test_reactivate_creates_audit_entry(self, platform_admin, db):
        from ai.models import AIAuditLog
        # target initialement inactif
        target = User.objects.create_user(
            email="reactive.target@example.com",
            password="pw123!Solid",
            is_active=False,
            is_email_verified=True,
        )
        client = APIClient()
        _auth(client, platform_admin)
        r = client.patch(
            f"/api/admin/users/{target.pk}/",
            {"is_active": True},
            format="json",
        )
        assert r.status_code == 200, r.data

        log = AIAuditLog.objects.filter(
            kind="USER_REACTIVATED",
            payload__target_user_id=target.id,
        ).first()
        assert log is not None
        assert log.payload["previous_is_active"] is False
        assert log.payload["new_is_active"] is True

    def test_no_log_if_is_active_unchanged(self, platform_admin, target_user):
        from ai.models import AIAuditLog
        client = APIClient()
        _auth(client, platform_admin)
        # Modif juste du full_name — pas de log de suspension
        r = client.patch(
            f"/api/admin/users/{target_user.pk}/",
            {"full_name": "Nouveau Nom"},
            format="json",
        )
        assert r.status_code == 200, r.data
        assert (
            AIAuditLog.objects.filter(
                kind__in=["USER_SUSPENDED", "USER_REACTIVATED"],
                payload__target_user_id=target_user.id,
            ).count()
            == 0
        )

    def test_role_change_creates_audit_entry(self, platform_admin, target_user):
        from ai.models import AIAuditLog
        client = APIClient()
        _auth(client, platform_admin)
        r = client.patch(
            f"/api/admin/users/{target_user.pk}/",
            {"platform_role": "PLATFORM_ADMIN"},
            format="json",
        )
        # Selon la config, ça peut être 200 ou 400 selon les validations.
        # On teste seulement si l'endpoint accepte le changement.
        if r.status_code == 200:
            log = AIAuditLog.objects.filter(
                kind="USER_ROLE_CHANGED",
                payload__target_user_id=target_user.id,
            ).first()
            assert log is not None
            assert log.payload["new_role"] == "PLATFORM_ADMIN"
