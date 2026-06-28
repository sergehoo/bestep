"""Tests V8.D — core/permissions et résolution dashboard URL."""
from __future__ import annotations

import pytest


@pytest.mark.django_db
def test_is_platform_admin_excludes_is_staff(make_user):
    """core.permissions.is_platform_admin doit être STRICT (pas is_staff)."""
    from core.permissions import is_platform_admin

    staff_only = make_user(email="staff@example.com", is_staff=True)
    assert is_platform_admin(staff_only) is False

    superuser = make_user(email="su@example.com", is_superuser=True, is_staff=True)
    assert is_platform_admin(superuser) is True


@pytest.mark.django_db
def test_can_view_course_blocks_draft_for_anonymous():
    """CAT-01 : un cours DRAFT n'est jamais visible publiquement."""
    from django.contrib.auth.models import AnonymousUser

    from catalog.models import Course
    from core.permissions import can_view_course

    course = Course(title="x", slug="x", status=Course.Status.DRAFT)
    assert can_view_course(AnonymousUser(), course) is False


@pytest.mark.django_db
def test_can_view_course_company_only_blocks_outsider(alice, bob):
    """Un user non-membre d'une org ne peut pas voir un cours company_only."""
    from catalog.models import Course
    from core.permissions import can_view_course
    from organizations.models import Organization

    org = Organization.objects.create(name="ScopeOrg", slug="scope-org")
    course = Course.objects.create(
        title="Interne", slug="interne",
        status=Course.Status.PUBLISHED,
        instructor=alice, company=org, company_only=True,
    )
    # Bob n'est pas membre.
    assert can_view_course(bob, course) is False


@pytest.mark.django_db
def test_can_modify_progress_blocks_cross_user(alice, bob):
    """ENROLL-04 : un user ne peut pas modifier la progression d'autrui."""
    from catalog.models import Course
    from core.permissions import can_modify_progress
    from enrollments.models import Enrollment

    # Crée un cours + Lesson minimal (pas obligé de créer Section).
    course = Course.objects.create(title="c", slug="c", status=Course.Status.PUBLISHED, instructor=alice)
    e_alice = Enrollment.objects.create(user=alice, course=course)

    # Un LessonProgress factice — on ne crée pas vraiment de Lesson pour
    # simplifier le test ; on mock la relation.
    class FakeLP:
        enrollment = e_alice
    assert can_modify_progress(alice, FakeLP()) is True
    assert can_modify_progress(bob, FakeLP()) is False


@pytest.mark.django_db
def test_resolve_user_dashboard_url_anonymous(client):
    """Anonyme → account_login."""
    from django.contrib.auth.models import AnonymousUser

    from compte.services import resolve_user_dashboard_url

    assert resolve_user_dashboard_url(AnonymousUser()) == "account_login"


@pytest.mark.django_db
def test_resolve_user_dashboard_url_superuser(make_user):
    """Superuser → admin_dashboard."""
    from compte.services import resolve_user_dashboard_url

    su = make_user(email="su2@example.com", is_superuser=True, is_staff=True)
    assert resolve_user_dashboard_url(su) == "admin_dashboard"


@pytest.mark.django_db
def test_resolve_user_dashboard_url_default_learner(alice):
    """User sans rôle particulier → learner:dashboard."""
    from compte.services import resolve_user_dashboard_url

    assert resolve_user_dashboard_url(alice) == "learner:dashboard"
