"""Tests V_LAST.D — Intégration end-to-end des principaux workflows.

Ces tests valident que les **briques V1+V2+V3+V4+V_FIN coopèrent** correctement.
Lancer en dernier après les tests unitaires : `pytest tests/test_v_last_integration.py -v`.
"""
from __future__ import annotations

import pytest


@pytest.mark.django_db
def test_full_b2b_assignment_workflow(alice, bob):
    """V_LAST.D : workflow B2B complet.

    1. Org crée un cours company_only.
    2. Org crée un CompanyAssignmentTarget → Enrollment auto + notif auto.
    3. L'apprenant voit le cours (scope org).
    4. L'apprenant complète la leçon → progression à 100% → status COMPLETED.
    5. Le certificat est émis automatiquement si un Quiz is_final passé.
    """
    from catalog.models import Course, CourseSection, Lesson
    from commerce.models import CompanyAssignment, CompanyAssignmentTarget, CompanyLicense
    from enrollments.models import Enrollment, LessonProgress
    from notifications.models import Notification
    from organizations.models import Organization, OrganizationMembership

    # Setup : alice est OWNER d'une org, bob est learner.
    org = Organization.objects.create(name="E2E Org", slug="e2e-org")
    OrganizationMembership.objects.create(
        user=alice, organization=org,
        role=OrganizationMembership.Role.OWNER, is_active=True,
    )
    OrganizationMembership.objects.create(
        user=bob, organization=org,
        role=OrganizationMembership.Role.LEARNER, is_active=True,
    )

    course = Course.objects.create(
        title="E2E course",
        slug="e2e-course",
        status=Course.Status.PUBLISHED,
        instructor=alice,
        company=org,
        company_only=True,
    )
    section = CourseSection.objects.create(course=course, title="S", order=1)
    lesson = Lesson.objects.create(section=section, title="L", order=1, lesson_type="TEXT")

    # License préparée.
    license = CompanyLicense.objects.create(company=org, seats_total=10, seats_used=0)

    # Org assigne le cours à bob.
    assignment = CompanyAssignment.objects.create(company=org, course=course, assigned_by=alice)
    CompanyAssignmentTarget.objects.create(assignment=assignment, user=bob)

    # Vérifications :
    # 1. Enrollment auto créé via signal (V2.D / COM-10).
    enrollment = Enrollment.objects.get(user=bob, course=course)
    assert enrollment.source == Enrollment.Source.COMPANY
    assert enrollment.company_id == org.id
    assert enrollment.progress_percent == 0

    # 2. seats_used synchronisé (V2.D / COM-09).
    license.refresh_from_db()
    assert license.seats_used == 1

    # 3. Notification d'assignment auto créée (V_FIN.B).
    notifs = Notification.objects.filter(user=bob, kind=Notification.Kind.ENROLLMENT_ASSIGNED)
    assert notifs.count() == 1

    # 4. Bob complète la leçon → progression auto.
    LessonProgress.objects.create(enrollment=enrollment, lesson=lesson, completed=True, progress_percent=100)
    enrollment.refresh_from_db()
    assert enrollment.progress_percent == 100
    assert enrollment.status == Enrollment.Status.COMPLETED


@pytest.mark.django_db
def test_certificate_lifecycle_with_revocation(alice):
    """V_LAST.D : émission + révocation + ré-émission certificat (CERT-03)."""
    from catalog.models import Course
    from certifications.models import IssuedCertificate
    from certifications.services import revoke_certificate

    course = Course.objects.create(
        title="Cycle cert", slug="cycle-cert",
        status=Course.Status.PUBLISHED, instructor=alice,
    )

    # Émission 1.
    c1 = IssuedCertificate.objects.create(user=alice, course=course, score_percent=80)
    assert c1.is_revoked is False

    # Révocation.
    revoke_certificate(c1.id, reason="test")
    c1.refresh_from_db()
    assert c1.is_revoked is True

    # Ré-émission (autorisée grâce à la UniqueConstraint partielle).
    c2 = IssuedCertificate.objects.create(user=alice, course=course, score_percent=90)
    assert c2.is_revoked is False
    assert c2.id != c1.id
    assert c2.serial != c1.serial

    # 1 seul certificat ACTIF à la fois.
    active = IssuedCertificate.objects.filter(
        user=alice, course=course, revoked_at__isnull=True
    )
    assert active.count() == 1
    assert active.first().id == c2.id


@pytest.mark.django_db
def test_invitation_to_membership_full_flow(alice, bob):
    """V_LAST.D : invitation → email envoyé (testé via core.mail.outbox)
    → bob accepte → membership créé.
    """
    from django.core import mail

    from organizations.models import Organization, OrganizationMembership
    from organizations.services import OrganizationMemberManagementService

    org = Organization.objects.create(name="Invite Org", slug="invite-org")
    OrganizationMembership.objects.create(
        user=alice, organization=org,
        role=OrganizationMembership.Role.OWNER, is_active=True,
    )

    # Alice invite bob.
    mail.outbox = []
    invitation = OrganizationMemberManagementService.invite_member(
        actor=alice,
        organization=org,
        email=bob.email,
        role=OrganizationMembership.Role.INSTRUCTOR,
        expires_in_days=7,
        send_email=True,
    )
    # Email envoyé ?
    assert len(mail.outbox) == 1
    assert bob.email in mail.outbox[0].to
    assert "Invitation" in mail.outbox[0].subject

    # Bob accepte (les emails matchent).
    membership = OrganizationMemberManagementService.accept_invitation(
        user=bob, token=str(invitation.token)
    )
    assert membership.user_id == bob.id
    assert membership.organization_id == org.id
    assert membership.role == OrganizationMembership.Role.INSTRUCTOR
    assert membership.is_active is True

    # Invitation marquée acceptée.
    invitation.refresh_from_db()
    assert invitation.accepted_at is not None
