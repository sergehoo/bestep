"""commerce/services.py — CORRECTIF P1.H (audit COM-01, COM-03, COM-04).

Changements clés :

- **COM-01 (Critique race)** : `enroll_on_payment_success` accepte un ``order_id``
  (au lieu de l'instance Order) et acquiert un ``select_for_update`` sur la
  ligne avant de décider. Un webhook rejoué = vérification idempotente,
  pas de double-enrôlement / double-licence.

- **COM-03 (Critique cohérence)** : ``recalc_order_totals`` est désormais
  ``@transaction.atomic``, vérifie la fenêtre de validité du coupon
  (``valid_from`` / ``valid_to``) et son ``usage_limit``. L'incrément du
  ``used_count`` se fait UNIQUEMENT à la finalisation (`mark_paid`).

- **COM-04 (Critique workflow)** : nouveau service ``refund_order`` qui marque
  les enrollments en CANCELED et journalise une PaymentTransaction de refund.
  Le call provider est intentionnellement à brancher selon le PSP utilisé.

- **COM-07 (Important multi-devise)** : on vérifie ``coupon.currency == order.currency``.

- **COM-08 (Validation licence)** : check seats_qty > 0 et org active.

- **COM-12 (Validation OrderItem)** : un OrderItem COURSE doit avoir un
  course non-null avec unit_price ≥ 0 ; un COMPANY_SEATS doit avoir
  seats_qty > 0.
"""
from __future__ import annotations

import logging
from collections.abc import Callable, Mapping
from decimal import Decimal

from django.db import transaction
from django.db.models import F
from django.utils import timezone

from catalog.models import Course  # noqa: F401
from enrollments.models import Enrollment

from .models import CompanyLicense, Coupon, Order, OrderItem, PaymentTransaction

logger = logging.getLogger(__name__)


def coupon_is_usable(coupon: Coupon, order_currency: str) -> bool:
    """Vrai si le coupon peut être appliqué à une order de devise ``order_currency``."""
    if not coupon or not coupon.is_active:
        return False
    # CORRECTIF COM-07 : cohérence devise.
    if coupon.currency and coupon.currency != order_currency:
        return False
    now = timezone.now()
    if coupon.valid_from and coupon.valid_from > now:
        return False
    if coupon.valid_to and coupon.valid_to < now:
        return False
    if coupon.usage_limit is not None and coupon.used_count >= coupon.usage_limit:
        return False
    return True


@transaction.atomic
def recalc_order_totals(order: Order) -> Order:
    """Recalcule subtotal / discount / total.

    CORRECTIF COM-03 : enveloppé en transaction ; coupon vérifié strict.
    """
    subtotal = Decimal("0")
    for it in order.items.all():
        # CORRECTIF COM-12 : validation cohérence selon item_type.
        if it.item_type == OrderItem.ItemType.COURSE:
            if not it.course_id:
                logger.warning("commerce.recalc.invalid_order_item.course_missing", extra={"order_id": order.id, "item_id": it.id})
                it.line_total = Decimal("0")
            else:
                it.line_total = it.unit_price or Decimal("0")
        elif it.item_type == OrderItem.ItemType.COMPANY_SEATS:
            qty = it.seats_qty or 0
            if qty <= 0:
                logger.warning("commerce.recalc.invalid_order_item.seats_zero", extra={"order_id": order.id, "item_id": it.id})
                it.line_total = Decimal("0")
            else:
                it.line_total = (it.unit_price or Decimal("0")) * qty
        else:
            it.line_total = Decimal("0")
        it.save(update_fields=["line_total"])
        subtotal += it.line_total

    discount_total = Decimal("0")
    if order.coupon and coupon_is_usable(order.coupon, order.currency):
        c = order.coupon
        if c.percent_off:
            pct = max(0, min(100, c.percent_off))
            discount_total = (subtotal * Decimal(pct) / Decimal("100")).quantize(Decimal("0.01"))
        elif c.amount_off:
            discount_total = min(subtotal, c.amount_off)

    order.subtotal = subtotal
    order.discount_total = discount_total
    order.total = max(Decimal("0"), subtotal - discount_total)
    order.save(update_fields=["subtotal", "discount_total", "total"])
    return order


@transaction.atomic
def enroll_on_payment_success(order_id: int) -> dict:
    """CORRECTIF COM-01 : sérialisation explicite via select_for_update.

    Idempotent : si l'order est déjà PAID, on retourne sans rien faire.
    Pas de double-enrôlement / double-licence si le webhook est rejoué.
    """
    try:
        order = (
            Order.objects.select_for_update()
            .get(pk=order_id)
        )
    except Order.DoesNotExist:
        return {"ok": False, "reason": "order_not_found"}

    if order.status == Order.Status.PAID:
        return {"ok": True, "already_paid": True}

    created_enrollments = 0
    created_licenses = 0

    for it in order.items.select_related("course"):
        if it.item_type == OrderItem.ItemType.COURSE and it.course_id:
            _, created = Enrollment.objects.get_or_create(
                user=order.user,
                course=it.course,
                defaults={"source": Enrollment.Source.B2C},
            )
            if created:
                created_enrollments += 1

        elif it.item_type == OrderItem.ItemType.COMPANY_SEATS and order.company_id:
            # CORRECTIF COM-08 : valider seats_qty et org active.
            if it.seats_qty <= 0:
                logger.warning("commerce.enroll.invalid_seats", extra={"order_id": order.id})
                continue
            if not order.company.is_active:
                logger.warning("commerce.enroll.inactive_org", extra={"order_id": order.id})
                continue
            CompanyLicense.objects.create(
                company=order.company,
                order=order,
                seats_total=it.seats_qty,
                seats_used=0,
                valid_until=None,
            )
            created_licenses += 1

    # CORRECTIF COM-03 : incrémenter le coupon used_count à la finalisation.
    if order.coupon_id:
        Coupon.objects.filter(pk=order.coupon_id).update(used_count=F("used_count") + 1)

    order.status = Order.Status.PAID
    order.paid_at = timezone.now()
    order.save(update_fields=["status", "paid_at"])

    return {"ok": True, "enrollments": created_enrollments, "licenses": created_licenses}


@transaction.atomic
def create_transaction(order: Order, provider: str, amount: Decimal) -> PaymentTransaction:
    tx = PaymentTransaction.objects.create(
        order=order,
        provider=provider,
        status=PaymentTransaction.Status.INITIATED,
        amount=amount,
        currency=order.currency,
    )
    order.status = Order.Status.PENDING
    order.save(update_fields=["status"])
    return tx


@transaction.atomic
def record_transaction_outcome(
    *,
    order: Order,
    provider: str,
    reference: str,
    status: str,
    amount: Decimal,
    currency: str | None = None,
    raw_payload: dict | None = None,
) -> tuple[PaymentTransaction, bool]:
    """CORRECTIF COM-02 : idempotence par (provider, reference).

    Returns:
        (transaction, created). Si ``created`` est False, la transaction
        existe déjà : le caller doit IGNORER (webhook rejoué).
    """
    safe_payload = _sanitize_payload(raw_payload or {})
    tx, created = PaymentTransaction.objects.get_or_create(
        provider=provider,
        reference=reference,
        defaults={
            "order": order,
            "status": status,
            "amount": amount,
            "currency": currency or order.currency,
            "raw_payload": safe_payload,
        },
    )
    return tx, created


def _sanitize_payload(payload: dict) -> dict:
    """CORRECTIF COM-14 : whitelist des clés pour éviter de stocker CVV/PAN/tokens.

    On garde uniquement les clés utiles à la réconciliation.
    """
    allowed = {
        "status",
        "amount",
        "currency",
        "reference",
        "method",
        "created_at",
        "completed_at",
        "fee",
        "channel",
        "transaction_id",
    }
    if not isinstance(payload, dict):
        return {}
    return {k: v for k, v in payload.items() if k in allowed}


def refund_order(
    order_id: int,
    *,
    reason: str = "",
    provider_refund: Callable | None = None,
) -> dict:
    """Rembourse au PSP avant de révoquer les accès locaux.

    ``provider_refund`` doit accepter ``order``, ``reason`` et
    ``idempotency_key``, puis retourner ``provider`` et ``reference``.
    """
    if provider_refund is None:
        raise NotImplementedError("Un adaptateur de remboursement PSP est requis.")

    with transaction.atomic():
        order = (
            Order.objects.select_for_update(of=("self",))
            .select_related("company", "user")
            .get(pk=order_id)
        )
        if order.status == Order.Status.REFUNDED:
            return {"ok": True, "already_refunded": True}
        if order.status not in {Order.Status.PAID, Order.Status.REFUND_FAILED}:
            return {"ok": False, "reason": f"not_paid (status={order.status})"}
        order.status = Order.Status.REFUND_PENDING
        order.save(update_fields=["status"])

    try:
        provider_result = provider_refund(
            order=order,
            reason=reason,
            idempotency_key=f"best-epargne-refund-{order.id}",
        )
        if not isinstance(provider_result, Mapping):
            raise ValueError("Réponse de remboursement PSP invalide.")
        provider = str(provider_result.get("provider") or "").strip().lower()
        reference = str(provider_result.get("reference") or "").strip()
        if not provider or not reference:
            raise ValueError("Référence de remboursement PSP manquante.")
    except Exception:
        Order.objects.filter(
            pk=order_id,
            status=Order.Status.REFUND_PENDING,
        ).update(status=Order.Status.REFUND_FAILED)
        raise

    with transaction.atomic():
        order = (
            Order.objects.select_for_update(of=("self",))
            .select_related("company", "user")
            .get(pk=order_id)
        )
        if order.status == Order.Status.REFUNDED:
            return {"ok": True, "already_refunded": True}
        if order.status != Order.Status.REFUND_PENDING:
            raise RuntimeError("État de remboursement incohérent.")

        canceled_enrollments = 0
        for item in order.items.select_related("course"):
            if (
                item.item_type == OrderItem.ItemType.COURSE
                and item.course_id
                and order.user_id
            ):
                canceled_enrollments += Enrollment.objects.filter(
                    user_id=order.user_id,
                    course_id=item.course_id,
                ).update(status=Enrollment.Status.CANCELED)

        from datetime import timedelta

        licenses_deactivated = CompanyLicense.objects.filter(
            order=order,
            valid_until__isnull=True,
        ).update(valid_until=(timezone.now() - timedelta(days=1)).date())

        PaymentTransaction.objects.create(
            order=order,
            provider=f"{provider}_refund",
            reference=reference,
            status=PaymentTransaction.Status.SUCCESS,
            amount=order.total,
            currency=order.currency,
            raw_payload={},
        )

        order.status = Order.Status.REFUNDED
        order.save(update_fields=["status"])

        return {
            "ok": True,
            "canceled_enrollments": canceled_enrollments,
            "licenses_deactivated": licenses_deactivated,
        }
