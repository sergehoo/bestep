"""tests/test_admin_instructor_approval.py — SECURITE-06 approbation formateur.

Couverture des endpoints :

    POST /api/admin/instructors/<id>/approve/
    POST /api/admin/instructors/<id>/reject/

Cas testés :
    - non-admin refusé → 403 + code=ROLE_FORBIDDEN
    - target inexistant → 404
    - target pas formateur → 400 + code=NOT_INSTRUCTOR
    - approbation ok → 200 + InstructorProfile.is_verified=True
    - approbation d'un déjà approuvé → 200 idempotent + code=ALREADY_APPROVED
    - rejet + raison stockée
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
        email="platform.admin@example.com",
        password="pw123!Solid",
        is_staff=True,
        is_superuser=True,
        is_email_verified=True,
    )


@pytest.fixture
def instructor_pending(db):
    from compte.models import InstructorProfile
    u = User.objects.create_user(
        email="pending.teacher@example.com",
        password="pw123!Solid",
        is_email_verified=True,
    )
    InstructorProfile.objects.create(user=u, is_verified=False, payout_percent=70)
    return u


@pytest.mark.django_db
class TestApproveEndpoint:
    def test_non_admin_rejected(self, instructor_pending):
        client = APIClient()
        _auth(client, instructor_pending)  # user standard
        r = client.post(f"/api/admin/instructors/{instructor_pending.pk}/approve/")
        assert r.status_code == 403
        assert r.data.get("code") == "ROLE_FORBIDDEN"

    def test_unknown_user_returns_404(self, platform_admin):
        client = APIClient()
        _auth(client, platform_admin)
        r = client.post("/api/admin/instructors/99999999/approve/")
        assert r.status_code == 404
        assert r.data.get("code") == "NOT_FOUND"

    def test_non_instructor_target_returns_400(self, platform_admin, db):
        target = User.objects.create_user(
            email="not.instructor@example.com",
            password="pw123!Solid",
            is_email_verified=True,
        )
        client = APIClient()
        _auth(client, platform_admin)
        r = client.post(f"/api/admin/instructors/{target.pk}/approve/")
        assert r.status_code == 400
        assert r.data.get("code") == "NOT_INSTRUCTOR"

    def test_approve_marks_verified(self, platform_admin, instructor_pending):
        client = APIClient()
        _auth(client, platform_admin)
        r = client.post(f"/api/admin/instructors/{instructor_pending.pk}/approve/")
        assert r.status_code == 200, r.data
        instructor_pending.instructor_profile.refresh_from_db()
        assert instructor_pending.instructor_profile.is_verified is True

    def test_double_approve_is_idempotent(self, platform_admin, instructor_pending):
        instructor_pending.instructor_profile.is_verified = True
        instructor_pending.instructor_profile.save(update_fields=["is_verified"])
        client = APIClient()
        _auth(client, platform_admin)
        r = client.post(f"/api/admin/instructors/{instructor_pending.pk}/approve/")
        assert r.status_code == 200
        assert r.data.get("code") == "ALREADY_APPROVED"


@pytest.mark.django_db
class TestHistoryEndpoint:
    URL = "/api/admin/instructors/history/"

    def test_non_admin_forbidden(self, instructor_pending):
        client = APIClient()
        _auth(client, instructor_pending)
        r = client.get(self.URL)
        assert r.status_code == 403
        assert r.data.get("code") == "ROLE_FORBIDDEN"

    def test_empty_when_no_events(self, platform_admin):
        client = APIClient()
        _auth(client, platform_admin)
        r = client.get(self.URL)
        assert r.status_code == 200
        assert r.data == {"events": [], "total": 0}

    def test_returns_recent_events_reverse_chronological(
        self, platform_admin, instructor_pending
    ):
        # Génère un event via l'endpoint approve
        client = APIClient()
        _auth(client, platform_admin)
        r = client.post(f"/api/admin/instructors/{instructor_pending.pk}/approve/")
        assert r.status_code == 200, r.data

        # Puis un rejet manuel via l'endpoint reject (rétrograde)
        r2 = client.post(
            f"/api/admin/instructors/{instructor_pending.pk}/reject/",
            {"reason": "Test raison audit"},
            format="json",
        )
        assert r2.status_code == 200, r2.data

        # L'historique doit contenir les 2 events, plus récent en premier
        r3 = client.get(self.URL)
        assert r3.status_code == 200
        events = r3.data["events"]
        assert len(events) == 2
        assert events[0]["kind"] == "INSTRUCTOR_REJECTED"
        assert events[0]["reason"] == "Test raison audit"
        assert events[1]["kind"] == "INSTRUCTOR_APPROVED"
        # Structure du payload
        assert events[0]["target"]["email"] == instructor_pending.email
        assert events[0]["admin"]["email"] == platform_admin.email

    def test_ignores_unrelated_audit_events(self, platform_admin, db):
        """Ne doit pas mélanger d'autres kinds (PROVIDER_CALL, etc.)."""
        from ai.models import AIAuditLog
        # Un event de la KB — doit être ignoré
        AIAuditLog.objects.create(
            user=platform_admin,
            kind=AIAuditLog.Kind.KB_SEARCH,
            payload={"query": "test"},
        )
        # Un event pertinent
        AIAuditLog.objects.create(
            user=platform_admin,
            kind="INSTRUCTOR_APPROVED",
            payload={"target_user_id": 42, "target_email": "x@y.z"},
        )
        client = APIClient()
        _auth(client, platform_admin)
        r = client.get(self.URL)
        assert r.status_code == 200
        events = r.data["events"]
        assert len(events) == 1
        assert events[0]["kind"] == "INSTRUCTOR_APPROVED"


@pytest.mark.django_db
class TestPendingCountEndpoint:
    URL = "/api/admin/instructors/pending-count/"

    def test_non_admin_forbidden(self, instructor_pending):
        client = APIClient()
        _auth(client, instructor_pending)
        r = client.get(self.URL)
        assert r.status_code == 403
        assert r.data.get("code") == "ROLE_FORBIDDEN"

    def test_zero_when_none_pending(self, platform_admin):
        client = APIClient()
        _auth(client, platform_admin)
        r = client.get(self.URL)
        assert r.status_code == 200
        assert r.data == {"pending_count": 0}

    def test_counts_only_unverified_active_instructors(
        self, platform_admin, instructor_pending, db
    ):
        from compte.models import InstructorProfile
        # +1 formateur validé → ne doit PAS être compté
        verified = User.objects.create_user(
            email="ok.teacher@example.com",
            password="pw123!Solid",
            is_email_verified=True,
        )
        InstructorProfile.objects.create(
            user=verified, is_verified=True, payout_percent=70,
        )
        # +1 formateur inactif → ne doit PAS être compté
        inactive = User.objects.create_user(
            email="off.teacher@example.com",
            password="pw123!Solid",
            is_email_verified=True,
            is_active=False,
        )
        InstructorProfile.objects.create(
            user=inactive, is_verified=False, payout_percent=70,
        )
        client = APIClient()
        _auth(client, platform_admin)
        r = client.get(self.URL)
        assert r.status_code == 200
        # instructor_pending est le seul actif ET non validé
        assert r.data == {"pending_count": 1}


@pytest.mark.django_db
class TestRejectEndpoint:
    def test_reject_stores_reason(self, platform_admin, db):
        from compte.models import InstructorProfile
        # Instructeur préalablement validé — on veut vérifier la rétrogradation
        target = User.objects.create_user(
            email="reject.teacher@example.com",
            password="pw123!Solid",
            is_email_verified=True,
        )
        InstructorProfile.objects.create(
            user=target, is_verified=True, payout_percent=70,
        )
        client = APIClient()
        _auth(client, platform_admin)
        r = client.post(
            f"/api/admin/instructors/{target.pk}/reject/",
            {"reason": "Contenu insuffisant."},
            format="json",
        )
        assert r.status_code == 200, r.data
        assert r.data.get("reason") == "Contenu insuffisant."
        target.instructor_profile.refresh_from_db()
        assert target.instructor_profile.is_verified is False

    def test_reject_non_admin_forbidden(self, instructor_pending):
        client = APIClient()
        _auth(client, instructor_pending)
        r = client.post(f"/api/admin/instructors/{instructor_pending.pk}/reject/")
        assert r.status_code == 403
        assert r.data.get("code") == "ROLE_FORBIDDEN"
