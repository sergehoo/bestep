"""tests/test_admin_audit_security.py — SECURITE-06 audit unifié.

Endpoint : GET /api/admin/audit/security/

Cas testés :
    - non-admin refusé
    - liste vide → aggregated par kind à 0
    - filtre par kind
    - filtre par admin_id
    - fenêtre days
    - agrégations correctes
"""
from __future__ import annotations

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

User = get_user_model()

URL = "/api/admin/audit/security/"


def _auth(client, user):
    token = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")


@pytest.fixture
def platform_admin(db):
    return User.objects.create_user(
        email="audit.security.admin@example.com",
        password="pw123!Solid",
        is_staff=True,
        is_superuser=True,
        is_email_verified=True,
    )


@pytest.fixture
def other_admin(db):
    return User.objects.create_user(
        email="audit.other.admin@example.com",
        password="pw123!Solid",
        is_staff=True,
        is_superuser=True,
        is_email_verified=True,
    )


@pytest.fixture
def sample_events(platform_admin, other_admin, db):
    """Crée 4 events de kinds différents pour tester les filtres."""
    from ai.models import AIAuditLog
    entries = []
    entries.append(AIAuditLog.objects.create(
        user=platform_admin,
        kind="INSTRUCTOR_APPROVED",
        payload={"target_user_id": 1, "target_email": "a@x.io"},
    ))
    entries.append(AIAuditLog.objects.create(
        user=platform_admin,
        kind="USER_SUSPENDED",
        payload={"target_user_id": 2, "target_email": "b@x.io"},
    ))
    entries.append(AIAuditLog.objects.create(
        user=other_admin,
        kind="USER_ROLE_CHANGED",
        payload={
            "target_user_id": 3,
            "target_email": "c@x.io",
            "new_role": "PLATFORM_ADMIN",
        },
    ))
    # Un log hors périmètre — doit être ignoré
    AIAuditLog.objects.create(
        user=platform_admin,
        kind=AIAuditLog.Kind.KB_SEARCH,
        payload={"q": "x"},
    )
    return entries


@pytest.mark.django_db
class TestSecurityAuditEndpoint:
    def test_non_admin_forbidden(self, db):
        u = User.objects.create_user(
            email="regular@example.com",
            password="pw123!Solid",
            is_email_verified=True,
        )
        client = APIClient()
        _auth(client, u)
        r = client.get(URL)
        assert r.status_code == 403
        assert r.data.get("code") == "ROLE_FORBIDDEN"

    def test_empty_when_no_events(self, platform_admin):
        client = APIClient()
        _auth(client, platform_admin)
        r = client.get(URL)
        assert r.status_code == 200
        assert r.data["count"] == 0
        # Le bloc aggregated doit toujours être présent
        assert "aggregated" in r.data
        assert r.data["aggregated"]["total"] == 0

    def test_lists_all_security_kinds_only(
        self, platform_admin, sample_events
    ):
        client = APIClient()
        _auth(client, platform_admin)
        r = client.get(URL)
        assert r.status_code == 200
        assert r.data["count"] == 3  # KB_SEARCH exclu
        kinds = {e["kind"] for e in r.data["results"]}
        assert kinds == {
            "INSTRUCTOR_APPROVED",
            "USER_SUSPENDED",
            "USER_ROLE_CHANGED",
        }

    def test_filter_by_kind(self, platform_admin, sample_events):
        client = APIClient()
        _auth(client, platform_admin)
        r = client.get(URL + "?kind=USER_SUSPENDED")
        assert r.status_code == 200
        assert r.data["count"] == 1
        assert r.data["results"][0]["kind"] == "USER_SUSPENDED"

    def test_filter_by_admin_id(
        self, platform_admin, other_admin, sample_events
    ):
        client = APIClient()
        _auth(client, platform_admin)
        r = client.get(URL + f"?admin_id={other_admin.id}")
        assert r.status_code == 200
        # Seul l'event de other_admin (USER_ROLE_CHANGED) devrait remonter
        assert r.data["count"] == 1
        assert r.data["results"][0]["kind"] == "USER_ROLE_CHANGED"

    def test_days_window_filters_old_events(
        self, platform_admin, db
    ):
        from ai.models import AIAuditLog
        old = AIAuditLog.objects.create(
            user=platform_admin,
            kind="INSTRUCTOR_APPROVED",
            payload={"target_user_id": 99, "target_email": "old@x.io"},
        )
        # Force la date d'ancienneté (contourne default=now via update)
        AIAuditLog.objects.filter(pk=old.pk).update(
            created_at=timezone.now() - timedelta(days=400),
        )
        # Un event récent
        AIAuditLog.objects.create(
            user=platform_admin,
            kind="INSTRUCTOR_APPROVED",
            payload={"target_user_id": 100, "target_email": "new@x.io"},
        )
        client = APIClient()
        _auth(client, platform_admin)
        # Par défaut 90 jours → seul le récent est renvoyé
        r = client.get(URL)
        assert r.data["count"] == 1
        # Avec days=365, l'ancien est toujours hors fenêtre (400 > 365)
        r2 = client.get(URL + "?days=365")
        assert r2.data["count"] == 1

    def test_aggregated_counts_per_kind(
        self, platform_admin, sample_events
    ):
        client = APIClient()
        _auth(client, platform_admin)
        r = client.get(URL)
        agg = r.data["aggregated"]
        assert agg["total"] == 3
        assert agg["by_kind"]["INSTRUCTOR_APPROVED"] == 1
        assert agg["by_kind"]["USER_SUSPENDED"] == 1
        assert agg["by_kind"]["USER_ROLE_CHANGED"] == 1
        # Les kinds non représentés doivent apparaître à 0
        assert agg["by_kind"]["EMAIL_FORCE_VERIFIED"] == 0
