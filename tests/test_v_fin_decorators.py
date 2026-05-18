"""Tests V_FIN.C — Decorators platform_admin / org_admin (SEC-06)."""
from __future__ import annotations

import pytest
from django.core.exceptions import PermissionDenied
from django.http import HttpResponse


def _dummy_view(request, *args, **kwargs):
    return HttpResponse("ok")


@pytest.mark.django_db
def test_platform_admin_required_blocks_regular_user(rf, alice):
    """Un user ordinaire est bloqué (PermissionDenied)."""
    from core.decorators import platform_admin_required

    request = rf.get("/dashboard/admin/")
    request.user = alice

    view = platform_admin_required(_dummy_view)
    with pytest.raises(PermissionDenied):
        view(request)


@pytest.mark.django_db
def test_platform_admin_required_allows_superuser(rf, make_user):
    """Un superuser passe."""
    from core.decorators import platform_admin_required

    su = make_user(email="su@example.com", is_superuser=True, is_staff=True)
    request = rf.get("/dashboard/admin/")
    request.user = su

    view = platform_admin_required(_dummy_view)
    resp = view(request)
    assert resp.status_code == 200


@pytest.mark.django_db
def test_platform_admin_required_blocks_is_staff_only(rf, make_user):
    """SEC-06 strict : is_staff=True SEUL ne suffit pas (ce n'est pas un admin métier)."""
    from core.decorators import platform_admin_required

    staff_only = make_user(email="staffmember@example.com", is_staff=True)
    request = rf.get("/dashboard/admin/")
    request.user = staff_only

    view = platform_admin_required(_dummy_view)
    with pytest.raises(PermissionDenied):
        view(request)


@pytest.mark.django_db
def test_org_admin_required_for_id_denies_outsider(rf, alice):
    """Un user non-membre de l'org doit être bloqué."""
    from organizations.models import Organization
    from core.decorators import org_admin_required_for_id

    org = Organization.objects.create(name="DecoOrg", slug="deco-org")

    request = rf.get(f"/organisation/{org.id}/members/")
    request.user = alice

    @org_admin_required_for_id("organization_id")
    def view(request, organization_id):
        return HttpResponse("ok")

    with pytest.raises(PermissionDenied):
        view(request, organization_id=org.id)


@pytest.mark.django_db
def test_org_admin_required_for_id_allows_admin(rf, alice):
    """Un OWNER de l'org passe."""
    from organizations.models import Organization, OrganizationMembership
    from core.decorators import org_admin_required_for_id

    org = Organization.objects.create(name="DecoOrg2", slug="deco-org-2")
    OrganizationMembership.objects.create(
        user=alice, organization=org,
        role=OrganizationMembership.Role.OWNER, is_active=True,
    )

    request = rf.get(f"/organisation/{org.id}/members/")
    request.user = alice

    @org_admin_required_for_id("organization_id")
    def view(request, organization_id):
        return HttpResponse("ok")

    resp = view(request, organization_id=org.id)
    assert resp.status_code == 200
