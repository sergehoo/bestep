"""Tests UX — context processor ``sidebar_badges`` (badges sidebars)."""
from __future__ import annotations

import pytest
from django.core.cache import cache

from compte.context_processors import _REQUEST_CACHE_ATTR, sidebar_badges
from compte.workspaces import Workspace


def _request_with_workspace(rf, user, kind="learner", organization_id=None):
    """RequestFactory GET avec workspace actif injecté (memo par requête)."""
    request = rf.get("/")
    request.user = user
    setattr(
        request,
        _REQUEST_CACHE_ATTR,
        {
            "available_workspaces": [],
            "active_workspace": Workspace(
                kind=kind,
                label="Test",
                url_name="learner:dashboard",
                organization_id=organization_id,
                organization_name=None,
                role=None,
            ),
            "active_workspace_url": "/",
            "active_workspace_theme": "sky",
            "active_workspace_hue": "#0C87D6",
        },
    )
    return request


@pytest.mark.django_db
def test_anonymous_user_gets_no_badges(rf):
    from django.contrib.auth.models import AnonymousUser

    request = rf.get("/")
    request.user = AnonymousUser()
    assert sidebar_badges(request) == {}


@pytest.mark.django_db
def test_unread_notification_count(rf, alice):
    cache.clear()
    from notifications.models import Notification
    from notifications.services import notify

    notify(alice, Notification.Kind.SYSTEM, title="Hello")
    notify(alice, Notification.Kind.SYSTEM, title="World")

    badges = sidebar_badges(_request_with_workspace(rf, alice))
    assert badges["unread_notification_count"] == 2
    assert badges["instructor_new_reviews_count"] == 0
    assert badges["org_pending_invitations_count"] == 0


@pytest.mark.django_db
def test_instructor_recent_reviews_count(rf, alice, bob):
    cache.clear()
    from catalog.models import Course
    from reviews.models import CourseReview

    course = Course.objects.create(
        title="Cours noté",
        status=Course.Status.PUBLISHED,
        instructor=alice,
    )
    CourseReview.objects.create(course=course, user=bob, rating=5, is_public=True)

    badges = sidebar_badges(_request_with_workspace(rf, alice, kind="instructor"))
    assert badges["instructor_new_reviews_count"] == 1

    # Le même user en espace learner ne voit pas ce compteur.
    cache.clear()
    badges = sidebar_badges(_request_with_workspace(rf, alice, kind="learner"))
    assert badges["instructor_new_reviews_count"] == 0


@pytest.mark.django_db
def test_org_pending_invitations_count(rf, alice):
    cache.clear()
    from django.utils import timezone

    from organizations.models import Organization, OrganizationInvitation

    org = Organization.objects.create(name="Acme")
    OrganizationInvitation.objects.create(
        organization=org,
        email="new@example.com",
        invited_by=alice,
        expires_at=timezone.now() + timezone.timedelta(days=7),
    )

    badges = sidebar_badges(
        _request_with_workspace(rf, alice, kind="org", organization_id=org.id)
    )
    assert badges["org_pending_invitations_count"] == 1


@pytest.mark.django_db
def test_badges_are_cached_per_user_and_workspace(rf, alice):
    cache.clear()
    from notifications.models import Notification
    from notifications.services import notify

    badges = sidebar_badges(_request_with_workspace(rf, alice))
    assert badges["unread_notification_count"] == 0

    # Nouvelle notif : le cache (60 s) sert encore l'ancien compteur.
    notify(alice, Notification.Kind.SYSTEM, title="Hello")
    badges = sidebar_badges(_request_with_workspace(rf, alice))
    assert badges["unread_notification_count"] == 0

    cache.clear()
    badges = sidebar_badges(_request_with_workspace(rf, alice))
    assert badges["unread_notification_count"] == 1
