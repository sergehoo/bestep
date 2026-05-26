"""Tests V2.C — Webhooks commerce idempotents."""
from __future__ import annotations

import json
import hashlib
import hmac
import time
from decimal import Decimal

import pytest


@pytest.mark.django_db
def test_webhook_unknown_provider_returns_404(client):
    resp = client.post(
        "/commerce/webhooks/badprovider/",
        data=json.dumps({"reference": "x", "status": "ok"}),
        content_type="application/json",
    )
    assert resp.status_code == 404


@pytest.mark.django_db
def test_webhook_replay_is_idempotent(client, alice, monkeypatch):
    """Un webhook rejoué (même provider+reference) doit retourner already_processed."""
    from catalog.models import Course
    from commerce.models import Order, OrderItem

    secret = "whsec_test_replay"
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", secret)

    course = Course.objects.create(
        title="Idem course", slug="idem-course",
        status=Course.Status.PUBLISHED, instructor=alice,
    )
    order = Order.objects.create(user=alice, total=Decimal("100"))
    OrderItem.objects.create(
        order=order, item_type=OrderItem.ItemType.COURSE,
        course=course, unit_price=Decimal("100"),
    )

    payload = {
        "reference": "tx_abc999",
        "status": "succeeded",  # mapped to SUCCESS pour stripe
        "amount": "100",
        "currency": "XOF",
        "order_id": order.id,
    }

    body = json.dumps(payload).encode()
    timestamp = str(int(time.time()))
    signature = hmac.new(secret.encode(), f"{timestamp}.".encode() + body, hashlib.sha256).hexdigest()
    headers = {"HTTP_STRIPE_SIGNATURE": f"t={timestamp},v1={signature}"}

    # 1er hit → ok
    r1 = client.post(
        "/commerce/webhooks/stripe/",
        data=body,
        content_type="application/json",
        **headers,
    )
    assert r1.status_code == 200
    assert r1.json()["ok"] is True

    # 2e hit (rejeu) → already_processed
    r2 = client.post(
        "/commerce/webhooks/stripe/",
        data=body,
        content_type="application/json",
        **headers,
    )
    assert r2.status_code == 200
    assert r2.json().get("already_processed") is True

    # Et un seul Enrollment existe.
    from enrollments.models import Enrollment
    assert Enrollment.objects.filter(user=alice, course=course).count() == 1
