"""Contrat des aperçus multiples pour les leçons d'un cours."""

from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from catalog.models import Course, CourseSection, Lesson
from compte.models import InstructorProfile

User = get_user_model()


@pytest.fixture
def instructor(db):
    user = User.objects.create_user(
        email="preview-instructor@example.com",
        password="StrongPa$$word12",
        is_email_verified=True,
    )
    InstructorProfile.objects.create(user=user)
    return user


@pytest.fixture
def course(instructor):
    return Course.objects.create(
        title="Cours avec aperçus multiples",
        instructor=instructor,
        status=Course.Status.PUBLISHED,
    )


@pytest.fixture
def section(course):
    return CourseSection.objects.create(course=course, title="Introduction", order=1)


@pytest.fixture
def api(instructor):
    client = APIClient()
    client.force_authenticate(user=instructor)
    return client


def _create_url(course: Course, section: CourseSection) -> str:
    return f"/api/instructor/courses/{course.id}/sections/{section.id}/lessons/create/"


def _update_url(course: Course, section: CourseSection, lesson: Lesson) -> str:
    return (
        f"/api/instructor/courses/{course.id}/sections/{section.id}/" f"lessons/{lesson.id}/update/"
    )


@pytest.mark.parametrize("existing_preview_count", [1, 2, 5])
def test_creating_preview_preserves_all_existing_previews(
    api,
    course,
    section,
    existing_preview_count,
):
    for order in range(1, existing_preview_count + 1):
        Lesson.objects.create(
            section=section,
            title=f"Aperçu existant {order}",
            order=order,
            is_preview=True,
        )

    response = api.post(
        _create_url(course, section),
        {"title": "Nouvel aperçu", "is_preview": True},
        format="json",
    )

    assert response.status_code == 201, response.content
    assert Lesson.objects.filter(section__course=course, is_preview=True).count() == (
        existing_preview_count + 1
    )


def test_enabling_preview_preserves_other_preview(api, course, section):
    existing_preview = Lesson.objects.create(
        section=section,
        title="Aperçu existant",
        order=1,
        is_preview=True,
    )
    target = Lesson.objects.create(
        section=section,
        title="Leçon privée",
        order=2,
        is_preview=False,
    )

    response = api.post(
        _update_url(course, section, target),
        {"is_preview": True},
        format="json",
    )

    assert response.status_code == 200, response.content
    existing_preview.refresh_from_db()
    target.refresh_from_db()
    assert existing_preview.is_preview is True
    assert target.is_preview is True


def test_disabling_preview_only_changes_target(api, course, section):
    target = Lesson.objects.create(
        section=section,
        title="Aperçu à désactiver",
        order=1,
        is_preview=True,
    )
    preserved = Lesson.objects.create(
        section=section,
        title="Aperçu à conserver",
        order=2,
        is_preview=True,
    )

    response = api.post(
        _update_url(course, section, target),
        {"is_preview": False},
        format="json",
    )

    assert response.status_code == 200, response.content
    target.refresh_from_db()
    preserved.refresh_from_db()
    assert target.is_preview is False
    assert preserved.is_preview is True


def test_other_instructor_cannot_change_preview(course, section):
    lesson = Lesson.objects.create(
        section=section,
        title="Aperçu protégé",
        order=1,
        is_preview=False,
    )
    other = User.objects.create_user(
        email="other-preview-instructor@example.com",
        password="StrongPa$$word12",
        is_email_verified=True,
    )
    InstructorProfile.objects.create(user=other)
    client = APIClient()
    client.force_authenticate(user=other)

    response = client.post(
        _update_url(course, section, lesson),
        {"is_preview": True},
        format="json",
    )

    assert response.status_code == 404
    lesson.refresh_from_db()
    assert lesson.is_preview is False


def test_public_preview_contract_remains_per_lesson(course, section):
    previews = [
        Lesson.objects.create(
            section=section,
            title=f"Aperçu public {order}",
            order=order,
            is_preview=True,
        )
        for order in (1, 2)
    ]
    private_lesson = Lesson.objects.create(
        section=section,
        title="Leçon privée",
        order=3,
        is_preview=False,
    )
    client = APIClient()

    for lesson in previews:
        response = client.get(f"/api/public/courses/{course.slug}/lessons/{lesson.id}/preview/")
        assert response.status_code == 200, response.content

    private_response = client.get(
        f"/api/public/courses/{course.slug}/lessons/{private_lesson.id}/preview/"
    )
    assert private_response.status_code == 403
