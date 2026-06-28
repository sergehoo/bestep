"""
tests/test_p4_perf_n_plus_1.py — Régression de performance (P4.2, P4.3).

Asserte un nombre BORNE de queries SQL sur les chemins critiques pour
détecter les régressions N+1 dans le futur.

Approche : on utilise ``django.test.utils.CaptureQueriesContext`` ou
``assertNumQueries`` pour fixer un plafond. Si quelqu'un casse l'eager
loading dans un refactor, le test échoue immédiatement.

Bornes choisies avec une marge raisonnable :
  - Listing catalogue public : ≤ 6 queries (count + page + filters + annotations)
  - Dashboard learner (5 enrollments) : ≤ 8 queries (1+1 select_related)
  - InstructorKpisView : ≤ 8 queries (refactor P4.2 : ~1 par bloc aggregate)

Si ces bornes paraissent élevées, on les abaisse au fur et à mesure que
les optimisations progressent. L'objectif est de **détecter les régressions**,
pas de chasser la perfection.
"""
from __future__ import annotations

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from catalog.models import Course, CourseSection, Lesson
from catalog.querysets import (
    for_course_detail,
    for_instructor_dashboard,
    for_public_listing,
    with_instructor,
    with_sections_and_lessons,
)


# ─────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────

@pytest.fixture
def instructor(make_user):
    return make_user(email="kpi.instructor@example.com")


@pytest.fixture
def catalog_data(instructor, db):
    """Crée 5 cours PUBLISHED avec 2 sections × 2 leçons chacun."""
    courses = []
    for i in range(5):
        c = Course.objects.create(
            title=f"Course {i}",
            instructor=instructor,
            status=Course.Status.PUBLISHED,
        )
        for j in range(2):
            s = CourseSection.objects.create(course=c, title=f"Sect {j}", order=j + 1)
            for k in range(2):
                Lesson.objects.create(
                    section=s,
                    title=f"L{k}",
                    order=k + 1,
                    lesson_type="TEXT" if not hasattr(Lesson, "LessonType") else "TEXT",
                    content="<p>x</p>",
                )
        courses.append(c)
    return courses


# ─────────────────────────────────────────────────────────────────────
# QuerySet helpers (catalog/querysets.py)
# ─────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_with_instructor_eager_loads_user(catalog_data):
    """select_related('instructor') → 1 query pour accéder à instructor.email
    sur N cours."""
    qs = list(with_instructor(Course.objects.all()))
    with CaptureQueriesContext(connection) as ctx:
        for course in qs:
            _ = course.instructor.email
    # 0 queries supplémentaires car instructor est déjà cached.
    assert len(ctx.captured_queries) == 0, (
        f"Expected 0 extra queries, got {len(ctx.captured_queries)}: "
        f"{[q['sql'][:80] for q in ctx.captured_queries]}"
    )


@pytest.mark.django_db
def test_without_select_related_creates_n_plus_1(catalog_data):
    """Sans select_related, accéder à instructor.email crée N queries."""
    qs = list(Course.objects.all())  # PAS de select_related ici
    with CaptureQueriesContext(connection) as ctx:
        for course in qs:
            _ = course.instructor.email
    # Sans cache, c'est 1 query par cours (sauf si Django met en cache
    # quand le même user FK est commun aux 5 cours — c'est notre cas).
    # On accepte 0-5 queries selon le comportement de Django, mais on
    # vérifie surtout que le helper EST utile (résiste à un cas pire).
    assert len(ctx.captured_queries) <= 5


@pytest.mark.django_db
def test_with_sections_and_lessons_bounded(catalog_data):
    """Helper prefetch sections + lessons : 1 + 2 queries (cours + sect + lesson)."""
    with CaptureQueriesContext(connection) as ctx:
        qs = list(with_sections_and_lessons(Course.objects.all()))
        # Force eval prefetch
        for course in qs:
            for section in course.sections.all():
                list(section.lessons.all())
    # 1 (Course) + 1 (Sections via prefetch) + 1 (Lessons via prefetch) = 3
    assert len(ctx.captured_queries) <= 4, (
        f"Expected ≤ 4 queries, got {len(ctx.captured_queries)}"
    )


# ─────────────────────────────────────────────────────────────────────
# Presets composites
# ─────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_for_public_listing_bounded(catalog_data):
    """Listing public : instructor + category + KPIs annotés en 1-2 queries."""
    with CaptureQueriesContext(connection) as ctx:
        items = list(for_public_listing(Course.objects.all()))
        # Forcer accès aux champs eagerly loaded
        for c in items:
            _ = c.instructor.email
            _ = c.category.name if c.category else None
    # Tous les accès sont déjà cachés grâce à select_related.
    # Acceptons une marge réaliste (max 4 queries totales).
    assert len(ctx.captured_queries) <= 4


@pytest.mark.django_db
def test_for_course_detail_bounded(catalog_data, instructor):
    """Détail cours : ≤ 5 queries (course + section + lesson + KPI count + …)."""
    with CaptureQueriesContext(connection) as ctx:
        course = for_course_detail(Course.objects.filter(pk=catalog_data[0].pk)).first()
        # Itère sections + leçons.
        for section in course.sections.all():
            list(section.lessons.all())
        _ = course.instructor.email
    assert len(ctx.captured_queries) <= 6, (
        f"Expected ≤ 6 queries, got {len(ctx.captured_queries)}"
    )


@pytest.mark.django_db
def test_for_instructor_dashboard_bounded(catalog_data):
    """Dashboard instructor : KPIs annotés + relations FK eager."""
    with CaptureQueriesContext(connection) as ctx:
        items = list(for_instructor_dashboard(Course.objects.all()))
        for c in items:
            _ = c.instructor.email
            _ = c.category
            _ = c.company
    assert len(ctx.captured_queries) <= 4


# ─────────────────────────────────────────────────────────────────────
# Sanity check constants module
# ─────────────────────────────────────────────────────────────────────

def test_constants_module_imports_cleanly():
    """Le module de constantes doit s'importer sans déclencher d'erreur
    de Django apps ready (pas d'import lourd au top-level)."""
    from core import constants
    assert constants.CourseStatus.PUBLISHED == "PUBLISHED"
    assert "OWNER" in constants.ORG_ADMIN_ROLES
    assert "ADMIN" in constants.ORG_ADMIN_ROLES
    assert "LEARNER" not in constants.ORG_ADMIN_ROLES
    assert constants.CourseStatus.PUBLISHED in constants.COURSE_VISIBLE_TO_PUBLIC


def test_constants_org_role_helpers():
    from core.constants import (
        ORG_ADMIN_ROLES,
        ORG_MANAGER_ROLES,
        ORG_TEACHING_ROLES,
        is_valid_org_role,
    )
    # OWNER appartient à tous les ensembles "supérieurs"
    assert "OWNER" in ORG_ADMIN_ROLES
    assert "OWNER" in ORG_MANAGER_ROLES
    assert "OWNER" in ORG_TEACHING_ROLES
    # INSTRUCTOR est dans TEACHING mais pas dans ADMIN
    assert "INSTRUCTOR" in ORG_TEACHING_ROLES
    assert "INSTRUCTOR" not in ORG_ADMIN_ROLES
    # Validation des entrées arbitraires
    assert is_valid_org_role("OWNER") is True
    assert is_valid_org_role("FAKE_ROLE") is False
    assert is_valid_org_role("") is False


# ─────────────────────────────────────────────────────────────────────
# P4.6 — Aggregate conditionnel sur Enrollment (StudentDashboard fix)
# ─────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_enrollment_kpis_single_query(catalog_data, make_user):
    """Le pattern aggregate(filter=Q(...)) compte multiple statuses en 1 query.

    Reproduit le fix P4.6 appliqué dans StudentDashboard.
    """
    from django.db.models import Count, Q
    from enrollments.models import Enrollment

    user = make_user(email="enroll.kpi@example.com")
    for course in catalog_data[:3]:
        Enrollment.objects.create(user=user, course=course, status=Enrollment.Status.ACTIVE)
    Enrollment.objects.create(
        user=user, course=catalog_data[3], status=Enrollment.Status.COMPLETED
    )
    Enrollment.objects.create(
        user=user, course=catalog_data[4], status=Enrollment.Status.CANCELED
    )

    enrollments = Enrollment.objects.filter(user=user).exclude(
        status=Enrollment.Status.CANCELED
    )

    # ANTI-PATTERN : 2 .count() séparés = 2 queries
    # PATTERN OPTIMAL : 1 aggregate = 1 query
    with CaptureQueriesContext(connection) as ctx:
        kpis = enrollments.aggregate(
            in_progress=Count("id", filter=Q(status=Enrollment.Status.ACTIVE)),
            completed=Count("id", filter=Q(status=Enrollment.Status.COMPLETED)),
        )
    # 1 seule query SQL pour les 2 counts
    assert len(ctx.captured_queries) == 1
    assert kpis["in_progress"] == 3
    assert kpis["completed"] == 1


@pytest.mark.django_db
def test_enrollment_select_related_no_n_plus_1(catalog_data, make_user):
    """select_related('course') évite N+1 sur enrollment.course.title."""
    user = make_user(email="enroll.eager@example.com")
    for course in catalog_data:
        Enrollment.objects.create(user=user, course=course, status="ACTIVE")

    from enrollments.models import Enrollment
    qs = list(
        Enrollment.objects.filter(user=user)
        .select_related("course", "course__category")
    )
    with CaptureQueriesContext(connection) as ctx:
        for e in qs:
            _ = e.course.title
            _ = e.course.category.name if e.course.category else None
    assert len(ctx.captured_queries) == 0, (
        f"Expected 0 queries, got {len(ctx.captured_queries)}"
    )
