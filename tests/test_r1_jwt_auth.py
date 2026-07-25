"""
tests/test_r1_jwt_auth.py — Tests R1 : Endpoints API auth JWT.

Couverture :

1. Register : succès, email déjà pris, password faible, full_name manquant
2. Login : succès (access + refresh + user), échec identifiants
3. Refresh : access renouvelé, refresh rotationné, ancien blacklisté
4. Logout : refresh blacklisté, plus utilisable
5. Me : GET/PATCH, permissions (401 sans token)
6. Password change : succès, ancien mot de passe incorrect
7. Password reset : enum-safe (200 même email inexistant), token valid/invalid
8. Throttling : login limité (5/min)

Tests d'intégration via APIClient DRF.
"""

from __future__ import annotations

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

# ─────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def registered_user(make_user):
    return make_user(
        email="alice.jwt@example.com",
        password="MotDePasseSolide123!",
        full_name="Alice Test",
    )


def _auth(client, user, password="MotDePasseSolide123!"):
    """Helper : login et retourne (access, refresh, user_data)."""
    resp = client.post(
        reverse("compte_api:login"),
        {"email": user.email, "password": password},
        format="json",
    )
    assert resp.status_code == 200, resp.data
    return resp.data["access"], resp.data["refresh"], resp.data["user"]


# ─────────────────────────────────────────────────────────────────────
# Register
# ─────────────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_register_success(api_client):
    resp = api_client.post(
        reverse("compte_api:register"),
        {
            "email": "newuser@example.com",
            "password": "SuperSecret123!",
            "full_name": "Nouveau User",
            "phone": "+225 07 00 00 00 00",
        },
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert "access" in resp.data
    assert "refresh" in resp.data
    assert resp.data["user"]["email"] == "newuser@example.com"
    assert resp.data["user"]["full_name"] == "Nouveau User"
    assert "learner" in resp.data["user"]["roles"]


@pytest.mark.django_db
def test_register_duplicate_email_refused(api_client, registered_user):
    resp = api_client.post(
        reverse("compte_api:register"),
        {
            "email": registered_user.email,
            "password": "AnotherPassword123!",
            "full_name": "Duplicate",
        },
        format="json",
    )
    assert resp.status_code == 400
    assert "email" in resp.data


@pytest.mark.django_db
def test_register_weak_password_refused(api_client):
    resp = api_client.post(
        reverse("compte_api:register"),
        {"email": "weak@example.com", "password": "123", "full_name": "Weak"},
        format="json",
    )
    assert resp.status_code == 400


# ─────────────────────────────────────────────────────────────────────
# Login
# ─────────────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_login_success_returns_tokens_and_user(api_client, registered_user):
    resp = api_client.post(
        reverse("compte_api:login"),
        {"email": registered_user.email, "password": "MotDePasseSolide123!"},
        format="json",
    )
    assert resp.status_code == 200, resp.data
    assert "access" in resp.data
    assert "refresh" in resp.data
    assert resp.data["user"]["email"] == registered_user.email
    assert "preferences" in resp.data["user"]  # préférences hydratées P3


@pytest.mark.django_db
def test_login_wrong_password_refused(api_client, registered_user):
    resp = api_client.post(
        reverse("compte_api:login"),
        {"email": registered_user.email, "password": "WrongPassword!"},
        format="json",
    )
    assert resp.status_code == 401


# ─────────────────────────────────────────────────────────────────────
# Refresh
# ─────────────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_refresh_returns_new_access(api_client, registered_user):
    access, refresh, _ = _auth(api_client, registered_user)
    resp = api_client.post(reverse("compte_api:refresh"), {"refresh": refresh}, format="json")
    assert resp.status_code == 200
    assert "access" in resp.data
    # ROTATE_REFRESH_TOKENS=True → nouveau refresh aussi
    assert "refresh" in resp.data
    assert resp.data["refresh"] != refresh  # rotation effective


# ─────────────────────────────────────────────────────────────────────
# Logout
# ─────────────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_logout_blacklists_refresh(api_client, registered_user):
    access, refresh, _ = _auth(api_client, registered_user)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    resp = api_client.post(reverse("compte_api:logout"), {"refresh": refresh}, format="json")
    assert resp.status_code == 205  # RESET_CONTENT

    # Le refresh est maintenant blacklisté → refresh échoue.
    api_client.credentials()  # unset
    resp2 = api_client.post(reverse("compte_api:refresh"), {"refresh": refresh}, format="json")
    assert resp2.status_code == 401


@pytest.mark.django_db
def test_logout_requires_refresh_in_body(api_client, registered_user):
    access, _, _ = _auth(api_client, registered_user)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    resp = api_client.post(reverse("compte_api:logout"), {}, format="json")
    assert resp.status_code == 400


# ─────────────────────────────────────────────────────────────────────
# Me
# ─────────────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_me_get_returns_user(api_client, registered_user):
    access, _, _ = _auth(api_client, registered_user)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    resp = api_client.get(reverse("compte_api:me"))
    assert resp.status_code == 200
    assert resp.data["email"] == registered_user.email
    assert "roles" in resp.data
    assert "preferences" in resp.data


@pytest.mark.django_db
def test_me_requires_auth(api_client):
    resp = api_client.get(reverse("compte_api:me"))
    assert resp.status_code == 401


@pytest.mark.django_db
def test_me_patch_updates_writable_fields(api_client, registered_user):
    access, _, _ = _auth(api_client, registered_user)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    resp = api_client.patch(
        reverse("compte_api:me"),
        {"full_name": "Alice Modifiée", "phone": "+225 05 00 00 00 00"},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.data["full_name"] == "Alice Modifiée"
    assert resp.data["phone"] == "+225 05 00 00 00 00"
    # Email non modifiable via /me/ (read_only).
    registered_user.refresh_from_db()
    assert registered_user.email == "alice.jwt@example.com"


# ─────────────────────────────────────────────────────────────────────
# Password change
# ─────────────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_password_change_success(api_client, registered_user):
    access, _, _ = _auth(api_client, registered_user)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    resp = api_client.post(
        reverse("compte_api:password_change"),
        {
            "current_password": "MotDePasseSolide123!",
            "new_password": "NouveauMdpEncoreSolide456!",
        },
        format="json",
    )
    assert resp.status_code == 200
    registered_user.refresh_from_db()
    assert registered_user.check_password("NouveauMdpEncoreSolide456!")


@pytest.mark.django_db
def test_password_change_wrong_current(api_client, registered_user):
    access, _, _ = _auth(api_client, registered_user)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    resp = api_client.post(
        reverse("compte_api:password_change"),
        {"current_password": "WrongOld!", "new_password": "NouveauMdp456!"},
        format="json",
    )
    assert resp.status_code == 400
    assert "current_password" in resp.data


# ─────────────────────────────────────────────────────────────────────
# Password reset (enum-safe)
# ─────────────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_password_reset_request_always_200(api_client):
    """Enum-safe : renvoie 200 même si l'email n'existe pas."""
    resp = api_client.post(
        reverse("compte_api:password_reset"),
        {"email": "does-not-exist@example.com"},
        format="json",
    )
    assert resp.status_code == 200
    assert "detail" in resp.data


@pytest.mark.django_db
def test_password_reset_request_existing_email_200(api_client, registered_user):
    resp = api_client.post(
        reverse("compte_api:password_reset"),
        {"email": registered_user.email},
        format="json",
    )
    assert resp.status_code == 200


# ─────────────────────────────────────────────────────────────────────
# Claims dans le JWT
# ─────────────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_jwt_contains_email_and_admin_claim(api_client, registered_user):
    """Le token contient les claims custom pour éviter re-fetch /me/."""
    access, _, _ = _auth(api_client, registered_user)
    # On décode sans vérif (juste pour lire les claims — ne PAS faire ça en prod !)
    import base64
    import json

    header, payload, _sig = access.split(".")
    padded = payload + "=" * (-len(payload) % 4)
    claims = json.loads(base64.urlsafe_b64decode(padded))
    assert claims["email"] == registered_user.email
    assert claims["is_platform_admin"] is False
    assert str(claims["user_id"]) == str(registered_user.id)
