from __future__ import annotations

import pytest
from django.urls import reverse

from catalog.models import Course, CourseSection, Lesson, Notification
from certifications.models import IssuedCertificate
from compte.models import InstructorProfile, LearnerProfile
from enrollments.models import Enrollment, LessonProgress


@pytest.mark.django_db
def test_learner_dashboard_exposes_real_progress(client, alice, bob):
    LearnerProfile.objects.create(user=alice)
    course = Course.objects.create(
        title="Pilotage financier",
        instructor=bob,
        status=Course.Status.PUBLISHED,
        pricing_type=Course.PricingType.FREE,
    )
    section = CourseSection.objects.create(course=course, title="Fondamentaux")
    lesson = Lesson.objects.create(section=section, title="Introduction")
    enrollment = Enrollment.objects.create(
        user=alice,
        course=course,
        current_lesson=lesson,
        progress_percent=45,
    )
    LessonProgress.objects.create(
        enrollment=enrollment,
        lesson=lesson,
        progress_percent=45,
        last_position_sec=5400,
    )
    IssuedCertificate.objects.create(user=alice, course=course, score_percent=92)

    client.force_login(alice)
    session = client.session
    session["onboarding_completed"] = True
    session.save()

    response = client.get(reverse("learner:dashboard"))

    assert response.status_code == 200
    assert response.context["kpis"] == {
        "in_progress": 1,
        "completed": 0,
        "certificates": 1,
        "total_hours": 1.5,
    }
    assert response.context["continue_enrollment"] == enrollment
    assert list(response.context["active_enrollments"]) == [enrollment]
    assert next(iter(response.context["recent_certificates"])).course == course
    assert "Pilotage financier" in response.content.decode()


@pytest.mark.django_db
def test_instructor_dashboard_matches_template_contract(client, alice):
    InstructorProfile.objects.create(user=alice)
    course = Course.objects.create(
        title="Concevoir une formation",
        instructor=alice,
        status=Course.Status.PUBLISHED,
    )
    notification = Notification.objects.create(
        user=alice,
        title="Nouvelle inscription",
        body="Un apprenant a rejoint votre cours.",
    )
    client.force_login(alice)

    response = client.get(reverse("instructor:dashboard"))

    assert response.status_code == 200
    assert response.context["kpis"]["courses"]["published"] == 1
    assert list(response.context["recent_courses"]) == [course]
    assert list(response.context["recent_activity"]) == [notification]
    page = response.content.decode()
    assert "Concevoir une formation" in page
    assert "Nouvelle inscription" in page
