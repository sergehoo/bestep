from __future__ import annotations

import pytest
from django.template.loader import render_to_string
from django.urls import resolve, reverse

from compte.models import InstructorProfile, LearnerProfile
from compte.workspaces import Workspace
from organizations.models import Organization, OrganizationMembership


def _request(rf, user, url):
    request = rf.get(url)
    request.user = user
    request.session = {}
    request.resolver_match = resolve(url)
    return request


def _workspace(kind, url_name, **kwargs):
    return Workspace(kind=kind, label="Test", url_name=url_name, **kwargs)


def _render(template_name, request, workspace, **context):
    return render_to_string(
        template_name,
        {
            "active_workspace": workspace,
            "available_workspaces": [workspace],
            "unread_notification_count": 0,
            "instructor_new_reviews_count": 0,
            "org_pending_invitations_count": 0,
            **context,
        },
        request=request,
    )


@pytest.mark.django_db
def test_learner_sidebar_prioritizes_learning_without_phantom_tabs(rf, alice):
    LearnerProfile.objects.create(user=alice)
    url = reverse("learner:dashboard")
    html = _render(
        "partials/learner_side.html",
        _request(rf, alice, url),
        _workspace("learner", "learner:dashboard"),
    )

    assert "Vue d'ensemble" in html
    assert "Mes cours" in html
    assert "Découvrir" in html
    assert "Paiements" not in html
    assert "Paramètres" not in html
    assert "Ma progression" not in html
    assert 'aria-current="page"' in html


@pytest.mark.django_db
def test_instructor_sidebar_focuses_on_content_workflow(rf, alice):
    InstructorProfile.objects.create(user=alice)
    url = reverse("instructor:media")
    html = _render(
        "partials/instructor_side.html",
        _request(rf, alice, url),
        _workspace("instructor", "instructor:dashboard"),
        instructor_new_reviews_count=2,
    )

    assert "Mes cours" in html
    assert "Médiathèque" in html
    assert "Quiz & évaluations" in html
    assert "2 nouveaux avis cette semaine" in html
    assert "Analytiques" not in html
    assert "Revenus & paiements" not in html
    assert 'aria-current="page"' in html


@pytest.mark.django_db
def test_organization_sidebar_adapts_primary_action_to_manager(rf, alice):
    organization = Organization.objects.create(name="Acme")
    OrganizationMembership.objects.create(
        user=alice,
        organization=organization,
        role=OrganizationMembership.Role.MANAGER,
    )
    url = reverse("org:dashboard", args=[organization.id])
    workspace = _workspace(
        "org",
        "org:dashboard",
        organization_id=organization.id,
        organization_name=organization.name,
        role=OrganizationMembership.Role.MANAGER,
    )
    html = _render(
        "partials/organization_side.html",
        _request(rf, alice, url),
        workspace,
        organization=organization,
        user_org_role=OrganizationMembership.Role.MANAGER,
    )

    assert "Créer un cours" in html
    assert "Ajouter un membre" not in html
    assert "Équipe & membres" in html
    assert "Cours internes" in html
    assert "Médiathèque" in html


@pytest.mark.django_db
def test_organization_sidebar_gives_admin_member_action(rf, alice):
    organization = Organization.objects.create(name="Acme Admin")
    OrganizationMembership.objects.create(
        user=alice,
        organization=organization,
        role=OrganizationMembership.Role.ADMIN,
    )
    url = reverse("org:members", args=[organization.id])
    workspace = _workspace(
        "org",
        "org:dashboard",
        organization_id=organization.id,
        organization_name=organization.name,
        role=OrganizationMembership.Role.ADMIN,
    )
    html = _render(
        "partials/organization_side.html",
        _request(rf, alice, url),
        workspace,
        organization=organization,
        user_org_role=OrganizationMembership.Role.ADMIN,
        org_pending_invitations_count=3,
    )

    assert "Ajouter un membre" in html
    assert "3 invitations en attente" in html
    assert "Administrateur d'organisation" in html
    assert 'aria-current="page"' in html


@pytest.mark.django_db
def test_platform_sidebar_contains_only_operational_admin_destinations(rf, platform_admin):
    url = reverse("platform_organizations")
    html = _render(
        "partials/platform_side.html",
        _request(rf, platform_admin, url),
        _workspace("platform_admin", "admin_dashboard"),
    )

    assert "Vue d'ensemble" in html
    assert "Organisations" in html
    assert "Utilisateurs" in html
    assert "Certifications" not in html
    assert "Paiements & revenus" not in html
    assert "Espace formateur" not in html
    assert "Espace apprenant" not in html
    assert 'aria-current="page"' in html
