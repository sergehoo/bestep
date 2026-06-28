"""catalog/querysets.py — Annotations partagées (V4.B).

CORRECTIFS audit API-33, API-35, API-44 :

- API-33 : ``sections_count``, ``lessons_count``, ``enrolled_count``,
  ``rating_avg``, ``rating_count`` étaient déclarés ``IntegerField(read_only=True)``
  sur le sérializer mais annotés UNIQUEMENT dans ``my_courses`` → ``null``
  ailleurs.
- API-35 / API-44 : annoter ``Exists`` permet d'éviter le N+1 dans
  ``MediaAssetSerializer.get_can_edit`` et autres.

Toutes les vues qui exposent un Course via ``CourseSerializer`` doivent
appeler ``annotate_course_kpis(qs)`` sur leur queryset.
"""
from __future__ import annotations

from django.db.models import (
    Avg,
    Count,
    Exists,
    F,
    FloatField,
    IntegerField,
    OuterRef,
    QuerySet,
    Subquery,
    Value,
)
from django.db.models.functions import Coalesce


def annotate_course_kpis(qs: QuerySet, *, user=None) -> QuerySet:
    """Ajoute toutes les annotations attendues par CourseSerializer.

    Évite les ``AttributeError`` / ``null`` côté sérialisation ET prévient
    les N+1 dans les listes paginées.
    """
    from enrollments.models import Enrollment

    qs = qs.annotate(
        sections_count=Coalesce(
            Subquery(
                qs.model.objects.filter(pk=OuterRef("pk"))
                .annotate(_c=Count("sections"))
                .values("_c")[:1],
                output_field=IntegerField(),
            ),
            Value(0),
        ),
        lessons_count=Coalesce(
            Subquery(
                qs.model.objects.filter(pk=OuterRef("pk"))
                .annotate(_c=Count("sections__lessons"))
                .values("_c")[:1],
                output_field=IntegerField(),
            ),
            Value(0),
        ),
        enrolled_count=Coalesce(
            Subquery(
                Enrollment.objects.filter(course=OuterRef("pk"))
                .values("course")
                .annotate(_c=Count("id"))
                .values("_c")[:1],
                output_field=IntegerField(),
            ),
            Value(0),
        ),
        rating_avg=Coalesce(Avg("reviews__rating"), Value(0.0), output_field=FloatField()),
        rating_count=Count("reviews", distinct=True),
    )

    # Annotation ``can_edit`` si on a un user (sinon laissée à False).
    from core.permissions import is_platform_admin

    if user is not None and user.is_authenticated and not is_platform_admin(user):
        from organizations.models import OrganizationMembership
        writable_org = OrganizationMembership.objects.filter(
            user=user,
            organization=OuterRef("company"),
            role__in=[
                OrganizationMembership.Role.OWNER,
                OrganizationMembership.Role.ADMIN,
                OrganizationMembership.Role.MANAGER,
            ],
            is_active=True,
            organization__is_active=True,
        )
        qs = qs.annotate(
            is_writable_via_org=Exists(writable_org),
        )

    return qs


def annotate_course_completion_rate(qs: QuerySet) -> QuerySet:
    """Ajoute ``completion_rate`` = (completed / total_enrollments) * 100.

    Séparé d'``annotate_course_kpis`` car cette annotation est coûteuse
    (sous-requête imbriquée) et inutile sur les listes simples.
    """
    from enrollments.models import Enrollment

    completed_sq = Enrollment.objects.filter(
        course=OuterRef("pk"), status=Enrollment.Status.COMPLETED,
    ).values("course").annotate(_c=Count("id")).values("_c")[:1]

    total_sq = Enrollment.objects.filter(
        course=OuterRef("pk"),
    ).values("course").annotate(_c=Count("id")).values("_c")[:1]

    return qs.annotate(
        completed_count=Coalesce(Subquery(completed_sq, output_field=IntegerField()), Value(0)),
        total_enroll_count=Coalesce(Subquery(total_sq, output_field=IntegerField()), Value(0)),
    ).annotate(
        completion_rate=models_safe_completion_rate(),
    )


def models_safe_completion_rate():
    """Calcul sûr (division par 0 protégée) de ``completion_rate`` via SQL."""
    from django.db.models import Case, When

    return Case(
        When(total_enroll_count=0, then=Value(0)),
        default=(F("completed_count") * 100) / F("total_enroll_count"),
        output_field=IntegerField(),
    )


# ═════════════════════════════════════════════════════════════════════
# P4.3 — Helpers QuerySet réutilisables (eager loading par défaut)
# ═════════════════════════════════════════════════════════════════════

def with_instructor(qs: QuerySet) -> QuerySet:
    """
    Pré-charge ``instructor`` (FK User) pour éviter N+1 dans les
    sérializers / templates qui accèdent à ``course.instructor.email``
    ou ``course.instructor.get_full_name``.
    """
    return qs.select_related("instructor")


def with_category(qs: QuerySet) -> QuerySet:
    """Pré-charge ``category`` (FK)."""
    return qs.select_related("category")


def with_company(qs: QuerySet) -> QuerySet:
    """Pré-charge ``company`` (FK Organization, peut être NULL)."""
    return qs.select_related("company")


def with_sections_and_lessons(qs: QuerySet) -> QuerySet:
    """
    Pré-charge sections + leçons ordonnées en 1 + 1 requête (au lieu de
    1 par section). Utile pour la page détail publique et le player
    apprenant qui itèrent sur ``course.sections.all()`` puis
    ``section.lessons.all()``.
    """
    from django.db.models import Prefetch
    from catalog.models import CourseSection, Lesson
    return qs.prefetch_related(
        Prefetch(
            "sections",
            queryset=CourseSection.objects.order_by("order").prefetch_related(
                Prefetch(
                    "lessons",
                    queryset=Lesson.objects.order_by("order").only(
                        "id", "title", "order", "section_id",
                        "lesson_type", "is_preview", "duration_sec",
                    ),
                ),
            ),
        ),
    )


def for_public_listing(qs: QuerySet) -> QuerySet:
    """
    Préset pour les listings publics (landing #cours, catalogue) :
    instructor + category + KPIs annotés. Économise ~2× les queries
    sur les pages qui affichent une liste de cours.
    """
    return annotate_course_kpis(with_category(with_instructor(qs)))


def for_instructor_dashboard(qs: QuerySet) -> QuerySet:
    """
    Préset pour les dashboards instructor (liste cours, détail) :
    instructor + category + company + KPIs.
    """
    return annotate_course_kpis(
        with_company(with_category(with_instructor(qs)))
    )


def for_course_detail(qs: QuerySet, *, user=None) -> QuerySet:
    """
    Préset pour la page DÉTAIL d'un cours (publique ou apprenant) :
    instructor + category + sections+lessons + KPIs annotés.
    """
    return annotate_course_kpis(
        with_sections_and_lessons(with_category(with_instructor(qs))),
        user=user,
    )
