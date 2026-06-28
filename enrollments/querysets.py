"""
enrollments/querysets.py — Helpers QuerySet pour les inscriptions (P4.3).

Évite le N+1 sur les vues qui itèrent sur les Enrollments en accédant à
``enrollment.course`` ou ``enrollment.user``.

Patterns recommandés :

    from enrollments.querysets import for_learner_dashboard
    qs = for_learner_dashboard(Enrollment.objects.filter(user=user))
    # → 1 query au lieu de 1 + N

    from enrollments.querysets import for_org_dashboard
    qs = for_org_dashboard(
        Enrollment.objects.filter(course__company_id=org_id)
    )
"""
from __future__ import annotations

from django.db.models import QuerySet


def with_course(qs: QuerySet) -> QuerySet:
    """Pré-charge ``course`` (FK) — utile dès qu'on accède à course.title etc."""
    return qs.select_related("course")


def with_course_full(qs: QuerySet) -> QuerySet:
    """``course`` + ``course.category`` + ``course.instructor`` en 1 query."""
    return qs.select_related("course", "course__category", "course__instructor")


def with_user(qs: QuerySet) -> QuerySet:
    """Pré-charge ``user`` (FK)."""
    return qs.select_related("user")


def with_current_lesson(qs: QuerySet) -> QuerySet:
    """Pré-charge ``current_lesson`` (utile pour le "reprendre où je m'étais arrêté")."""
    return qs.select_related("current_lesson")


def active_only(qs: QuerySet) -> QuerySet:
    """Filtre les Enrollment.status = ACTIVE."""
    from enrollments.models import Enrollment
    return qs.filter(status=Enrollment.Status.ACTIVE)


def not_canceled(qs: QuerySet) -> QuerySet:
    """Tous sauf CANCELED (ACTIVE + COMPLETED)."""
    from enrollments.models import Enrollment
    return qs.exclude(status=Enrollment.Status.CANCELED)


def for_learner_dashboard(qs: QuerySet) -> QuerySet:
    """
    Préset pour le dashboard apprenant :
    cours + catégorie + current_lesson + ordering récent.
    """
    return with_course_full(with_current_lesson(qs)).order_by("-enrolled_at")


def for_org_dashboard(qs: QuerySet) -> QuerySet:
    """
    Préset pour le dashboard organisation :
    cours + user pour afficher la grille membres × cours.
    """
    return with_course(with_user(qs)).order_by("-enrolled_at")


def for_instructor_analytics(qs: QuerySet) -> QuerySet:
    """
    Préset pour les analytics instructor (KPIs, top courses).
    Lazy : pas besoin de current_lesson, juste course + user pour count.
    """
    return with_course(with_user(qs))
