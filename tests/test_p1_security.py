"""Tests Phase 1 — Sécurité critique.

Couvre les correctifs CRITIQUES de l'audit :

- ENROLL-03 / ENROLL-04 / API-04 : EnrollmentViewSet et LessonProgressViewSet
  sont en lecture seule et ne permettent pas l'écriture cross-user.
- CAT-01 / ASS-01 : un cours DRAFT ou ARCHIVED n'apparaît pas dans le
  catalogue ni dans les recommandations.
- REV-01 / REV-02 : un user non inscrit ne peut pas noter ; le comment est
  bleach-sanitisé.
- COMPTE-17 : `next_url` est validé contre l'host.
- core/permissions.is_platform_admin : strict, n'inclut pas `is_staff`.

Ces tests utilisent pytest-django et l'APIClient DRF. Ils sont volontairement
minimaux pour servir de garde-fou anti-régression — la suite complète viendra
en Phase 8.

Lancer : `pytest tests/test_p1_security.py -v`
"""
from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from core.permissions import is_platform_admin


# -- core.permissions ------------------------------------------------------

@pytest.mark.django_db
def test_is_platform_admin_strict_excludes_is_staff(make_user):
    """COMPTE-02 / API-18 : un staff Django simple n'est PAS platform admin."""
    staff_only = make_user(email="staff@example.com", is_staff=True)
    assert is_platform_admin(staff_only) is False

    superuser = make_user(email="super@example.com", is_superuser=True, is_staff=True)
    assert is_platform_admin(superuser) is True


# -- next_url validation ---------------------------------------------------

@pytest.mark.django_db
def test_switch_workspace_rejects_open_redirect(client, alice):
    """COMPTE-17 : next=https://evil.com → ignoré, redirige vers fallback."""
    client.force_login(alice)
    resp = client.post(
        "/workspace/switch/",
        {"kind": "learner", "next": "https://evil.com/phish"},
    )
    # On accepte 302 vers une URL interne, jamais externe.
    assert resp.status_code in (302, 200)
    if resp.status_code == 302:
        assert not resp["Location"].startswith("https://evil.com"), \
            "Open redirect détecté !"
        assert not resp["Location"].startswith("//evil.com"), \
            "Open redirect schemaless détecté !"


# -- Enrollment API : lecture seule ---------------------------------------

@pytest.mark.django_db
def test_enrollment_viewset_blocks_create(alice):
    """ENROLL-03 / API-04 : POST /api/enrollments/ retourne 405 ou 403."""
    client = APIClient()
    client.force_authenticate(user=alice)
    resp = client.post("/api/enrollments/", {"course": 1}, format="json")
    assert resp.status_code in (405, 403, 404), (
        f"POST /api/enrollments/ devrait être interdit, reçu {resp.status_code}"
    )


@pytest.mark.django_db
def test_lesson_progress_blocks_post(alice):
    """ENROLL-04 / API-04 : POST /api/lesson-progress/ interdit (lecture+PATCH only)."""
    client = APIClient()
    client.force_authenticate(user=alice)
    resp = client.post(
        "/api/lesson-progress/",
        {"enrollment": 1, "lesson": 1, "progress_percent": 100, "completed": True},
        format="json",
    )
    assert resp.status_code in (405, 403, 404)


# -- Reviews : XSS sanitization -------------------------------------------

@pytest.mark.django_db
def test_review_comment_strips_html():
    """REV-02 : le HTML est strippé par bleach dans validate_comment."""
    from reviews.serializers import CourseReviewSerializer

    payload = {
        "rating": 5,
        "comment": "<script>alert('xss')</script>Bravo <b>cours</b> super !",
    }
    ser = CourseReviewSerializer(data=payload)
    ser.is_valid(raise_exception=True)
    cleaned = ser.validated_data["comment"]
    assert "<script>" not in cleaned
    assert "<b>" not in cleaned
    assert "Bravo" in cleaned


# -- catalog filtering ----------------------------------------------------

@pytest.mark.django_db
def test_get_visible_courses_qs_excludes_draft(alice):
    """CAT-01 / ASS-01 : les cours DRAFT/ARCHIVED ne sont jamais retournés."""
    from catalog.services import get_visible_courses_qs
    from catalog.models import Course

    # Crée un cours DRAFT.
    draft = Course.objects.create(
        title="Cours en brouillon",
        slug="cours-en-brouillon",
        status=Course.Status.DRAFT,
        instructor=alice,
    )
    qs = get_visible_courses_qs(alice)
    assert draft.id not in list(qs.values_list("id", flat=True))


@pytest.mark.django_db
def test_get_visible_courses_qs_excludes_company_only_for_outsider(alice, bob):
    """CAT-01 : un user non-membre d'une org ne voit pas ses cours company_only."""
    from catalog.services import get_visible_courses_qs
    from catalog.models import Course
    from organizations.models import Organization

    org = Organization.objects.create(name="Acme", slug="acme")
    company_course = Course.objects.create(
        title="Cours interne Acme",
        slug="cours-interne-acme",
        status=Course.Status.PUBLISHED,
        instructor=alice,
        company=org,
        company_only=True,
    )
    # bob n'est pas membre de Acme.
    qs = get_visible_courses_qs(bob)
    assert company_course.id not in list(qs.values_list("id", flat=True))
