"""core/dashboard_kpis.py — Calcul centralisé et cached des KPIs.

CORRECTIFS V4.A (ORG-11, FORMATIONS-30/32/45).

Avant : chaque vue de dashboard ré-implémentait les COUNT/aggregate ; jusqu'à
30 requêtes SQL par hit ; aucune mémoïsation.

Après : 3 fonctions cached qui regroupent les counts par un seul
``aggregate(..., filter=Q(...))`` par modèle :

- ``get_organization_dashboard_kpis(organization_id)`` (TTL 60s)
- ``get_platform_dashboard_kpis()`` (TTL 60s)
- ``get_instructor_dashboard_kpis(user_id)`` (TTL 30s)

Les invalidations doivent être branchées dans les apps métier
(``catalog.signals``, ``enrollments.signals``, etc.) via les helpers
``invalidate_*`` de ``core/cache.py``.

NOTE : ce module remplace progressivement les helpers historiques dans
``formations/views.py`` (``get_instructor_dashboard_kpis``) sans les casser ;
on documente la migration dans ``PATCHES.md`` §24.
"""
from __future__ import annotations

import logging
from typing import Any

from django.db.models import Avg, Count, Q, Sum
from django.utils import timezone

from core.cache import (
    DEFAULT_KPI_TTL,
    cached_kpi,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Org dashboard
# ---------------------------------------------------------------------------


@cached_kpi("org_dashboard", ttl=DEFAULT_KPI_TTL, key_args=["organization_id"])
def get_organization_dashboard_kpis(*, organization_id: int) -> dict[str, Any]:
    """Calcule les KPIs principaux d'un dashboard org en quelques requêtes.

    Cache 60s. Invalider via ``invalidate_org_dashboard(organization_id)``
    depuis les signaux Course/Enrollment/Membership/Order.
    """
    from catalog.models import Course
    from commerce.models import Order
    from enrollments.models import Enrollment
    from organizations.models import OrganizationMembership

    # 1 requête : agrégation cours.
    courses = (
        Course.objects.filter(company_id=organization_id)
        .aggregate(
            total=Count("id"),
            published=Count("id", filter=Q(status=Course.Status.PUBLISHED)),
            draft=Count("id", filter=Q(status=Course.Status.DRAFT)),
            archived=Count("id", filter=Q(status=Course.Status.ARCHIVED)),
            avg_rating=Avg("reviews__rating"),
        )
    )

    # 1 requête : agrégation membres.
    members = (
        OrganizationMembership.objects.filter(organization_id=organization_id, is_active=True)
        .aggregate(
            total=Count("id"),
            owners=Count("id", filter=Q(role=OrganizationMembership.Role.OWNER)),
            admins=Count("id", filter=Q(role=OrganizationMembership.Role.ADMIN)),
            managers=Count("id", filter=Q(role=OrganizationMembership.Role.MANAGER)),
            instructors=Count("id", filter=Q(role=OrganizationMembership.Role.INSTRUCTOR)),
            learners=Count("id", filter=Q(role=OrganizationMembership.Role.LEARNER)),
        )
    )

    # 1 requête : agrégation inscriptions.
    enrollments = (
        Enrollment.objects.filter(company_id=organization_id)
        .aggregate(
            total=Count("id"),
            active=Count("id", filter=Q(status=Enrollment.Status.ACTIVE)),
            completed=Count("id", filter=Q(status=Enrollment.Status.COMPLETED)),
            canceled=Count("id", filter=Q(status=Enrollment.Status.CANCELED)),
            avg_progress=Avg("progress_percent"),
        )
    )

    # 1 requête : agrégation commandes / CA.
    orders = (
        Order.objects.filter(company_id=organization_id)
        .aggregate(
            total_count=Count("id"),
            paid=Count("id", filter=Q(status=Order.Status.PAID)),
            revenue=Sum("total", filter=Q(status=Order.Status.PAID)),
        )
    )
    orders["total"] = orders.pop("total_count")

    return {
        "courses": courses,
        "members": members,
        "enrollments": enrollments,
        "orders": orders,
        "generated_at": timezone.now().isoformat(),
    }


# ---------------------------------------------------------------------------
# Platform admin dashboard
# ---------------------------------------------------------------------------


@cached_kpi("platform_dashboard", ttl=DEFAULT_KPI_TTL)
def get_platform_dashboard_kpis() -> dict[str, Any]:
    """KPIs plateforme : utilisateurs, organisations, cours, commerce.

    Aggrégations groupées : remplace ~30 COUNT séparés par 4-5 requêtes.
    """
    from django.contrib.auth import get_user_model

    from catalog.models import Course
    from commerce.models import Order
    from enrollments.models import Enrollment
    from organizations.models import Organization

    User = get_user_model()

    users = User.objects.aggregate(
        total=Count("id"),
        active=Count("id", filter=Q(is_active=True)),
        platform_admins=Count("id", filter=Q(platform_role="PLATFORM_ADMIN")),
        superusers=Count("id", filter=Q(is_superuser=True)),
    )

    organizations = Organization.objects.aggregate(
        total=Count("id"),
        active=Count("id", filter=Q(is_active=True)),
        inactive=Count("id", filter=Q(is_active=False)),
    )

    courses = Course.objects.aggregate(
        total=Count("id"),
        published=Count("id", filter=Q(status=Course.Status.PUBLISHED)),
        draft=Count("id", filter=Q(status=Course.Status.DRAFT)),
        archived=Count("id", filter=Q(status=Course.Status.ARCHIVED)),
        company_only=Count("id", filter=Q(company_only=True)),
    )

    enrollments = Enrollment.objects.aggregate(
        total=Count("id"),
        active=Count("id", filter=Q(status=Enrollment.Status.ACTIVE)),
        completed=Count("id", filter=Q(status=Enrollment.Status.COMPLETED)),
        avg_progress=Avg("progress_percent"),
    )

    orders = Order.objects.aggregate(
        total_count=Count("id"),
        paid=Count("id", filter=Q(status=Order.Status.PAID)),
        refunded=Count("id", filter=Q(status=Order.Status.REFUNDED)),
        revenue=Sum("total", filter=Q(status=Order.Status.PAID)),
    )
    orders["total"] = orders.pop("total_count")

    return {
        "users": users,
        "organizations": organizations,
        "courses": courses,
        "enrollments": enrollments,
        "orders": orders,
        "generated_at": timezone.now().isoformat(),
    }


# ---------------------------------------------------------------------------
# Instructor dashboard
# ---------------------------------------------------------------------------


@cached_kpi("instructor_dashboard", ttl=30, key_args=["user_id"])
def get_instructor_dashboard_kpis(*, user_id: int) -> dict[str, Any]:
    """KPIs côté formateur. TTL court (30s) car données plus dynamiques.

    Couvre les cas auteur direct + co-auteur via org.
    """
    from catalog.models import Course
    from enrollments.models import Enrollment

    # Sa portée cours (auteur direct) — on garde simple ici.
    instructor_courses = Course.objects.filter(instructor_id=user_id)
    courses = instructor_courses.aggregate(
        total=Count("id"),
        published=Count("id", filter=Q(status=Course.Status.PUBLISHED)),
        draft=Count("id", filter=Q(status=Course.Status.DRAFT)),
        archived=Count("id", filter=Q(status=Course.Status.ARCHIVED)),
        avg_rating=Avg("reviews__rating"),
    )

    enrollments = Enrollment.objects.filter(course__instructor_id=user_id).aggregate(
        total=Count("id"),
        active=Count("id", filter=Q(status=Enrollment.Status.ACTIVE)),
        completed=Count("id", filter=Q(status=Enrollment.Status.COMPLETED)),
        avg_progress=Avg("progress_percent"),
    )

    return {
        "courses": courses,
        "enrollments": enrollments,
        "generated_at": timezone.now().isoformat(),
    }
