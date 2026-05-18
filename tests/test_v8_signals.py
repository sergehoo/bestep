"""Tests V8.D — Signaux (progression + invalidation cache + sync licences)."""
from __future__ import annotations

import pytest


@pytest.fixture
def clear_cache():
    from django.core.cache import cache
    cache.clear()
    yield
    cache.clear()


@pytest.mark.django_db
def test_lesson_progress_signal_recomputes_enrollment(alice):
    """ENROLL-05 : créer un LessonProgress complet doit recompute Enrollment.progress_percent."""
    from catalog.models import Course, CourseSection, Lesson
    from enrollments.models import Enrollment, LessonProgress

    course = Course.objects.create(title="cp", slug="cp", status=Course.Status.PUBLISHED, instructor=alice)
    section = CourseSection.objects.create(course=course, title="s", order=1)
    lesson1 = Lesson.objects.create(section=section, title="l1", order=1, lesson_type="TEXT")
    lesson2 = Lesson.objects.create(section=section, title="l2", order=2, lesson_type="TEXT")
    enrollment = Enrollment.objects.create(user=alice, course=course)

    # Marque la 1re leçon complétée → progress doit passer à 50%.
    LessonProgress.objects.create(enrollment=enrollment, lesson=lesson1, completed=True, progress_percent=100)
    enrollment.refresh_from_db()
    assert enrollment.progress_percent == 50

    # Marque la 2e → 100% + status COMPLETED.
    LessonProgress.objects.create(enrollment=enrollment, lesson=lesson2, completed=True, progress_percent=100)
    enrollment.refresh_from_db()
    assert enrollment.progress_percent == 100
    assert enrollment.status == Enrollment.Status.COMPLETED


@pytest.mark.django_db
def test_company_assignment_target_creates_enrollment(alice):
    """COM-10 : créer un CompanyAssignmentTarget doit créer l'Enrollment associé."""
    from catalog.models import Course
    from commerce.models import CompanyAssignment, CompanyAssignmentTarget
    from enrollments.models import Enrollment
    from organizations.models import Organization

    org = Organization.objects.create(name="AssignOrg", slug="assign-org")
    course = Course.objects.create(title="b2b", slug="b2b", status=Course.Status.PUBLISHED, instructor=alice)
    assignment = CompanyAssignment.objects.create(company=org, course=course)

    # Avant le signal → pas d'Enrollment.
    assert not Enrollment.objects.filter(user=alice, course=course).exists()

    CompanyAssignmentTarget.objects.create(assignment=assignment, user=alice)

    # Après → Enrollment créé avec source=COMPANY.
    e = Enrollment.objects.get(user=alice, course=course)
    assert e.source == Enrollment.Source.COMPANY
    assert e.company_id == org.id


@pytest.mark.django_db
def test_company_license_seats_used_synced(alice, bob):
    """COM-09 : seats_used doit refléter le nombre de cibles distinctes."""
    from catalog.models import Course
    from commerce.models import (
        CompanyAssignment,
        CompanyAssignmentTarget,
        CompanyLicense,
    )
    from organizations.models import Organization

    org = Organization.objects.create(name="LicOrg", slug="lic-org")
    course = Course.objects.create(title="lic", slug="lic", status=Course.Status.PUBLISHED, instructor=alice)
    assignment = CompanyAssignment.objects.create(company=org, course=course)
    license = CompanyLicense.objects.create(company=org, seats_total=10, seats_used=0)

    CompanyAssignmentTarget.objects.create(assignment=assignment, user=alice)
    CompanyAssignmentTarget.objects.create(assignment=assignment, user=bob)

    license.refresh_from_db()
    assert license.seats_used == 2

    # Suppression d'une target → décrémente.
    CompanyAssignmentTarget.objects.filter(assignment=assignment, user=bob).delete()
    license.refresh_from_db()
    assert license.seats_used == 1
