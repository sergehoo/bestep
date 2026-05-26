"""commerce/views.py — CORRECTIF V2.C (COM-06).

Avant : ``commerce/views.py`` était vide → aucun endpoint exposé pour
checkout, callback ou webhook ; tout l'app commerce était utilisable
uniquement en shell/management commands. C'est cassant pour la mise en
production B2C.

Après : structure exposée

- ``POST /commerce/checkout/`` : crée un Order + items à partir d'un panier
  fourni en POST ; retourne le total et l'URL de redirection vers le PSP.
  L'intégration PSP réelle (Stripe / Paydunya / CinetPay) est volontairement
  marquée ``TODO`` car elle dépend des choix produit (compte marchand, etc.).

- ``POST /commerce/webhooks/<provider>/`` : reçoit les events du PSP.
  Idempotent grâce à ``commerce.services.record_transaction_outcome``
  (UniqueConstraint(provider, reference) appliquée en DB → COM-02).
  Si la transaction est nouvelle ET status=SUCCESS, on appelle
  ``enroll_on_payment_success`` qui matérialise l'inscription / la licence
  (COM-01).

- ``GET /commerce/orders/<id>/`` : page de récap simple (template à
  personnaliser).

> SÉCURITÉ : la validation de la signature de webhook (Stripe Signature,
> Paydunya hash, etc.) est laissée volontairement à brancher par
> ``provider`` dans ``_verify_webhook_signature``. NE PAS DÉPLOYER EN
> PROD sans cette implémentation : sinon n'importe qui peut POSTer un
> webhook frauduleux.
"""
from __future__ import annotations

import json
import logging
from decimal import Decimal, InvalidOperation

from django.contrib.auth.decorators import login_required
from django.conf import settings
from django.db import transaction
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, render
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from rest_framework import status

from catalog.models import Course
from core import policies
from .models import Order, OrderItem
from .services import (
    enroll_on_payment_success,
    recalc_order_totals,
    record_transaction_outcome,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Checkout (squelette à enrichir selon PSP)
# ---------------------------------------------------------------------------


@method_decorator(login_required, name="dispatch")
class CheckoutView(View):
    """POST /commerce/checkout/ — crée un Order PENDING.

    Body JSON attendu :
    {
      "currency": "XOF",
      "items": [
        {"item_type": "COURSE", "course_id": 12, "unit_price": "100.00"},
        {"item_type": "COMPANY_SEATS", "seats_qty": 10, "unit_price": "50.00"}
      ],
      "coupon_code": "WELCOME10"   // optionnel
    }

    Returns 201 + JSON avec ``order_id``, ``total``, ``checkout_url``
    (à remplacer par l'URL réelle du PSP).
    """

    def post(self, request):
        try:
            payload = json.loads(request.body or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"detail": "Invalid JSON."}, status=400)

        currency = payload.get("currency", "XOF")
        items = payload.get("items") or []
        if not items:
            return JsonResponse({"detail": "items required"}, status=400)

        with transaction.atomic():
            order = Order.objects.create(user=request.user, currency=currency, status=Order.Status.PENDING)
            for raw in items:
                item_type = raw.get("item_type")
                if item_type not in dict(OrderItem.ItemType.choices):
                    return JsonResponse({"detail": f"unknown item_type {item_type}"}, status=400)

                kwargs = {
                    "order": order,
                    "item_type": item_type,
                }
                if item_type == OrderItem.ItemType.COURSE:
                    course_id = raw.get("course_id")
                    if not course_id:
                        return JsonResponse({"detail": "course_id required"}, status=400)
                    course = get_object_or_404(
                        Course.objects.select_for_update().select_related("company"),
                        pk=int(course_id),
                    )
                    if not policies.can_view_course(request.user, course):
                        return JsonResponse({"detail": "course not available"}, status=403)
                    if course.pricing_type == Course.PricingType.FREE or not course.price:
                        return JsonResponse({"detail": "free courses must use direct enrollment"}, status=400)
                    kwargs["course"] = course
                    kwargs["unit_price"] = course.price
                elif item_type == OrderItem.ItemType.COMPANY_SEATS:
                    seats_qty = raw.get("seats_qty")
                    if not seats_qty or int(seats_qty) <= 0:
                        return JsonResponse({"detail": "seats_qty > 0 required"}, status=400)
                    seat_price = getattr(settings, "COMMERCE_COMPANY_SEAT_PRICE", None)
                    if seat_price is None:
                        return JsonResponse({"detail": "company seat pricing is not configured"}, status=501)
                    kwargs["seats_qty"] = int(seats_qty)
                    try:
                        kwargs["unit_price"] = Decimal(str(seat_price))
                    except InvalidOperation:
                        return JsonResponse({"detail": "invalid company seat pricing"}, status=500)
                OrderItem.objects.create(**kwargs)

            recalc_order_totals(order)

        # TODO PSP : construire ici la session de paiement (Stripe Checkout,
        # Paydunya CreateInvoice, CinetPay…) et retourner l'URL externe.
        checkout_url = request.build_absolute_uri(f"/commerce/orders/{order.id}/pending/")
        return JsonResponse(
            {
                "order_id": order.id,
                "total": str(order.total),
                "currency": order.currency,
                "checkout_url": checkout_url,
            },
            status=status.HTTP_201_CREATED,
        )


@login_required
def order_pending(request, order_id):
    """Page d'attente affichée pendant que le webhook PSP arrive."""
    order = get_object_or_404(Order, pk=order_id, user=request.user)
    return render(request, "commerce/order_pending.html", {"order": order})


# ---------------------------------------------------------------------------
# Webhooks PSP — idempotents
# ---------------------------------------------------------------------------


def _verify_webhook_signature(provider: str, request) -> bool:
    """V6.B : délègue au module dédié ``commerce.webhook_signatures``.

    Stripe : HMAC-SHA256 timestamp + body avec ``STRIPE_WEBHOOK_SECRET``.
    Paydunya : SHA-512 (``PAYDUNYA_MASTER_KEY``).
    CinetPay : HMAC-SHA256 body (``CINETPAY_WEBHOOK_SECRET``).

    Bypass DEV uniquement si ``DJANGO_DEBUG=1`` ET
    ``COMMERCE_WEBHOOK_DEV_BYPASS=1`` posés.
    """
    from .webhook_signatures import verify_signature
    return verify_signature(provider, request)


_PROVIDER_STATUS_MAP = {
    # Mapping des status PSP → notre PaymentTransaction.Status.
    "stripe": {
        "succeeded": "SUCCESS",
        "failed": "FAILED",
        "pending": "PENDING",
    },
    "paydunya": {
        "completed": "SUCCESS",
        "cancelled": "FAILED",
        "pending": "PENDING",
    },
    "cinetpay": {
        "ACCEPTED": "SUCCESS",
        "REFUSED": "FAILED",
        "WAITING": "PENDING",
    },
}


@csrf_exempt
@require_POST
def webhook_handler(request, provider: str):
    """POST /commerce/webhooks/<provider>/.

    Idempotent : la contrainte ``UniqueConstraint(provider, reference)``
    + le helper ``record_transaction_outcome`` empêchent le double-traitement.
    """
    provider = (provider or "").lower()
    if provider not in _PROVIDER_STATUS_MAP:
        return HttpResponse(status=404)

    if not _verify_webhook_signature(provider, request):
        return HttpResponse(status=401)

    try:
        payload = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return HttpResponse(status=400)

    # Extraction normalisée (à adapter selon le format réel du PSP).
    reference = (
        payload.get("reference")
        or payload.get("transaction_id")
        or payload.get("id")
        or ""
    )
    raw_status = payload.get("status")
    amount_raw = payload.get("amount") or "0"
    currency = payload.get("currency")
    order_id = payload.get("order_id") or payload.get("metadata", {}).get("order_id")

    if not reference or not order_id:
        return HttpResponse(status=400)

    try:
        amount = Decimal(str(amount_raw))
    except InvalidOperation:
        return HttpResponse(status=400)

    mapped_status = _PROVIDER_STATUS_MAP[provider].get(raw_status)
    if mapped_status is None:
        return HttpResponse(status=400)

    try:
        with transaction.atomic():
            order = Order.objects.select_for_update().get(pk=int(order_id))
            if currency and currency != order.currency:
                logger.warning("commerce.webhook.currency_mismatch", extra={"order_id": order.id, "provider": provider})
                return HttpResponse(status=400)
            if amount != order.total:
                logger.warning("commerce.webhook.amount_mismatch", extra={"order_id": order.id, "provider": provider})
                return HttpResponse(status=400)

            # CORRECTIF COM-02 : idempotence via (provider, reference).
            tx, created = record_transaction_outcome(
                order=order,
                provider=provider,
                reference=reference,
                status=mapped_status,
                amount=amount,
                currency=currency,
                raw_payload=payload,
            )
    except (Order.DoesNotExist, ValueError, TypeError):
        return HttpResponse(status=404)

    if not created:
        # Webhook rejoué — on ignore.
        return JsonResponse({"already_processed": True}, status=200)

    if mapped_status == "SUCCESS":
        result = enroll_on_payment_success(order.id)
        return JsonResponse({"ok": True, "result": result}, status=200)

    return JsonResponse({"ok": True, "status": mapped_status}, status=200)
