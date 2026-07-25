"""Pytest fixtures partagées pour les tests Phase 1."""

from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache

User = get_user_model()


@pytest.fixture(autouse=True)
def isolate_test_cache():
    """Chaque test démarre avec un cache propre, sans désactiver le throttling."""
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def make_user(db):
    """Factory de User minimaliste.

    SECURITE-05 — par défaut on considère l'utilisateur comme vérifié pour
    ne pas casser les tests existants. Les tests spécifiques à la
    vérification e-mail passent explicitement ``is_email_verified=False``.
    """

    def _make(email="alice@example.com", password="StrongPa$$word12", **extra):
        extra.setdefault("is_email_verified", True)
        return User.objects.create_user(email=email, password=password, **extra)

    return _make


@pytest.fixture
def alice(make_user):
    return make_user(email="alice@example.com")


@pytest.fixture
def bob(make_user):
    return make_user(email="bob@example.com")


@pytest.fixture
def platform_admin(make_user):
    u = make_user(email="admin@example.com", is_superuser=True, is_staff=True)
    return u


@pytest.fixture
def rf():
    """RequestFactory pour les tests de decorators."""
    from django.test import RequestFactory

    return RequestFactory()
