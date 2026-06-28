from __future__ import annotations

import pytest
from rest_framework.test import APIClient


@pytest.mark.django_db
def test_public_courses_api_is_read_only(alice):
    from catalog.models import Course

    client = APIClient()
    client.force_authenticate(user=alice)
    response = client.post(
        "/api/apis/courses/",
        {
            "title": "Cours créé frauduleusement",
            "description": "Ne doit pas passer par l'API publique.",
            "pricing_type": Course.PricingType.FREE,
        },
        format="json",
    )

    assert response.status_code == 405


@pytest.mark.django_db
def test_direct_enrollment_rejects_paid_course(alice):
    from catalog.models import Course

    course = Course.objects.create(
        title="Cours payant",
        status=Course.Status.PUBLISHED,
        pricing_type=Course.PricingType.PAID,
        price="1000.00",
        instructor=alice,
    )

    client = APIClient()
    client.force_authenticate(user=alice)
    response = client.post(f"/api/learner/courses/{course.id}/enroll/", {}, format="json")

    assert response.status_code == 402


@pytest.mark.django_db
def test_learner_course_detail_hides_company_only_from_outsider(alice, bob):
    from catalog.models import Course
    from organizations.models import Organization

    organization = Organization.objects.create(name="Entreprise privée")
    course = Course.objects.create(
        title="Cours interne",
        status=Course.Status.PUBLISHED,
        pricing_type=Course.PricingType.FREE,
        instructor=alice,
        company=organization,
        company_only=True,
    )

    client = APIClient()
    client.force_authenticate(user=bob)
    response = client.get(f"/api/learner/courses/{course.id}/")

    assert response.status_code == 404


@pytest.mark.django_db
def test_public_landing_api_hides_company_only_from_anonymous(alice):
    from catalog.models import Course
    from organizations.models import Organization

    organization = Organization.objects.create(name="Org landing privée")
    course = Course.objects.create(
        title="Cours privé landing",
        status=Course.Status.PUBLISHED,
        pricing_type=Course.PricingType.FREE,
        instructor=alice,
        company=organization,
        company_only=True,
    )

    client = APIClient()
    response = client.get(f"/landinghome/api/public/courses/{course.id}/")

    assert response.status_code == 404


@pytest.mark.django_db
def test_public_course_page_redirect_hides_company_only(alice):
    from catalog.models import Course
    from organizations.models import Organization

    organization = Organization.objects.create(name="Org page privée")
    course = Course.objects.create(
        title="Cours page privé",
        status=Course.Status.PUBLISHED,
        pricing_type=Course.PricingType.FREE,
        instructor=alice,
        company=organization,
        company_only=True,
    )

    client = APIClient()
    response = client.get(f"/landinghome/courses/{course.id}/")

    assert response.status_code == 404


@pytest.mark.django_db
def test_business_category_page_hides_company_only_courses(alice):
    from catalog.models import Category, Course
    from organizations.models import Organization

    category = Category.objects.create(name="Catégorie privée", slug="categorie-privee")
    organization = Organization.objects.create(name="Org category privée")
    private_course = Course.objects.create(
        title="Cours pro privé",
        status=Course.Status.PUBLISHED,
        pricing_type=Course.PricingType.FREE,
        course_type=Course.CourseType.PROFESSIONNELLE,
        instructor=alice,
        category=category,
        company=organization,
        company_only=True,
    )

    client = APIClient()
    response = client.get(f"/landinghome/business/categories/{category.slug}/")

    assert response.status_code == 200
    assert private_course not in list(response.context["courses"])
    assert response.context["courses_count"] == 0


@pytest.mark.django_db
def test_staff_only_is_not_platform_admin(make_user):
    from best_epargne.apis.permissions import PermissionUtils
    from core.permissions import is_platform_admin

    staff_only = make_user(email="staff-only@example.com", is_staff=True)

    assert staff_only.is_platform_admin is False
    assert is_platform_admin(staff_only) is False
    assert PermissionUtils.is_platform_admin(staff_only) is False


@pytest.mark.django_db
def test_organization_assignment_sets_company_source(client, alice, bob):
    from catalog.models import Course
    from enrollments.models import Enrollment
    from organizations.models import Organization, OrganizationMembership

    organization = Organization.objects.create(name="Org assignation")
    OrganizationMembership.objects.create(
        user=alice,
        organization=organization,
        role=OrganizationMembership.Role.OWNER,
        is_active=True,
    )
    OrganizationMembership.objects.create(
        user=bob,
        organization=organization,
        role=OrganizationMembership.Role.LEARNER,
        is_active=True,
    )
    course = Course.objects.create(
        title="Cours assigné",
        status=Course.Status.PUBLISHED,
        pricing_type=Course.PricingType.FREE,
        instructor=alice,
        company=organization,
        company_only=True,
    )

    client.force_login(alice)
    response = client.post(
        f"/organisation/{organization.id}/courses/{course.id}/assign-learners/",
        {"learners": [bob.id]},
        format="multipart",
    )

    assert response.status_code == 302
    enrollment = Enrollment.objects.get(user=bob, course=course)
    assert enrollment.source == Enrollment.Source.COMPANY
    assert enrollment.company_id == organization.id


@pytest.mark.django_db
def test_manager_cannot_open_or_submit_direct_member_creation(client, alice, bob):
    from organizations.models import Organization, OrganizationMembership

    organization = Organization.objects.create(name="Org manager limité")
    OrganizationMembership.objects.create(
        user=alice,
        organization=organization,
        role=OrganizationMembership.Role.MANAGER,
        is_active=True,
    )
    client.force_login(alice)
    url = f"/organisation/{organization.id}/members/create/"

    get_response = client.get(url)
    post_response = client.post(
        url,
        {
            "email": bob.email,
            "role": OrganizationMembership.Role.LEARNER,
            "send_invitation_if_no_password": True,
        },
    )

    assert get_response.status_code in {302, 403}
    assert post_response.status_code in {302, 403}
    assert not OrganizationMembership.objects.filter(
        user=bob,
        organization=organization,
    ).exists()


@pytest.mark.django_db
def test_homepage_sets_strict_csp_header(client):
    response = client.get("/")
    csp = response.headers.get("Content-Security-Policy", "")

    assert response.status_code == 200
    assert csp
    assert "script-src" in csp
    assert "style-src" in csp
    assert "frame-ancestors 'none'" in csp
    assert "'unsafe-inline'" not in csp
    assert "'unsafe-eval'" not in csp


@pytest.mark.django_db
def test_login_page_sets_strict_csp_header(client):
    response = client.get("/account/login/")
    csp = response.headers.get("Content-Security-Policy", "")

    assert response.status_code == 200
    assert csp
    assert "script-src" in csp
    assert "style-src" in csp
    assert "'unsafe-inline'" not in csp
    assert "'unsafe-eval'" not in csp
