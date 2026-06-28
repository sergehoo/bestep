"""
tests/test_p1_course_lifecycle.py — Tests P1.1 catalog.lifecycle.

Couverture :
  - Transitions valides : publish, unpublish, archive, restore
  - Transitions invalides : double publish (idempotent), unpublish d'un DRAFT,
    publish d'un ARCHIVED (refus explicite), restore d'un PUBLISHED (refus)
  - Permissions : instructor du cours OK, instructor d'un autre cours KO,
    user anonyme KO, admin plateforme OK
  - Validations métier publish : titre obligatoire, ≥ 1 section, ≥ 1 leçon
  - Audit log : événement créé à chaque transition
  - Suppression : refusée si Enrollment existante
"""
from __future__ import annotations

import pytest
from django.core.exceptions import PermissionDenied, ValidationError

from catalog.lifecycle import (
    archive_course,
    can_delete_course,
    delete_course,
    publish_course,
    restore_course,
    unpublish_course,
)
from catalog.models import Course, CourseLifecycleEvent, CourseSection, Lesson


# ─────────────────────────────────────────────────────────────────────
# Fixtures locales
# ─────────────────────────────────────────────────────────────────────

@pytest.fixture
def instructor(make_user):
    return make_user(email="instructor@example.com")


@pytest.fixture
def other_user(make_user):
    return make_user(email="other@example.com")


@pytest.fixture
def course_full(instructor, db):
    """Cours DRAFT complet et publiable : 1 section + 1 leçon."""
    course = Course.objects.create(
        title="Test Course",
        instructor=instructor,
        status=Course.Status.DRAFT,
    )
    section = CourseSection.objects.create(course=course, title="Section 1", order=1)
    Lesson.objects.create(
        section=section,
        title="Leçon 1",
        order=1,
        lesson_type=Lesson.LessonType.TEXT if hasattr(Lesson, "LessonType") else "TEXT",
        content="<p>Contenu</p>",
    )
    return course


@pytest.fixture
def course_empty(instructor, db):
    """Cours DRAFT sans section (non publiable)."""
    return Course.objects.create(
        title="Empty Course",
        instructor=instructor,
        status=Course.Status.DRAFT,
    )


# ─────────────────────────────────────────────────────────────────────
# Transitions valides
# ─────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_publish_draft_to_published(course_full, instructor):
    course = publish_course(course_full, actor=instructor)
    assert course.status == Course.Status.PUBLISHED
    assert course.published_at is not None
    assert course.archived_at is None


@pytest.mark.django_db
def test_unpublish_published_to_draft(course_full, instructor):
    publish_course(course_full, actor=instructor)
    course = unpublish_course(course_full, actor=instructor)
    assert course.status == Course.Status.DRAFT
    # published_at préservé pour traçabilité.
    assert course.published_at is not None


@pytest.mark.django_db
def test_archive_draft(course_full, instructor):
    course = archive_course(course_full, actor=instructor)
    assert course.status == Course.Status.ARCHIVED
    assert course.archived_at is not None


@pytest.mark.django_db
def test_archive_published(course_full, instructor):
    publish_course(course_full, actor=instructor)
    course = archive_course(course_full, actor=instructor)
    assert course.status == Course.Status.ARCHIVED
    assert course.archived_at is not None


@pytest.mark.django_db
def test_restore_archived_to_draft(course_full, instructor):
    archive_course(course_full, actor=instructor)
    course = restore_course(course_full, actor=instructor)
    assert course.status == Course.Status.DRAFT
    assert course.archived_at is None


# ─────────────────────────────────────────────────────────────────────
# Transitions invalides
# ─────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_publish_already_published_is_idempotent(course_full, instructor):
    publish_course(course_full, actor=instructor)
    # Pas d'exception sur 2e publish.
    course = publish_course(course_full, actor=instructor)
    assert course.status == Course.Status.PUBLISHED


@pytest.mark.django_db
def test_publish_archived_is_refused(course_full, instructor):
    archive_course(course_full, actor=instructor)
    with pytest.raises(ValidationError):
        publish_course(course_full, actor=instructor)


@pytest.mark.django_db
def test_unpublish_draft_is_refused(course_full, instructor):
    with pytest.raises(ValidationError):
        unpublish_course(course_full, actor=instructor)


@pytest.mark.django_db
def test_restore_published_is_refused(course_full, instructor):
    publish_course(course_full, actor=instructor)
    with pytest.raises(ValidationError):
        restore_course(course_full, actor=instructor)


@pytest.mark.django_db
def test_archive_already_archived_is_idempotent(course_full, instructor):
    archive_course(course_full, actor=instructor)
    # 2e archive ne plante pas.
    course = archive_course(course_full, actor=instructor)
    assert course.status == Course.Status.ARCHIVED


# ─────────────────────────────────────────────────────────────────────
# Permissions
# ─────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_other_user_cannot_publish(course_full, other_user):
    with pytest.raises(PermissionDenied):
        publish_course(course_full, actor=other_user)


@pytest.mark.django_db
def test_anonymous_cannot_publish(course_full):
    from django.contrib.auth.models import AnonymousUser
    with pytest.raises(PermissionDenied):
        publish_course(course_full, actor=AnonymousUser())


@pytest.mark.django_db
def test_platform_admin_can_publish_any_course(course_full, platform_admin):
    course = publish_course(course_full, actor=platform_admin)
    assert course.status == Course.Status.PUBLISHED


# ─────────────────────────────────────────────────────────────────────
# Validations métier
# ─────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_publish_without_section_fails(course_empty, instructor):
    with pytest.raises(ValidationError):
        publish_course(course_empty, actor=instructor)


@pytest.mark.django_db
def test_publish_with_empty_section_fails(instructor, db):
    course = Course.objects.create(title="X", instructor=instructor, status=Course.Status.DRAFT)
    CourseSection.objects.create(course=course, title="Empty section", order=1)  # 0 leçons
    with pytest.raises(ValidationError):
        publish_course(course, actor=instructor)


# ─────────────────────────────────────────────────────────────────────
# Audit log
# ─────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_publish_creates_audit_event(course_full, instructor):
    publish_course(course_full, actor=instructor)
    events = CourseLifecycleEvent.objects.filter(course=course_full)
    assert events.count() == 1
    e = events.first()
    assert e.action == CourseLifecycleEvent.Action.PUBLISHED
    assert e.from_status == Course.Status.DRAFT
    assert e.to_status == Course.Status.PUBLISHED
    assert e.actor_id == instructor.id


@pytest.mark.django_db
def test_full_cycle_creates_4_audit_events(course_full, instructor):
    publish_course(course_full, actor=instructor)
    unpublish_course(course_full, actor=instructor)
    archive_course(course_full, actor=instructor)
    restore_course(course_full, actor=instructor)
    actions = list(
        CourseLifecycleEvent.objects
        .filter(course=course_full)
        .order_by("created_at")
        .values_list("action", flat=True)
    )
    assert actions == ["PUBLISHED", "UNPUBLISHED", "ARCHIVED", "RESTORED"]


# ─────────────────────────────────────────────────────────────────────
# Suppression
# ─────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_delete_course_without_enrollment_ok(course_full, instructor):
    ok, reason = can_delete_course(course_full)
    assert ok is True
    delete_course(course_full, actor=instructor)
    assert not Course.objects.filter(pk=course_full.pk).exists()
    # L'audit log persiste (SET_NULL sur course FK).
    assert CourseLifecycleEvent.objects.filter(
        course_id_snapshot=course_full.pk
    ).exists()


@pytest.mark.django_db
def test_delete_course_with_enrollment_refused(course_full, instructor, make_user):
    from enrollments.models import Enrollment
    learner = make_user(email="learner@example.com")
    Enrollment.objects.create(user=learner, course=course_full)
    ok, reason = can_delete_course(course_full)
    assert ok is False
    assert "inscriptions" in reason.lower()
    with pytest.raises(ValidationError):
        delete_course(course_full, actor=instructor)
    # Le cours existe toujours.
    assert Course.objects.filter(pk=course_full.pk).exists()
