"""Tests Phase 1 — Idempotence commerce.

Couvre COM-01 / COM-02 : un webhook rejoué ne déclenche pas un double
enrôlement, et la contrainte d'unicité (provider, reference) est en place.
"""
from __future__ import annotations

from decimal import Decimal

import pytest


@pytest.mark.django_db
def test_payment_transaction_unique_provider_reference():
    """COM-02 : impossible d'avoir 2 PaymentTransaction (provider, reference)
    identiques quand reference est non-vide."""
    from django.db.utils import IntegrityError

    from commerce.models import Order, PaymentTransaction
    from organizations.models import Organization

    org = Organization.objects.create(name="TestOrg", slug="test-org")
    order = Order.objects.create(company=org)

    PaymentTransaction.objects.create(
        order=order, provider="stripe", reference="ch_abc123",
        amount=Decimal("100.00"), status="SUCCESS",
    )

    with pytest.raises(IntegrityError):
        PaymentTransaction.objects.create(
            order=order, provider="stripe", reference="ch_abc123",
            amount=Decimal("100.00"), status="SUCCESS",
        )


@pytest.mark.django_db
def test_payment_transaction_blank_reference_allowed_multiple():
    """COM-02 : la contrainte est conditionnée à reference non-vide ;
    plusieurs transactions INITIATED avec reference='' sont permises."""
    from commerce.models import Order, PaymentTransaction
    from organizations.models import Organization

    org = Organization.objects.create(name="TestOrg2", slug="test-org-2")
    order = Order.objects.create(company=org)

    PaymentTransaction.objects.create(order=order, provider="stripe", reference="", amount=Decimal("0"))
    # Deuxième transaction reference vide → autorisée.
    PaymentTransaction.objects.create(order=order, provider="stripe", reference="", amount=Decimal("0"))


@pytest.mark.django_db
def test_enroll_on_payment_success_is_idempotent(alice):
    """COM-01 : appeler enroll_on_payment_success deux fois ne crée pas
    deux enrollments."""
    from catalog.models import Course
    from commerce.models import Order, OrderItem
    from commerce.services import enroll_on_payment_success

    course = Course.objects.create(
        title="Cours test",
        slug="cours-test",
        status=Course.Status.PUBLISHED,
        instructor=alice,
    )
    order = Order.objects.create(user=alice, total=Decimal("100"))
    OrderItem.objects.create(order=order, item_type=OrderItem.ItemType.COURSE, course=course, unit_price=Decimal("100"))

    r1 = enroll_on_payment_success(order.id)
    r2 = enroll_on_payment_success(order.id)

    assert r1["ok"] is True
    assert r2.get("already_paid") is True

    # Un seul enrollment doit exister.
    from enrollments.models import Enrollment
    assert Enrollment.objects.filter(user=alice, course=course).count() == 1
