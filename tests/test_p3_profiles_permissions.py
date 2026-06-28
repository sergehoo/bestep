"""
tests/test_p3_profiles_permissions.py — Tests Phase 3.

Couverture :

1. UserPreferences :
   - Création auto à la création d'un User (signal)
   - get_or_create_for() (fallback paresseux pour comptes existants)
   - Valeurs par défaut

2. Décorateurs (4 nouveaux + smoke des existants) :
   - @instructor_required : OK pour instructor / OK admin / KO autre / KO anon
   - @learner_required : OK tout user actif / KO anon / KO inactif
   - @org_role_required(roles) : OK rôle requis / KO rôle non requis / OK admin
   - @platform_admin_required (smoke V_FIN existant)

3. Avatar : champ optionnel sur User, accepte None.
"""
from __future__ import annotations

import pytest
from django.core.exceptions import PermissionDenied
from django.http import HttpResponse
from django.test import RequestFactory

from compte.models import User, UserPreferences
from core.decorators import (
    instructor_required,
    learner_required,
    org_role_required,
    platform_admin_required,
)


# ─────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────

@pytest.fixture
def rf():
    return RequestFactory()


@pytest.fixture
def anon_user():
    """Utilisateur anonyme Django."""
    from django.contrib.auth.models import AnonymousUser
    return AnonymousUser()


@pytest.fixture
def basic_user(make_user):
    return make_user(email="basic@example.com")


@pytest.fixture
def admin_user(make_user):
    return make_user(
        email="superadmin@example.com",
        is_superuser=True,
        is_staff=True,
        platform_role=User.PlatformRole.PLATFORM_ADMIN,
    )


@pytest.fixture
def instructor_user(make_user, db):
    user = make_user(email="instructor@example.com")
    # Crée un InstructorProfile pour que is_instructor = True
    from compte.models import InstructorProfile
    InstructorProfile.objects.create(user=user)
    # Invalidate les cached_property en rechargeant l'instance
    user.refresh_from_db()
    return user


@pytest.fixture
def org_owner_user(make_user, db):
    """User qui est OWNER d'une organisation active."""
    from organizations.models import Organization, OrganizationMembership
    user = make_user(email="owner@example.com")
    org = Organization.objects.create(name="Test Org", is_active=True)
    OrganizationMembership.objects.create(
        user=user,
        organization=org,
        role=OrganizationMembership.Role.OWNER,
        is_active=True,
    )
    user.refresh_from_db()
    return user


def _dummy_view(request, *args, **kwargs):
    return HttpResponse("OK")


def _attach_user(request, user):
    request.user = user
    return request


# ─────────────────────────────────────────────────────────────────────
# UserPreferences
# ─────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_preferences_created_on_user_signup(basic_user):
    """Le signal post_save crée auto les préférences à l'inscription."""
    assert UserPreferences.objects.filter(user=basic_user).exists()


@pytest.mark.django_db
def test_preferences_defaults_are_sane(basic_user):
    prefs = basic_user.preferences
    assert prefs.theme == UserPreferences.Theme.SYSTEM
    assert prefs.language == UserPreferences.Language.FR
    assert prefs.notifications_email is True
    assert prefs.notifications_marketing is False
    assert prefs.notifications_course_reminders is True
    assert prefs.public_profile is False


@pytest.mark.django_db
def test_get_or_create_for_idempotent(basic_user):
    """get_or_create_for() ne crée pas de doublon si les prefs existent."""
    first = UserPreferences.get_or_create_for(basic_user)
    second = UserPreferences.get_or_create_for(basic_user)
    assert first.pk == second.pk
    assert UserPreferences.objects.filter(user=basic_user).count() == 1


@pytest.mark.django_db
def test_get_or_create_for_creates_if_missing(basic_user):
    """Fallback : si l'user n'a pas de prefs (cas legacy), get_or_create_for les crée."""
    basic_user.preferences.delete()
    assert not UserPreferences.objects.filter(user=basic_user).exists()
    prefs = UserPreferences.get_or_create_for(basic_user)
    assert prefs is not None
    assert UserPreferences.objects.filter(user=basic_user).count() == 1


# ─────────────────────────────────────────────────────────────────────
# @instructor_required
# ─────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_instructor_required_allows_instructor(rf, instructor_user):
    request = _attach_user(rf.get("/"), instructor_user)
    response = instructor_required(_dummy_view)(request)
    assert response.status_code == 200


@pytest.mark.django_db
def test_instructor_required_allows_platform_admin(rf, admin_user):
    request = _attach_user(rf.get("/"), admin_user)
    response = instructor_required(_dummy_view)(request)
    assert response.status_code == 200


@pytest.mark.django_db
def test_instructor_required_denies_non_instructor(rf, basic_user):
    request = _attach_user(rf.get("/"), basic_user)
    with pytest.raises(PermissionDenied):
        instructor_required(_dummy_view)(request)


def test_instructor_required_redirects_anonymous(rf, anon_user):
    request = _attach_user(rf.get("/"), anon_user)
    response = instructor_required(_dummy_view)(request)
    assert response.status_code == 302
    assert "/login" in response.url or "/account" in response.url


# ─────────────────────────────────────────────────────────────────────
# @learner_required
# ─────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_learner_required_allows_any_active_user(rf, basic_user):
    request = _attach_user(rf.get("/"), basic_user)
    response = learner_required(_dummy_view)(request)
    assert response.status_code == 200


@pytest.mark.django_db
def test_learner_required_denies_inactive_user(rf, basic_user):
    basic_user.is_active = False
    basic_user.save()
    request = _attach_user(rf.get("/"), basic_user)
    with pytest.raises(PermissionDenied):
        learner_required(_dummy_view)(request)


def test_learner_required_redirects_anonymous(rf, anon_user):
    request = _attach_user(rf.get("/"), anon_user)
    response = learner_required(_dummy_view)(request)
    assert response.status_code == 302


# ─────────────────────────────────────────────────────────────────────
# @org_role_required
# ─────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_org_role_required_allows_matching_role(rf, org_owner_user):
    request = _attach_user(rf.get("/"), org_owner_user)
    response = org_role_required("OWNER", "ADMIN")(_dummy_view)(request)
    assert response.status_code == 200


@pytest.mark.django_db
def test_org_role_required_allows_platform_admin(rf, admin_user):
    request = _attach_user(rf.get("/"), admin_user)
    response = org_role_required("OWNER")(_dummy_view)(request)
    assert response.status_code == 200


@pytest.mark.django_db
def test_org_role_required_denies_non_member(rf, basic_user):
    request = _attach_user(rf.get("/"), basic_user)
    with pytest.raises(PermissionDenied):
        org_role_required("OWNER", "ADMIN")(_dummy_view)(request)


@pytest.mark.django_db
def test_org_role_required_denies_wrong_role(rf, org_owner_user):
    """OWNER ne passe pas si on exige LEARNER uniquement."""
    request = _attach_user(rf.get("/"), org_owner_user)
    with pytest.raises(PermissionDenied):
        org_role_required("LEARNER")(_dummy_view)(request)


def test_org_role_required_raises_without_args():
    """Factory : appel sans rôle → ValueError immédiate."""
    with pytest.raises(ValueError):
        org_role_required()


# ─────────────────────────────────────────────────────────────────────
# @platform_admin_required (smoke)
# ─────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_platform_admin_required_allows_admin(rf, admin_user):
    request = _attach_user(rf.get("/"), admin_user)
    response = platform_admin_required(_dummy_view)(request)
    assert response.status_code == 200


@pytest.mark.django_db
def test_platform_admin_required_denies_non_admin(rf, basic_user):
    request = _attach_user(rf.get("/"), basic_user)
    with pytest.raises(PermissionDenied):
        platform_admin_required(_dummy_view)(request)


# ─────────────────────────────────────────────────────────────────────
# Avatar
# ─────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_avatar_field_is_optional(basic_user):
    """Le champ avatar est nullable, un user nouvellement créé n'en a pas."""
    assert not basic_user.avatar
    assert basic_user.avatar is None or basic_user.avatar.name == "" or not bool(basic_user.avatar)
