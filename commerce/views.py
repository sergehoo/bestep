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

La validation des signatures webhook est centralisée dans
``commerce.webhook_signatures``. Le checkout refuse toute création de
commande si aucun adaptateur PSP n'est configuré.
"""
from __future__ import annotations

import json
import logging
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.contrib.auth.decorators import login_required
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
from enrollments.models import Enrollment
from organizations.models import Organization, OrganizationMembership

from .models import Coupon, Order, OrderItem, PaymentTransaction
from .providers import (
    CheckoutProviderError,
    CheckoutProviderUnavailable,
    checkout_provider_is_configured,
    create_checkout_session,
)
from .services import (
    coupon_is_usable,
    enroll_on_payment_success,
    recalc_order_totals,
    record_transaction_outcome,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Checkout
# ---------------------------------------------------------------------------


class CheckoutValidationError(ValueError):
    def __init__(self, detail: str, *, status_code: int = 400):
        self.detail = detail
        self.status_code = status_code
        super().__init__(detail)


@method_decorator(login_required, name="dispatch")
class CheckoutView(View):
    """Valide le panier puis crée une session auprès du PSP configuré."""

    def post(self, request):
        try:
            payload = json.loads(request.body or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"detail": "Invalid JSON."}, status=400)

        currency = payload.get("currency", "XOF")
        items = payload.get("items") or []
        if not items:
            return JsonResponse({"detail": "items required"}, status=400)
        if not checkout_provider_is_configured():
            return JsonResponse(
                {"detail": "payment provider is not configured"},
                status=503,
            )

        currency = str(currency).strip().upper()
        if not currency.isalnum() or len(currency) > 8:
            return JsonResponse({"detail": "invalid currency"}, status=400)

        try:
            with transaction.atomic():
                company = self._validate_company(request.user, payload, items)
                coupon = self._validate_coupon(payload, currency)
                validated_items = self._validate_items(request.user, items, currency)
                order = Order.objects.create(
                    user=request.user,
                    company=company,
                    coupon=coupon,
                    currency=currency,
                    status=Order.Status.PENDING,
                )
                OrderItem.objects.bulk_create(
                    [OrderItem(order=order, **item) for item in validated_items]
                )
                recalc_order_totals(order)
        except CheckoutValidationError as exc:
            return JsonResponse({"detail": exc.detail}, status=exc.status_code)

        try:
            checkout_session = create_checkout_session(order=order, request=request)
            PaymentTransaction.objects.create(
                order=order,
                provider=checkout_session.provider,
                reference=checkout_session.reference,
                status=PaymentTransaction.Status.INITIATED,
                amount=order.total,
                currency=order.currency,
            )
        except CheckoutProviderUnavailable as exc:
            Order.objects.filter(pk=order.id).update(status=Order.Status.FAILED)
            return JsonResponse({"detail": str(exc)}, status=503)
        except CheckoutProviderError:
            logger.exception(
                "commerce.checkout.provider_error",
                extra={"order_id": order.id},
            )
            Order.objects.filter(pk=order.id).update(status=Order.Status.FAILED)
            return JsonResponse({"detail": "payment provider unavailable"}, status=502)
        except Exception:
            logger.exception(
                "commerce.checkout.persistence_error",
                extra={"order_id": order.id},
            )
            Order.objects.filter(pk=order.id).update(status=Order.Status.FAILED)
            return JsonResponse({"detail": "payment initialization failed"}, status=502)

        return JsonResponse(
            {
                "order_id": order.id,
                "total": str(order.total),
                "currency": order.currency,
                "checkout_url": checkout_session.checkout_url,
            },
            status=status.HTTP_201_CREATED,
        )

    @staticmethod
    def _validate_company(user, payload, items):
        has_seat_item = any(
            isinstance(raw, dict)
            and raw.get("item_type") == OrderItem.ItemType.COMPANY_SEATS
            for raw in items
        )
        company_id = payload.get("company_id")
        if not has_seat_item and not company_id:
            return None
        if not company_id:
            raise CheckoutValidationError("company_id required for company seats")
        try:
            company = Organization.objects.select_for_update().get(
                pk=int(company_id),
                is_active=True,
            )
        except (Organization.DoesNotExist, TypeError, ValueError) as exc:
            raise CheckoutValidationError(
                "company not available",
                status_code=404,
            ) from exc
        can_purchase = OrganizationMembership.objects.filter(
            user=user,
            organization=company,
            is_active=True,
            role__in=[
                OrganizationMembership.Role.OWNER,
                OrganizationMembership.Role.ADMIN,
            ],
        ).exists()
        if not can_purchase:
            raise CheckoutValidationError("company purchase forbidden", status_code=403)
        return company

    @staticmethod
    def _validate_coupon(payload, currency):
        coupon_code = str(payload.get("coupon_code") or "").strip()
        if not coupon_code:
            return None
        coupon = Coupon.objects.select_for_update().filter(code__iexact=coupon_code).first()
        if coupon is None or not coupon_is_usable(coupon, currency):
            raise CheckoutValidationError("coupon not available")
        return coupon

    @staticmethod
    def _validate_items(user, items, currency):
        validated_items = []
        course_ids = set()
        for raw in items:
            if not isinstance(raw, dict):
                raise CheckoutValidationError("each item must be an object")
            item_type = raw.get("item_type")
            if item_type not in dict(OrderItem.ItemType.choices):
                raise CheckoutValidationError(f"unknown item_type {item_type}")

            if item_type == OrderItem.ItemType.COURSE:
                try:
                    course_id = int(raw.get("course_id"))
                except (TypeError, ValueError) as exc:
                    raise CheckoutValidationError("valid course_id required") from exc
                if course_id in course_ids:
                    raise CheckoutValidationError("duplicate course item")
                course_ids.add(course_id)
                try:
                    course = (
                        Course.objects.select_for_update(of=("self",))
                        .select_related("company")
                        .get(pk=course_id)
                    )
                except Course.DoesNotExist as exc:
                    raise CheckoutValidationError(
                        "course not available",
                        status_code=404,
                    ) from exc
                if not policies.can_view_course(user, course):
                    raise CheckoutValidationError("course not available", status_code=403)
                if course.pricing_type == Course.PricingType.FREE or course.price <= 0:
                    raise CheckoutValidationError(
                        "free courses must use direct enrollment"
                    )
                if course.currency.upper() != currency:
                    raise CheckoutValidationError("course currency mismatch")
                if Enrollment.objects.filter(
                    user=user,
                    course=course,
                    status__in=[
                        Enrollment.Status.ACTIVE,
                        Enrollment.Status.COMPLETED,
                    ],
                ).exists():
                    raise CheckoutValidationError("course already enrolled")
                validated_items.append({
                    "item_type": item_type,
                    "course": course,
                    "unit_price": course.price,
                })
                continue

            try:
                seats_qty = int(raw.get("seats_qty"))
            except (TypeError, ValueError) as exc:
                raise CheckoutValidationError("seats_qty > 0 required") from exc
            if seats_qty <= 0:
                raise CheckoutValidationError("seats_qty > 0 required")
            seat_price = getattr(settings, "COMMERCE_COMPANY_SEAT_PRICE", None)
            if seat_price is None:
                raise CheckoutValidationError(
                    "company seat pricing is not configured",
                    status_code=503,
                )
            try:
                unit_price = Decimal(str(seat_price))
            except InvalidOperation as exc:
                raise CheckoutValidationError(
                    "invalid company seat pricing",
                    status_code=500,
                ) from exc
            if unit_price <= 0:
                raise CheckoutValidationError(
                    "invalid company seat pricing",
                    status_code=500,
                )
            validated_items.append({
                "item_type": item_type,
                "seats_qty": seats_qty,
                "unit_price": unit_price,
            })
        return validated_items


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
