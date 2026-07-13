"""tests/test_admin_audit_security_export.py — SECURITE-06 export CSV.

Endpoint : GET /api/admin/audit/security/export/

Cas testés :
    - non-admin refusé
    - Content-Type text/csv + Content-Disposition attachment
    - Header CSV cohérent (12 colonnes)
    - Chaque event est présent sur une ligne
    - Filtre kind respecté
"""
from __future__ import annotations

import csv
from io import StringIO

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

User = get_user_model()

URL = "/api/admin/audit/security/export/"


def _auth(client, user):
    token = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")


@pytest.fixture
def platform_admin(db):
    return User.objects.create_user(
        email="csv.admin@example.com",
        password="pw123!Solid",
        is_staff=True,
        is_superuser=True,
        is_email_verified=True,
    )


@pytest.fixture
def events(platform_admin, db):
    from ai.models import AIAuditLog
    AIAuditLog.objects.create(
        user=platform_admin,
        kind="INSTRUCTOR_APPROVED",
        payload={"target_user_id": 11, "target_email": "a@x.io"},
    )
    AIAuditLog.objects.create(
        user=platform_admin,
        kind="USER_SUSPENDED",
        payload={
            "target_user_id": 12,
            "target_email": "b@x.io",
            "previous_is_active": True,
            "new_is_active": False,
        },
    )
    AIAuditLog.objects.create(
        user=platform_admin,
        kind="INSTRUCTOR_REJECTED",
        payload={
            "target_user_id": 13,
            "target_email": "c@x.io",
            "reason": "Contenu manquant",
        },
    )
    # Un event hors périmètre (KB_SEARCH) doit être ignoré
    AIAuditLog.objects.create(
        user=platform_admin,
        kind=AIAuditLog.Kind.KB_SEARCH,
        payload={"q": "test"},
    )


@pytest.mark.django_db
class TestSecurityAuditCSVExport:
    def test_non_admin_forbidden(self, db):
        u = User.objects.create_user(
            email="regular.csv@example.com",
            password="pw123!Solid",
            is_email_verified=True,
        )
        client = APIClient()
        _auth(client, u)
        r = client.get(URL)
        assert r.status_code == 403

    def test_headers_and_content_type(self, platform_admin, events):
        client = APIClient()
        _auth(client, platform_admin)
        r = client.get(URL)
        assert r.status_code == 200
        assert r["Content-Type"].startswith("text/csv")
        cd = r["Content-Disposition"]
        assert "attachment" in cd
        assert "audit-security-" in cd
        assert cd.endswith('.csv"')

    def test_csv_has_expected_header(self, platform_admin, events):
        client = APIClient()
        _auth(client, platform_admin)
        r = client.get(URL)
        content = r.content.decode("utf-8")
        reader = csv.reader(StringIO(content))
        header = next(reader)
        assert header == [
            "id",
            "date_iso",
            "kind",
            "admin_id",
            "admin_email",
            "target_user_id",
            "target_email",
            "previous_role",
            "new_role",
            "previous_is_active",
            "new_is_active",
            "reason",
        ]

    def test_all_security_events_present(self, platform_admin, events):
        client = APIClient()
        _auth(client, platform_admin)
        r = client.get(URL)
        content = r.content.decode("utf-8")
        reader = csv.DictReader(StringIO(content))
        rows = list(reader)
        # 3 events "sécurité", pas le KB_SEARCH
        assert len(rows) == 3
        kinds = {row["kind"] for row in rows}
        assert kinds == {
            "INSTRUCTOR_APPROVED",
            "USER_SUSPENDED",
            "INSTRUCTOR_REJECTED",
        }
        # La raison doit être stockée telle quelle
        rejected = [r for r in rows if r["kind"] == "INSTRUCTOR_REJECTED"][0]
        assert rejected["reason"] == "Contenu manquant"
        assert rejected["target_email"] == "c@x.io"

    def test_filter_by_kind(self, platform_admin, events):
        client = APIClient()
        _auth(client, platform_admin)
        r = client.get(URL + "?kind=USER_SUSPENDED")
        content = r.content.decode("utf-8")
        rows = list(csv.DictReader(StringIO(content)))
        assert len(rows) == 1
        assert rows[0]["kind"] == "USER_SUSPENDED"
        assert rows[0]["previous_is_active"] == "True"
        assert rows[0]["new_is_active"] == "False"
