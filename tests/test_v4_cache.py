"""Tests V4.A — Cache dashboards."""
from __future__ import annotations

import pytest


@pytest.fixture
def clear_cache():
    from django.core.cache import cache
    cache.clear()
    yield
    cache.clear()


@pytest.mark.django_db
def test_org_dashboard_kpis_returns_expected_shape(alice, clear_cache):
    from core.dashboard_kpis import get_organization_dashboard_kpis
    from organizations.models import Organization

    org = Organization.objects.create(name="DashOrg", slug="dash-org")
    payload = get_organization_dashboard_kpis(organization_id=org.id)
    # Structure attendue
    assert set(payload.keys()) >= {"courses", "members", "enrollments", "orders", "generated_at"}
    for section in ("courses", "members", "enrollments", "orders"):
        assert isinstance(payload[section], dict)


@pytest.mark.django_db
def test_org_dashboard_cache_is_invalidated_on_course_change(alice, clear_cache):
    """V4.A : la création/modification d'un Course doit invalider le cache."""
    from catalog.models import Course
    from core.dashboard_kpis import get_organization_dashboard_kpis
    from organizations.models import Organization

    org = Organization.objects.create(name="CacheOrg", slug="cache-org")

    # 1er hit → cache miss + écriture.
    p1 = get_organization_dashboard_kpis(organization_id=org.id)
    assert p1["courses"]["total"] == 0

    # Création d'un cours rattaché à org : signal invalide le cache.
    Course.objects.create(
        title="Cours dash",
        slug="cours-dash",
        status=Course.Status.PUBLISHED,
        instructor=alice,
        company=org,
    )

    # 2e hit → doit refléter le nouveau cours.
    p2 = get_organization_dashboard_kpis(organization_id=org.id)
    assert p2["courses"]["total"] == 1


@pytest.mark.django_db
def test_platform_dashboard_kpis_runs(clear_cache):
    """Smoke test : la fonction tourne sans crash sur une DB vide."""
    from core.dashboard_kpis import get_platform_dashboard_kpis

    payload = get_platform_dashboard_kpis()
    assert "users" in payload
    assert "organizations" in payload
    assert "courses" in payload
