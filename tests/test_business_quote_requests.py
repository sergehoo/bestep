"""Parcours public et traitement admin des demandes de devis entreprise."""

from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework.test import APIClient

from catalog.models import Category
from notifications.models import Notification
from organizations.models import BusinessInterestRequest

User = get_user_model()

PUBLIC_URL = "/api/public/business-interest-requests/"
ADMIN_URL = "/api/admin/business-interest-requests/"


@pytest.fixture(autouse=True)
def clear_throttles():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def platform_admin(db):
    return User.objects.create_user(
        email="quote.admin@example.com",
        password="pw123!Solid",
        is_staff=True,
        is_superuser=True,
        is_email_verified=True,
    )


@pytest.fixture
def regular_user(db):
    return User.objects.create_user(
        email="quote.user@example.com",
        password="pw123!Solid",
        is_email_verified=True,
    )


@pytest.fixture
def category(db):
    return Category.objects.create(name="Gestion des risques")


@pytest.fixture
def valid_payload(category):
    return {
        "organization_name": "Groupe Horizon",
        "organization_type": "FINANCIAL",
        "country": "Côte d’Ivoire",
        "city": "Abidjan",
        "contact_name": "Awa Koné",
        "contact_role": "Responsable formation",
        "email": "  AWA.KONE@EXAMPLE.COM ",
        "phone": "+225 07 08 09 10 11",
        "preferred_contact": "WHATSAPP",
        "learners_count": 85,
        "plan_interest": "PRO",
        "timeframe": "1_3_MONTHS",
        "budget_range": "2 à 5 millions FCFA",
        "category_ids": [category.id],
        "message": "Nous souhaitons former nos équipes à la gestion des risques.",
        "privacy_consent": True,
        "source": "enterprise_pricing_pro",
        "website": "",
    }


def _create_request(**overrides):
    payload = {
        "organization_name": "Organisation Démo",
        "organization_type": BusinessInterestRequest.OrganizationType.COMPANY,
        "country": "Sénégal",
        "contact_name": "Moussa Diop",
        "contact_role": "DRH",
        "email": "moussa@example.com",
        "phone": "+221 77 000 00 00",
        "learners_count": 60,
        "preferred_contact": BusinessInterestRequest.PreferredContact.EMAIL,
        "plan_interest": BusinessInterestRequest.PlanInterest.PRO,
        "timeframe": BusinessInterestRequest.Timeframe.IMMEDIATE,
        "message": "Besoin de formation pour nos équipes commerciales.",
        "privacy_consent": True,
    }
    payload.update(overrides)
    return BusinessInterestRequest.objects.create(**payload)


@pytest.mark.django_db
class TestPublicBusinessQuoteRequest:
    def test_anonymous_submission_creates_request_and_notifies_admin(
        self, platform_admin, valid_payload, category
    ):
        response = APIClient().post(PUBLIC_URL, valid_payload, format="json")

        assert response.status_code == 201, response.data
        assert set(response.data) == {"reference", "status", "message"}
        assert response.data["status"] == "received"

        interest = BusinessInterestRequest.objects.get()
        assert response.data["reference"] == interest.reference
        assert interest.email == "awa.kone@example.com"
        assert interest.organization_name == "Groupe Horizon"
        assert interest.learners_count == 85
        assert interest.privacy_consent is True
        assert interest.consented_at is not None
        assert list(interest.categories.all()) == [category]

        notification = Notification.objects.get(user=platform_admin)
        assert notification.url == "/admin/quote-requests"
        assert notification.payload["business_interest_request_id"] == interest.id
        assert notification.payload["reference"] == interest.reference

    @pytest.mark.parametrize(
        ("field", "value"),
        [
            ("privacy_consent", False),
            ("email", "adresse-invalide"),
            ("learners_count", 0),
            ("phone", "123"),
            ("message", "Court"),
            ("website", "https://robot.example"),
        ],
    )
    def test_invalid_or_bot_submission_is_rejected_without_storage(
        self, valid_payload, field, value
    ):
        valid_payload[field] = value
        response = APIClient().post(PUBLIC_URL, valid_payload, format="json")

        assert response.status_code == 400
        assert BusinessInterestRequest.objects.count() == 0


@pytest.mark.django_db
class TestAdminBusinessQuoteWorkflow:
    def test_admin_queue_is_private(self, platform_admin, regular_user):
        anonymous_response = APIClient().get(ADMIN_URL)
        assert anonymous_response.status_code == 401

        regular_client = APIClient()
        regular_client.force_authenticate(regular_user)
        regular_response = regular_client.get(ADMIN_URL)
        assert regular_response.status_code == 403

        admin_client = APIClient()
        admin_client.force_authenticate(platform_admin)
        admin_response = admin_client.get(ADMIN_URL)
        assert admin_response.status_code == 200

    def test_admin_list_filters_and_exposes_aggregates(self, platform_admin):
        _create_request(organization_name="Alpha", status="NEW")
        _create_request(
            organization_name="Beta",
            email="beta@example.com",
            status="QUALIFIED",
            plan_interest="ENTERPRISE",
        )
        _create_request(
            organization_name="Gamma",
            email="gamma@example.com",
            status="WON",
            plan_interest="ENTERPRISE",
        )

        client = APIClient()
        client.force_authenticate(platform_admin)
        response = client.get(ADMIN_URL, {"plan_interest": "ENTERPRISE"})

        assert response.status_code == 200, response.data
        assert response.data["count"] == 2
        assert {item["organization_name"] for item in response.data["results"]} == {
            "Beta",
            "Gamma",
        }
        assert response.data["aggregated"]["total"] == 2
        assert response.data["aggregated"]["in_progress"] == 1
        assert response.data["aggregated"]["won"] == 1

    def test_admin_can_process_request_with_traceability(self, platform_admin):
        interest = _create_request()
        client = APIClient()
        client.force_authenticate(platform_admin)

        response = client.patch(
            f"{ADMIN_URL}{interest.id}/",
            {
                "status": "CONTACTED",
                "admin_notes": "Contact WhatsApp effectué, rendez-vous fixé.",
            },
            format="json",
        )

        assert response.status_code == 200, response.data
        interest.refresh_from_db()
        assert interest.status == BusinessInterestRequest.Status.CONTACTED
        assert interest.admin_notes.startswith("Contact WhatsApp")
        assert interest.processed_by == platform_admin
        assert interest.processed_at is not None
        assert interest.is_processed is True
        assert response.data["processed_by_email"] == platform_admin.email

    def test_admin_rejects_unknown_status(self, platform_admin):
        interest = _create_request()
        client = APIClient()
        client.force_authenticate(platform_admin)

        response = client.patch(
            f"{ADMIN_URL}{interest.id}/",
            {"status": "INVENTED"},
            format="json",
        )

        assert response.status_code == 400
        interest.refresh_from_db()
        assert interest.status == BusinessInterestRequest.Status.NEW

    def test_admin_note_alone_is_attributed_without_closing_new_status(self, platform_admin):
        interest = _create_request()
        client = APIClient()
        client.force_authenticate(platform_admin)

        response = client.patch(
            f"{ADMIN_URL}{interest.id}/",
            {"admin_notes": "À rappeler demain matin."},
            format="json",
        )

        assert response.status_code == 200
        interest.refresh_from_db()
        assert interest.status == BusinessInterestRequest.Status.NEW
        assert interest.processed_by == platform_admin
        assert interest.processed_at is not None
        assert interest.is_processed is False
