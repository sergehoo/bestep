"""commerce/urls.py — CORRECTIF V2.C (COM-06).

Avant : ``urlpatterns = []`` ; aucune surface externe pour commerce.
Après : endpoints checkout, order pending, webhooks PSP par provider.
"""
from __future__ import annotations

from django.urls import path

from .views import CheckoutView, order_pending, webhook_handler

app_name = "commerce"

urlpatterns = [
    path("checkout/", CheckoutView.as_view(), name="checkout"),
    path("orders/<int:order_id>/pending/", order_pending, name="order_pending"),
    path("webhooks/<str:provider>/", webhook_handler, name="webhook"),
]
