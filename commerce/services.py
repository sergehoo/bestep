from __future__ import annotations
from decimal import Decimal
from django.db import transaction
from django.utils import timezone

from enrollments.models import Enrollment
from catalog.models import Course
from .models import Order, OrderItem, PaymentTransaction, CompanyLicense


def recalc_order_totals(order: Order) -> Order:
    subtotal = Decimal("0")
    for it in order.items.all():
        it.line_total = (it.unit_price or 0) * (it.seats_qty if it.item_type == OrderItem.ItemType.COMPANY_SEATS else 1)
        it.save(update_fields=["line_total"])
        subtotal += it.line_total

    discount_total = Decimal("0")
    if order.coupon and order.coupon.is_active:
        c = order.coupon
        if c.percent_off:
            discount_total = (subtotal * Decimal(c.percent_off) / Decimal("100")).quantize(Decimal("0.01"))
        elif c.amount_off:
            discount_total = min(subtotal, c.amount_off)

    order.subtotal = subtotal
    order.discount_total = discount_total
    order.total = max(Decimal("0"), subtotal - discount_total)
    order.save(update_fields=["subtotal", "discount_total", "total"])
    return order


@transaction.atomic
def enroll_on_payment_success(order: Order) -> dict:
    """
    Crée les enrollments (B2C) et/ou licences (B2B) après paiement.
    Return: dict summary
    """
    if order.status == Order.Status.PAID:
        return {"ok": True, "already_paid": True}

    order.status = Order.Status.PAID
    order.paid_at = timezone.now()
    order.save(update_fields=["status", "paid_at"])

    created_enrollments = 0
    created_licenses = 0

    for it in order.items.select_related("course"):
        if it.item_type == OrderItem.ItemType.COURSE and it.course_id:
            # B2C enrollment
            Enrollment.objects.get_or_create(
                user=order.user,
                course=it.course,
                defaults={"source": Enrollment.Source.B2C},
            )
            created_enrollments += 1

        elif it.item_type == OrderItem.ItemType.COMPANY_SEATS and order.company_id:
            # B2B license
            CompanyLicense.objects.create(
                company=order.company,
                seats_total=it.seats_qty,
                seats_used=0,
                valid_until=None,
            )
            created_licenses += 1

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
