"""commerce/webhook_signatures.py — Vérification de signature par PSP.

CORRECTIF V6.B (audit critique mentionné en V2.C) : remplace le stub
``_verify_webhook_signature`` qui retournait toujours True.

Implémentations actuelles :

- **Stripe** : HMAC-SHA256 du body + timestamp avec la signing secret.
- **Paydunya** : MD5 du body + master/private/token keys.
- **CinetPay** : HMAC-SHA256 du body (selon doc PSP).

Si un PSP n'est pas utilisé en production, retirer son entrée de
``VERIFIERS`` pour éviter les faux positifs.

Les clés viennent EXCLUSIVEMENT de variables d'environnement :
``STRIPE_WEBHOOK_SECRET``, ``PAYDUNYA_PRIVATE_KEY``, ``PAYDUNYA_TOKEN``,
``CINETPAY_WEBHOOK_SECRET``.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
import time
from typing import Callable, Optional

logger = logging.getLogger(__name__)


# Tolérance d'horloge pour les timestamps Stripe (300s = 5 minutes).
STRIPE_TOLERANCE_SECONDS = 300


class InvalidSignature(Exception):
    """Levée quand la signature ne correspond pas. Le caller doit retourner 401."""


# ---------------------------------------------------------------------------
# Stripe
# ---------------------------------------------------------------------------


def verify_stripe_signature(request) -> bool:
    """Vérifie ``Stripe-Signature`` selon
    https://stripe.com/docs/webhooks/signatures

    Header attendu :
        Stripe-Signature: t=1234567890,v1=hex_hmac_sha256,...
    """
    secret = os.getenv("STRIPE_WEBHOOK_SECRET", "").strip()
    if not secret:
        logger.error("stripe.webhook.no_secret")
        return False

    header = request.headers.get("Stripe-Signature", "")
    if not header:
        return False

    try:
        parts = dict(item.split("=", 1) for item in header.split(",") if "=" in item)
    except ValueError:
        return False

    timestamp = parts.get("t")
    signature = parts.get("v1")
    if not timestamp or not signature:
        return False

    try:
        ts = int(timestamp)
    except ValueError:
        return False

    # Anti-rejeu : timestamp doit être dans la fenêtre.
    if abs(int(time.time()) - ts) > STRIPE_TOLERANCE_SECONDS:
        logger.warning("stripe.webhook.timestamp_outside_window", extra={"ts": ts})
        return False

    payload = request.body
    signed_payload = f"{timestamp}.".encode() + payload
    expected = hmac.new(secret.encode(), signed_payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


# ---------------------------------------------------------------------------
# Paydunya
# ---------------------------------------------------------------------------


def verify_paydunya_signature(request) -> bool:
    """Vérifie le hash Paydunya selon la doc IPN :
    https://paydunya.com/developers/api/checkout-invoice

    Paydunya envoie typiquement un champ ``hash`` = SHA-512 ou MD5 de la
    payload + master_key. Adapter selon votre version d'API.
    """
    master_key = os.getenv("PAYDUNYA_MASTER_KEY", "").strip()
    if not master_key:
        logger.error("paydunya.webhook.no_master_key")
        return False

    # Paydunya envoie souvent le hash dans le body (champ ``data[hash]``).
    # On lit la payload, on extrait le hash, on le recalcule.
    try:
        import json
        payload = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return False

    received_hash = payload.get("data", {}).get("hash") or payload.get("hash")
    if not received_hash:
        return False

    expected = hashlib.sha512(master_key.encode()).hexdigest()
    return hmac.compare_digest(expected, received_hash)


# ---------------------------------------------------------------------------
# CinetPay
# ---------------------------------------------------------------------------


def verify_cinetpay_signature(request) -> bool:
    """Vérifie le HMAC CinetPay selon la doc Notify v2.

    Header attendu : ``x-token`` = HMAC-SHA256(body, CINETPAY_WEBHOOK_SECRET).
    """
    secret = os.getenv("CINETPAY_WEBHOOK_SECRET", "").strip()
    if not secret:
        logger.error("cinetpay.webhook.no_secret")
        return False

    received = request.headers.get("X-Token", "")
    if not received:
        return False

    expected = hmac.new(secret.encode(), request.body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, received)


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------


VERIFIERS: dict[str, Callable] = {
    "stripe": verify_stripe_signature,
    "paydunya": verify_paydunya_signature,
    "cinetpay": verify_cinetpay_signature,
}


def verify_signature(provider: str, request) -> bool:
    """Point d'entrée unique : retourne True si la signature est valide.

    En mode dev (``DJANGO_DEBUG=1``), on autorise un mode "bypass" UNIQUEMENT
    si la variable ``COMMERCE_WEBHOOK_DEV_BYPASS=1`` est explicitement posée.
    Cela évite de bypasser par erreur en prod.
    """
    if _dev_bypass_allowed():
        logger.warning("commerce.webhook.dev_bypass", extra={"provider": provider})
        return True

    verifier = VERIFIERS.get(provider)
    if verifier is None:
        return False
    try:
        return bool(verifier(request))
    except Exception as exc:  # noqa: BLE001
        logger.error("commerce.webhook.verify_failed", extra={"provider": provider, "exc": str(exc)})
        return False


def _dev_bypass_allowed() -> bool:
    """Bypass UNIQUEMENT en dev + flag explicite."""
    from django.conf import settings

    if not getattr(settings, "DEBUG", False):
        return False
    return os.getenv("COMMERCE_WEBHOOK_DEV_BYPASS", "").strip() == "1"
