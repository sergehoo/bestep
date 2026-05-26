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
    from enrollments.models import Enrollment, LessonProgress

    # Inscriptions actives (utilisé pour completion_rate aussi).
    active_enrollments = Enrollment.objects.filter(
        course=OuterRef("pk"), status=Enrollment.Status.ACTIVE,
    )
    completed_enrollments = Enrollment.objects.filter(
        course=OuterRef("pk"), status=Enrollment.Status.COMPLETED,
    )

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
