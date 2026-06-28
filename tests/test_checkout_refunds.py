from __future__ import annotations

import json
from decimal import Decimal

import pytest
from django.test import override_settings
from django.urls import reverse

from catalog.models import Course
from commerce.models import CompanyLicense, Order, OrderItem, PaymentTransaction
from commerce.services import refund_order
from enrollments.models import Enrollment
from organizations.models import Organization


def fake_checkout_session(*, order, request):
    return {
        "provider": "stripe",
        "reference": f"checkout-{order.id}",
        "checkout_url": "https://payments.example.test/session/123",
    }


def _login_for_checkout(client, user):
    client.force_login(user)
    session = client.session
    session["onboarding_completed"] = True
    session.save()


@pytest.mark.django_db
@override_settings(COMMERCE_CHECKOUT_SESSION_FACTORY="")
def test_checkout_without_provider_creates_no_order(client, alice):
    _login_for_checkout(client, alice)

    response = client.post(
        reverse("commerce:checkout"),
        data=json.dumps({"items": [{"item_type": "COURSE", "course_id": 1}]}),
        content_type="application/json",
    )

    assert response.status_code == 503
    assert Order.objects.count() == 0


@pytest.mark.django_db
@override_settings(
    COMMERCE_CHECKOUT_SESSION_FACTORY=("tests.test_checkout_refunds.fake_checkout_session")
)
def test_checkout_validation_is_atomic(client, alice, bob):
    course = Course.objects.create(
        title="Cours payant",
        instructor=bob,
        status=Course.Status.PUBLISHED,
        pricing_type=Course.PricingType.PAID,
        price=Decimal("125.00"),
    )
    _login_for_checkout(client, alice)

    response = client.post(
        reverse("commerce:checkout"),
        data=json.dumps(
            {
                "items": [
                    {"item_type": "COURSE", "course_id": course.id},
                    {"item_type": "UNKNOWN"},
                ],
            }
        ),
        content_type="application/json",
    )

    assert response.status_code == 400
    assert Order.objects.count() == 0
    assert OrderItem.objects.count() == 0


@pytest.mark.django_db
@override_settings(
    COMMERCE_CHECKOUT_SESSION_FACTORY=("tests.test_checkout_refunds.fake_checkout_session")
)
def test_checkout_uses_server_price_and_records_provider(client, alice, bob):
    course = Course.objects.create(
        title="Cours sécurisé",
        instructor=bob,
        status=Course.Status.PUBLISHED,
        pricing_type=Course.PricingType.PAID,
        price=Decimal("125.00"),
    )
    _login_for_checkout(client, alice)

    response = client.post(
        reverse("commerce:checkout"),
        data=json.dumps(
            {
                "currency": "xof",
                "items": [
                    {
                        "item_type": "COURSE",
                        "course_id": course.id,
                        "unit_price": "1.00",
                    }
                ],
            }
        ),
        content_type="application/json",
    )

    assert response.status_code == 201
    order = Order.objects.get()
    assert order.total == Decimal("125.00")
    assert order.items.get().unit_price == Decimal("125.00")
    transaction_record = PaymentTransaction.objects.get(order=order)
    assert transaction_record.provider == "stripe"
    assert response.json()["checkout_url"].startswith("https://")


@pytest.mark.django_db
def test_refund_requires_provider_before_any_mutation(alice):
    order = Order.objects.create(
        user=alice,
        status=Order.Status.PAID,
        total=Decimal("50.00"),
    )

    with pytest.raises(NotImplementedError):
        refund_order(order.id)

    order.refresh_from_db()
    assert order.status == Order.Status.PAID


@pytest.mark.django_db
def test_refund_provider_failure_preserves_access(alice, bob):
    course = Course.objects.create(
        title="Accès conservé",
        instructor=bob,
        status=Course.Status.PUBLISHED,
    )
    enrollment = Enrollment.objects.create(user=alice, course=course)
    order = Order.objects.create(
        user=alice,
        status=Order.Status.PAID,
        total=Decimal("50.00"),
    )
    OrderItem.objects.create(
        order=order,
        item_type=OrderItem.ItemType.COURSE,
        course=course,
        unit_price=order.total,
    )

    def failing_provider(**kwargs):
        raise RuntimeError("PSP unavailable")

    with pytest.raises(RuntimeError):
        refund_order(order.id, provider_refund=failing_provider)

    order.refresh_from_db()
    enrollment.refresh_from_db()
    assert order.status == Order.Status.REFUND_FAILED
    assert enrollment.status == Enrollment.Status.ACTIVE


@pytest.mark.django_db
def test_refund_revokes_only_resources_from_refunded_order(alice, bob):
    organization = Organization.objects.create(name="Acme")
    course = Course.objects.create(
        title="Accès remboursé",
        instructor=bob,
        status=Course.Status.PUBLISHED,
    )
    enrollment = Enrollment.objects.create(user=alice, course=course)
    order = Order.objects.create(
        user=alice,
        company=organization,
        status=Order.Status.PAID,
        total=Decimal("50.00"),
    )
    other_order = Order.objects.create(user=alice, company=organization)
    OrderItem.objects.create(
        order=order,
        item_type=OrderItem.ItemType.COURSE,
        course=course,
        unit_price=order.total,
    )
    refunded_license = CompanyLicense.objects.create(
        company=organization,
        order=order,
        seats_total=10,
    )
    unrelated_license = CompanyLicense.objects.create(
        company=organization,
        order=other_order,
        seats_total=5,
    )

    result = refund_order(
        order.id,
        reason="Demande client",
        provider_refund=lambda **kwargs: {
            "provider": "stripe",
            "reference": "re_123",
        },
    )

    order.refresh_from_db()
    enrollment.refresh_from_db()
    refunded_license.refresh_from_db()
    unrelated_license.refresh_from_db()
    assert result["ok"] is True
    assert order.status == Order.Status.REFUNDED
    assert enrollment.status == Enrollment.Status.CANCELED
    assert refunded_license.valid_until is not None
    assert unrelated_license.valid_until is None
    assert PaymentTransaction.objects.filter(
        order=order,
        provider="stripe_refund",
        reference="re_123",
    ).exists()
