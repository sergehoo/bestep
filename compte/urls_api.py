"""
compte/urls_api.py — R1 : Routes API auth JWT.

Inclus dans best_epargne/apis/api_urls.py sous ``/api/auth/``.

Endpoints exposés :

    POST /api/auth/register/
    POST /api/auth/login/
    POST /api/auth/refresh/
    POST /api/auth/logout/
    GET  /api/auth/me/
    PATCH /api/auth/me/
    POST /api/auth/password/change/
    POST /api/auth/password/reset/
    POST /api/auth/password/reset/confirm/
"""
from __future__ import annotations

from django.urls import path

from compte.api_auth import (
    LoginView,
    LogoutView,
    MeView,
    PasswordChangeView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    RefreshView,
    RegisterView,
)

app_name = "compte_api"

urlpatterns = [
    # ── Inscription / connexion ─────────────────────────────
    path("register/", RegisterView.as_view(), name="register"),
    path("login/", LoginView.as_view(), name="login"),
    path("refresh/", RefreshView.as_view(), name="refresh"),
    path("logout/", LogoutView.as_view(), name="logout"),

    # ── Profil connecté ─────────────────────────────────────
    path("me/", MeView.as_view(), name="me"),

    # ── Mot de passe ─────────────────────────────────────────
    path("password/change/", PasswordChangeView.as_view(), name="password_change"),
    path("password/reset/", PasswordResetRequestView.as_view(), name="password_reset"),
    path(
        "password/reset/confirm/",
        PasswordResetConfirmView.as_view(),
        name="password_reset_confirm",
    ),
]
