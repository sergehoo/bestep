"""Tests V_FIN.B — Notification service + signaux auto."""
from __future__ import annotations

import pytest


@pytest.mark.django_db
def test_notify_creates_notification(alice):
    """notify() crée une Notification associée au user."""
    from notifications.models import Notification
    from notifications.services import notify

    n = notify(
        alice,
        Notification.Kind.SYSTEM,
        title="Bienvenue !",
        body="Test",
        url="/welcome/",
        payload={"foo": "bar"},
    )
    assert n is not None
    assert n.user_id == alice.id
    assert n.is_read is False
    assert n.payload == {"foo": "bar"}


@pytest.mark.django_db
def test_notify_returns_none_for_invalid_user():
    """user=None ou désactivé → pas de Notification."""
    from notifications.services import notify

    assert notify(None, "system", "x") is None


@pytest.mark.django_db
def test_b2b_enrollment_creates_notification(alice):
    """COM-10 + ORG-17 : un Enrollment source=COMPANY déclenche une notif."""
    from catalog.models import Course
    from enrollments.models import Enrollment
    from notifications.models import Notification
    from organizations.models import Organization

    org = Organization.objects.create(name="NotifOrg", slug="notif-org")
    course = Course.objects.create(
        title="b2b-notif", slug="b2b-notif",
        status=Course.Status.PUBLISHED, instructor=alice,
    )

    Enrollment.objects.create(
        user=alice, course=course,
        source=Enrollment.Source.COMPANY, company=org,
    )

    notifs = Notification.objects.filter(user=alice, kind=Notification.Kind.ENROLLMENT_ASSIGNED)
    assert notifs.count() == 1
    assert "b2b-notif" in notifs.first().title.lower() or "b2b" in notifs.first().payload.get("course_slug", "")


@pytest.mark.django_db
def test_b2c_enrollment_does_not_notify(alice):
    """Un Enrollment B2C (source=B2C) ne déclenche pas la notif d'assignment."""
    from catalog.models import Course
    from enrollments.models import Enrollment
    from notifications.models import Notification

    course = Course.objects.create(title="b2c", slug="b2c", status=Course.Status.PUBLISHED, instructor=alice)
    Enrollment.objects.create(user=alice, course=course, source=Enrollment.Source.B2C)

    assert not Notification.objects.filter(
        user=alice, kind=Notification.Kind.ENROLLMENT_ASSIGNED
    ).exists()


@pytest.mark.django_db
def test_mark_read_idempotent(alice):
    """mark_read() est idempotent (n'écrase pas le timestamp existant)."""
    from notifications.models import Notification
    from notifications.services import notify

    n = notify(alice, Notification.Kind.SYSTEM, title="ping")
    n.mark_read()
    first_read_at = n.read_at
    n.mark_read()
    n.refresh_from_db()
    assert n.read_at == first_read_at  # pas réécrit.
