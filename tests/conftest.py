"""Pytest fixtures partagées pour les tests Phase 1."""
from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model

User = get_user_model()


@pytest.fixture
def make_user(db):
    """Factory de User minimaliste."""
    def _make(email="alice@example.com", password="StrongPa$$word12", **extra):
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
