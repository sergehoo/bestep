"""Tests V6.B — Vérification de signature webhook."""
from __future__ import annotations

import hashlib
import hmac
import time
from unittest import mock


def _make_request(body: bytes, headers: dict | None = None):
    """Mock request minimaliste pour les verifiers."""
    req = mock.MagicMock()
    req.body = body
    req.headers = headers or {}
    return req


def test_stripe_signature_valid(monkeypatch):
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "whsec_test_123")
    from commerce.webhook_signatures import verify_stripe_signature

    body = b'{"id":"evt_1","type":"payment_intent.succeeded"}'
    ts = int(time.time())
    payload = f"{ts}.".encode() + body
    sig = hmac.new(b"whsec_test_123", payload, hashlib.sha256).hexdigest()

    req = _make_request(body, {"Stripe-Signature": f"t={ts},v1={sig}"})
    assert verify_stripe_signature(req) is True


def test_stripe_signature_rejects_tampered_body(monkeypatch):
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "whsec_test_123")
    from commerce.webhook_signatures import verify_stripe_signature

    ts = int(time.time())
    sig = hmac.new(b"whsec_test_123", f"{ts}.{{}}".encode(), hashlib.sha256).hexdigest()
    # On tamper le body : le hash ne matchera plus.
    req = _make_request(b'{"tampered":true}', {"Stripe-Signature": f"t={ts},v1={sig}"})
    assert verify_stripe_signature(req) is False


def test_stripe_signature_rejects_old_timestamp(monkeypatch):
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "whsec_test_123")
    from commerce.webhook_signatures import verify_stripe_signature

    body = b'{"id":"evt_old"}'
    # Timestamp d'il y a 1 heure.
    ts = int(time.time()) - 3600
    sig = hmac.new(b"whsec_test_123", f"{ts}.".encode() + body, hashlib.sha256).hexdigest()

    req = _make_request(body, {"Stripe-Signature": f"t={ts},v1={sig}"})
    assert verify_stripe_signature(req) is False


def test_cinetpay_signature_valid(monkeypatch):
    monkeypatch.setenv("CINETPAY_WEBHOOK_SECRET", "secretkey")
    from commerce.webhook_signatures import verify_cinetpay_signature

    body = b'{"transaction_id":"tx_42","status":"ACCEPTED"}'
    token = hmac.new(b"secretkey", body, hashlib.sha256).hexdigest()
    req = _make_request(body, {"X-Token": token})
    assert verify_cinetpay_signature(req) is True


def test_verify_signature_unknown_provider(monkeypatch):
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "x")
    from commerce.webhook_signatures import verify_signature

    req = _make_request(b'{}')
    assert verify_signature("paypalclone", req) is False


def test_dev_bypass_blocked_in_prod(monkeypatch, settings):
    """Le bypass DEV ne doit PAS marcher quand DEBUG=False."""
    monkeypatch.setenv("COMMERCE_WEBHOOK_DEV_BYPASS", "1")
    settings.DEBUG = False
    from commerce.webhook_signatures import verify_signature

    req = _make_request(b'{}')
    # Pas de Stripe secret + DEBUG=False → False.
    monkeypatch.delenv("STRIPE_WEBHOOK_SECRET", raising=False)
    assert verify_signature("stripe", req) is False
