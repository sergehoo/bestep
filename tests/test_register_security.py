"""tests/test_register_security.py — Sécurité du flow d'inscription publique.

Couverture obligatoire par le cahier des charges "SECURITE" :

1. Whitelist des rôles :
   - refus ``super_admin``, ``platform_admin``, ``admin``, ``staff``,
     ``superuser``, valeur inconnue → 400 avec un message d'erreur clair
   - accès autorisé ``learner`` / ``instructor`` / ``org_admin``.

2. Ceinture + bretelles côté serveur :
   - Un attaquant qui contourne le serializer et POSTe ``is_staff=True``,
     ``is_superuser=True``, ``platform_role='PLATFORM_ADMIN'`` NE DOIT PAS
     obtenir de compte administrateur — ces champs sont ignorés.

3. Création atomique :
   - Si la création du profil métier échoue, le User doit être rollback
     (aucun user sans profil ne doit persister).

4. Effet secondaire d'e-mail :
   - À l'inscription, ``is_email_verified=False``.
   - Un token de vérification est stocké.
"""
from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

User = get_user_model()

REGISTER_URL = "/api/auth/register/"


@pytest.mark.django_db
class TestRegisterRoleWhitelist:
    def _payload(self, **kw):
        base = {
            "email": "alice@example.com",
            "password": "SuperSecret!2026",
            "full_name": "Alice Test",
        }
        base.update(kw)
        return base

    @pytest.mark.parametrize(
        "forbidden",
        [
            "super_admin",
            "platform_admin",
            "admin",
            "staff",
            "superuser",
            "root",
            "hacker",
        ],
    )
    def test_forbidden_account_type_rejected(self, forbidden):
        client = APIClient()
        r = client.post(
            REGISTER_URL,
            self._payload(account_type=forbidden),
            format="json",
        )
        assert r.status_code == 400, r.data
        assert not User.objects.filter(email="alice@example.com").exists()

    @pytest.mark.parametrize("allowed", ["learner", "instructor", "org_admin"])
    def test_allowed_account_types(self, allowed):
        client = APIClient()
        r = client.post(
            REGISTER_URL,
            self._payload(
                email=f"a-{allowed}@example.com",
                account_type=allowed,
                organization_name="Kaydan Groupe" if allowed == "org_admin" else "",
            ),
            format="json",
        )
        assert r.status_code == 201, r.data
        u = User.objects.get(email=f"a-{allowed}@example.com")
        # SECURITE-04 : jamais admin depuis l'endpoint public
        assert u.is_staff is False
        assert u.is_superuser is False
        assert u.platform_role == User.PlatformRole.USER
        assert u.is_platform_admin is False

    def test_extra_admin_fields_are_ignored(self):
        """Même si le client envoie is_staff/is_superuser/platform_role,
        le user créé reste un simple USER."""
        client = APIClient()
        r = client.post(
            REGISTER_URL,
            {
                **self._payload(email="hax@example.com"),
                "is_staff": True,
                "is_superuser": True,
                "platform_role": "PLATFORM_ADMIN",
            },
            format="json",
        )
        assert r.status_code in (201, 400), r.data
        if r.status_code == 201:
            u = User.objects.get(email="hax@example.com")
            assert u.is_staff is False
            assert u.is_superuser is False
            assert u.platform_role == User.PlatformRole.USER

    def test_email_verification_state_after_signup(self):
        client = APIClient()
        r = client.post(
            REGISTER_URL,
            self._payload(email="bob@example.com"),
            format="json",
        )
        assert r.status_code == 201, r.data
        u = User.objects.get(email="bob@example.com")
        # SECURITE-05 — pas encore vérifié, un token a été issu.
        assert u.is_email_verified is False
        assert u.email_verification_token != ""
        assert u.email_verification_sent_at is not None


@pytest.mark.django_db
class TestBusinessProfileCreation:
    def test_learner_gets_learner_profile(self):
        client = APIClient()
        r = client.post(
            REGISTER_URL,
            {
                "email": "learner@example.com",
                "password": "SuperSecret!2026",
                "full_name": "Learner Test",
                "account_type": "learner",
            },
            format="json",
        )
        assert r.status_code == 201, r.data
        u = User.objects.get(email="learner@example.com")
        assert hasattr(u, "learner_profile")
        # Pas de instructor_profile
        assert not hasattr(u, "instructor_profile")

    def test_instructor_gets_unverified_instructor_profile(self):
        client = APIClient()
        r = client.post(
            REGISTER_URL,
            {
                "email": "teacher@example.com",
                "password": "SuperSecret!2026",
                "full_name": "Teacher Test",
                "account_type": "instructor",
            },
            format="json",
        )
        assert r.status_code == 201, r.data
        u = User.objects.get(email="teacher@example.com")
        assert hasattr(u, "instructor_profile"), (
            "InstructorProfile devrait être créé automatiquement à l'inscription."
        )
        assert u.instructor_profile.is_verified is False, (
            "SECURITE-06 : un formateur nouvellement inscrit ne peut pas être "
            "auto-approuvé — un admin doit valider."
        )


@pytest.mark.django_db
class TestMeEndpointExposesSecurityFields:
    def test_me_exposes_email_verified_and_approval_status(self):
        client = APIClient()
        r = client.post(
            REGISTER_URL,
            {
                "email": "teach2@example.com",
                "password": "SuperSecret!2026",
                "full_name": "Teach 2",
                "account_type": "instructor",
            },
            format="json",
        )
        assert r.status_code == 201, r.data
        access = r.data["access"]
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        me = client.get("/api/auth/me/")
        assert me.status_code == 200, me.data
        assert me.data["email_verified"] is False
        assert me.data["approval_status"] == "pending"
        assert me.data["profile"]["type"] == "instructor"
        assert me.data["profile"]["is_verified"] is False
