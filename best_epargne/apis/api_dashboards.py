"""
best_epargne/apis/api_dashboards.py — R2.2 + R5.1 : Dashboards SPA React.

3 endpoints qui HYDRATENT en 1 call l'état initial d'un dashboard React.
Chaque endpoint est authentifié + protégé par le rôle correspondant.

Endpoints exposés :

    GET /api/dashboard/student/     Dashboard apprenant
    GET /api/dashboard/instructor/  Dashboard formateur
    GET /api/dashboard/admin/       Dashboard admin plateforme

Query params (R5.1) :
    ?period=7d | 30d | 90d          (défaut : 30d)
        Ajoute un champ `series` avec les tendances quotidiennes.

Réutilise :
  - ``core.dashboard_kpis`` (cache existant V4.A)
  - ``catalog.querysets`` (helpers eager loading V4.3)
  - ``enrollments.querysets`` (P4.3)

Design : une seule requête = 1 aller-retour pour hydrater le state initial
React (préférable à N appels séparés pour KPIs / courses / notifications).
"""
from __future__ import annotations

from datetime import date, timedelta

from django.db.models import Avg, Count, DecimalField, IntegerField, Q, Sum
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from catalog.models import Course
from core.constants import CourseStatus, EnrollmentStatus
from core.decorators import instructor_required, platform_admin_required


# ─────────────────────────────────────────────────────────────────────
# R5.1 — Helpers timeseries
# ─────────────────────────────────────────────────────────────────────

_PERIOD_TO_DAYS = {"7d": 7, "30d": 30, "90d": 90}


def _parse_period(request) -> tuple[int, date]:
    """Extrait la période depuis ``?period=`` avec fallback 30 jours."""
    key = (request.query_params.get("period") or "30d").lower()
    days = _PERIOD_TO_DAYS.get(key, 30)
    start = timezone.now().date() - timedelta(days=days - 1)
    return days, start


def _build_series(rows, days: int, start: date, value_key: str = "value") -> list[dict]:
    """
    À partir de rows [{date: date, value: N}, ...] renvoie un tableau
    ordonné de longueur `days` avec un point par jour, gaps remplis à 0.
    """
    lookup = {}
    for r in rows:
        d = r["day"]
        if hasattr(d, "date"):  # datetime → date
            d = d.date()
        lookup[d] = float(r[value_key] or 0)
    out = []
    for i in range(days):
        d = start + timedelta(days=i)
        out.append({"date": d.isoformat(), "value": lookup.get(d, 0.0)})
    return out


# ─────────────────────────────────────────────────────────────────────
# Dashboard STUDENT (Apprenant)
# ─────────────────────────────────────────────────────────────────────

class StudentDashboardView(APIView):
    """
    GET /api/dashboard/student/ — Hydrate le dashboard apprenant.

    Retourne :
      - kpis : { in_progress, completed, certificates, total_hours }
      - continue_enrollment : la dernière leçon à reprendre (ou null)
      - recent_enrollments : liste des N dernières inscriptions
      - series (R5) : { activity_minutes_per_day: [{date, value}, ...] }
    """
    permission_classes = [IsAuthenticated]

    @extend_schema(
        summary="Dashboard apprenant",
        parameters=[
            OpenApiParameter(
                "period", str,
                description="Période de la série temporelle : 7d | 30d | 90d",
            ),
        ],
    )
    def get(self, request):
        from enrollments.models import Enrollment
        from enrollments.querysets import for_learner_dashboard

        user = request.user
        days, start = _parse_period(request)

        # Enrollments actifs
        enrollments = for_learner_dashboard(
            Enrollment.objects.filter(user=user).exclude(
                status=EnrollmentStatus.CANCELED
            )
        )

        # KPIs en 1 aggregate (P4.6 pattern)
        kpi = enrollments.aggregate(
            in_progress=Count("id", filter=Q(status=EnrollmentStatus.ACTIVE)),
            completed=Count("id", filter=Q(status=EnrollmentStatus.COMPLETED)),
        )

        # Total heures + série activité (LessonProgress)
        activity_series: list[dict] = []
        try:
            from enrollments.models import LessonProgress
            base_lp = LessonProgress.objects.filter(
                enrollment__user=user,
                enrollment__status__in=[
                    EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED
                ],
            )
            total_seconds = base_lp.aggregate(
                total=Coalesce(Sum("last_position_sec"), 0, output_field=IntegerField()),
            )["total"]

            # Série : minutes d'activité par jour sur `days` jours
            activity_rows = list(
                base_lp.filter(updated_at__date__gte=start)
                .annotate(day=TruncDate("updated_at"))
                .values("day")
                .annotate(value=Coalesce(Sum("last_position_sec"), 0, output_field=IntegerField()))
                .order_by("day")
            )
            # Convertit secondes → minutes
            for r in activity_rows:
                r["value"] = round((r["value"] or 0) / 60, 1)
            activity_series = _build_series(activity_rows, days, start)
        except Exception:
            total_seconds = 0

        # Certificats
        try:
            from certifications.models import IssuedCertificate
            certificates_count = IssuedCertificate.objects.filter(
                user=user, revoked_at__isnull=True
            ).count()
        except Exception:
            certificates_count = 0

        # Continue (première inscription active)
        continue_enrollment = enrollments.filter(
            status=EnrollmentStatus.ACTIVE
        ).order_by("-updated_at").first()

        # Recent enrollments (5 dernières)
        recent = list(enrollments.order_by("-enrolled_at")[:5])

        def _serialize_enrollment(e):
            return {
                "id": e.id,
                "status": e.status,
                "enrolled_at": e.enrolled_at.isoformat() if e.enrolled_at else None,
                "progress_percent": getattr(e, "progress_percent", 0),
                "course": {
                    "id": e.course.id,
                    "slug": e.course.slug,
                    "title": e.course.title,
                    "thumbnail_url": e.course.thumbnail.url if e.course.thumbnail else None,
                },
                "current_lesson_id": e.current_lesson_id if hasattr(e, "current_lesson_id") else None,
            }

        return Response({
            "kpis": {
                "in_progress": kpi["in_progress"],
                "completed": kpi["completed"],
                "certificates": certificates_count,
                "total_hours": round(total_seconds / 3600, 1),
            },
            "continue_enrollment": (
                _serialize_enrollment(continue_enrollment)
                if continue_enrollment else None
            ),
            "recent_enrollments": [_serialize_enrollment(e) for e in recent],
            "series": {
                "period": f"{days}d",
                "activity_minutes_per_day": activity_series,
            },
        })


# ─────────────────────────────────────────────────────────────────────
# Dashboard INSTRUCTOR (Formateur)
# ─────────────────────────────────────────────────────────────────────

class InstructorDashboardView(APIView):
    """
    GET /api/dashboard/instructor/ — Hydrate le dashboard formateur.

    Retourne :
      - kpis : { total_courses, published, draft, review, archived, total_enrollments,
                 avg_rating, avg_progress }
      - recent_courses : 8 derniers cours créés
      - series (R5) : {
            enrollments_per_day: [{date, value}, ...],
            revenue_per_day: [{date, value}, ...],
        }
      - top_courses (R5) : top 5 cours par enrollments sur la période
    """
    permission_classes = [IsAuthenticated]

    def dispatch(self, request, *args, **kwargs):
        # instructor_required + admin bypass
        return instructor_required(super().dispatch)(request, *args, **kwargs)

    @extend_schema(
        summary="Dashboard formateur",
        parameters=[
            OpenApiParameter(
                "period", str,
                description="Période de la série temporelle : 7d | 30d | 90d",
            ),
        ],
    )
    def get(self, request):
        from catalog.querysets import for_instructor_dashboard

        user = request.user
        days, start = _parse_period(request)

        # Aggregate courses en 1 query (pattern P4.2)
        courses_qs = Course.objects.filter(instructor=user)
        courses_kpi = courses_qs.aggregate(
            total=Count("id"),
            published=Count("id", filter=Q(status=CourseStatus.PUBLISHED)),
            draft=Count("id", filter=Q(status=CourseStatus.DRAFT)),
            review=Count("id", filter=Q(status=CourseStatus.REVIEW)),
            archived=Count("id", filter=Q(status=CourseStatus.ARCHIVED)),
        )

        # Enrollments sur ses cours
        enrollments_series: list[dict] = []
        try:
            from enrollments.models import Enrollment
            enroll_qs = Enrollment.objects.filter(
                course__instructor=user
            ).exclude(status=EnrollmentStatus.CANCELED)
            total_enrollments = enroll_qs.count()

            # Série enrollments/jour
            enroll_rows = list(
                enroll_qs.filter(enrolled_at__date__gte=start)
                .annotate(day=TruncDate("enrolled_at"))
                .values("day")
                .annotate(value=Count("id"))
                .order_by("day")
            )
            enrollments_series = _build_series(enroll_rows, days, start)
        except Exception:
            total_enrollments = 0

        # Revenue/jour (Payments PAID sur cours du formateur)
        revenue_series: list[dict] = []
        try:
            from catalog.models import Payment
            pay_rows = list(
                Payment.objects.filter(
                    status="PAID",
                    course__instructor=user,
                    created_at__date__gte=start,
                )
                .annotate(day=TruncDate("created_at"))
                .values("day")
                .annotate(
                    value=Coalesce(
                        Sum("amount"),
                        0,
                        output_field=DecimalField(max_digits=12, decimal_places=2),
                    )
                )
                .order_by("day")
            )
            for r in pay_rows:
                r["value"] = float(r["value"] or 0)
            revenue_series = _build_series(pay_rows, days, start)
        except Exception:
            revenue_series = _build_series([], days, start)

        # Rating moyen sur ses cours
        try:
            from reviews.models import CourseReview
            rating = CourseReview.objects.filter(
                course__instructor=user, is_public=True
            ).aggregate(
                avg=Avg("rating"),
                count=Count("id"),
            )
            avg_rating = float(rating["avg"] or 0)
            rating_count = rating["count"]
        except Exception:
            avg_rating = 0.0
            rating_count = 0

        # Cours récents (8) avec eager loading
        recent_courses = list(
            for_instructor_dashboard(courses_qs).order_by("-updated_at")[:8]
        )

        # Top 5 cours par enrollments sur la période (R5)
        top_courses = list(
            courses_qs.filter(status=CourseStatus.PUBLISHED)
            .annotate(
                period_enrollments=Count(
                    "enrollments",
                    filter=Q(enrollments__enrolled_at__date__gte=start),
                    distinct=True,
                )
            )
            .order_by("-period_enrollments", "-updated_at")[:5]
        )

        def _serialize_course(c):
            return {
                "id": c.id,
                "slug": c.slug,
                "title": c.title,
                "status": c.status,
                "pricing_type": c.pricing_type,
                "price": str(c.price),
                "currency": c.currency,
                "thumbnail_url": c.thumbnail.url if c.thumbnail else None,
                "enrolled_count": getattr(c, "enrolled_count", 0),
                "rating_avg": float(getattr(c, "rating_avg", 0) or 0),
                "rating_count": getattr(c, "rating_count", 0),
                "created_at": c.created_at.isoformat(),
                "updated_at": c.updated_at.isoformat(),
            }

        def _top_course(c):
            return {
                "id": c.id,
                "slug": c.slug,
                "title": c.title,
                "enrolled_count": getattr(c, "period_enrollments", 0),
            }

        return Response({
            "kpis": {
                "total_courses": courses_kpi["total"],
                "published_courses": courses_kpi["published"],
                "draft_courses": courses_kpi["draft"],
                "review_courses": courses_kpi["review"],
                "archived_courses": courses_kpi["archived"],
                "total_enrollments": total_enrollments,
                "avg_rating": round(avg_rating, 2),
                "rating_count": rating_count,
            },
            "recent_courses": [_serialize_course(c) for c in recent_courses],
            "top_courses": [_top_course(c) for c in top_courses],
            "series": {
                "period": f"{days}d",
                "enrollments_per_day": enrollments_series,
                "revenue_per_day": revenue_series,
            },
        })


# ─────────────────────────────────────────────────────────────────────
# Dashboard ADMIN (Plateforme)
# ─────────────────────────────────────────────────────────────────────

class AdminDashboardView(APIView):
    """
    GET /api/dashboard/admin/ — Hydrate le dashboard admin plateforme.

    Retourne les KPIs globaux : users total, courses total, enrollments,
    revenus, formateurs actifs, cours populaires.

    Réservé aux admins plateforme (``@platform_admin_required``).

    Series (R5) :
      - new_users_per_day
      - enrollments_per_day
      - revenue_per_day
    """
    permission_classes = [IsAuthenticated]

    def dispatch(self, request, *args, **kwargs):
        return platform_admin_required(super().dispatch)(request, *args, **kwargs)

    @extend_schema(
        summary="Dashboard admin plateforme",
        parameters=[
            OpenApiParameter(
                "period", str,
                description="Période de la série temporelle : 7d | 30d | 90d",
            ),
        ],
    )
    def get(self, request):
        from django.contrib.auth import get_user_model
        User = get_user_model()

        days, start = _parse_period(request)

        # Users
        user_kpi = User.objects.aggregate(
            total=Count("id"),
            active=Count("id", filter=Q(is_active=True)),
        )

        # Série new_users/jour
        new_users_rows = list(
            User.objects.filter(date_joined__date__gte=start)
            .annotate(day=TruncDate("date_joined"))
            .values("day")
            .annotate(value=Count("id"))
            .order_by("day")
        )
        new_users_series = _build_series(new_users_rows, days, start)

        # Courses
        course_kpi = Course.objects.aggregate(
            total=Count("id"),
            published=Count("id", filter=Q(status=CourseStatus.PUBLISHED)),
            draft=Count("id", filter=Q(status=CourseStatus.DRAFT)),
            archived=Count("id", filter=Q(status=CourseStatus.ARCHIVED)),
        )

        # Enrollments
        enrollments_series: list[dict] = []
        try:
            from enrollments.models import Enrollment
            enrollment_kpi = Enrollment.objects.aggregate(
                total=Count("id"),
                active=Count("id", filter=Q(status=EnrollmentStatus.ACTIVE)),
                completed=Count("id", filter=Q(status=EnrollmentStatus.COMPLETED)),
            )
            enroll_rows = list(
                Enrollment.objects.filter(enrolled_at__date__gte=start)
                .exclude(status=EnrollmentStatus.CANCELED)
                .annotate(day=TruncDate("enrolled_at"))
                .values("day")
                .annotate(value=Count("id"))
                .order_by("day")
            )
            enrollments_series = _build_series(enroll_rows, days, start)
        except Exception:
            enrollment_kpi = {"total": 0, "active": 0, "completed": 0}
            enrollments_series = _build_series([], days, start)

        # Payments
        revenue_series: list[dict] = []
        try:
            from catalog.models import Payment
            payment_kpi = Payment.objects.filter(status="PAID").aggregate(
                total_revenue=Coalesce(
                    Sum("amount"),
                    0,
                    output_field=DecimalField(max_digits=12, decimal_places=2),
                ),
                count=Count("id"),
            )
            total_revenue = float(payment_kpi["total_revenue"] or 0)
            payments_count = payment_kpi["count"]

            pay_rows = list(
                Payment.objects.filter(status="PAID", created_at__date__gte=start)
                .annotate(day=TruncDate("created_at"))
                .values("day")
                .annotate(
                    value=Coalesce(
                        Sum("amount"),
                        0,
                        output_field=DecimalField(max_digits=12, decimal_places=2),
                    )
                )
                .order_by("day")
            )
            for r in pay_rows:
                r["value"] = float(r["value"] or 0)
            revenue_series = _build_series(pay_rows, days, start)
        except Exception:
            total_revenue = 0.0
            payments_count = 0
            revenue_series = _build_series([], days, start)

        # Top 5 cours populaires
        top_courses = list(
            Course.objects.filter(status=CourseStatus.PUBLISHED)
            .annotate(enroll_count=Count("enrollments", distinct=True))
            .select_related("instructor", "category")
            .order_by("-enroll_count")[:5]
        )

        def _top_course(c):
            return {
                "id": c.id,
                "title": c.title,
                "slug": c.slug,
                "enrolled_count": c.enroll_count,
                "instructor_name": c.instructor.full_name or c.instructor.email,
            }

        return Response({
            "kpis": {
                "users_total": user_kpi["total"],
                "users_active": user_kpi["active"],
                "courses_total": course_kpi["total"],
                "courses_published": course_kpi["published"],
                "courses_draft": course_kpi["draft"],
                "courses_archived": course_kpi["archived"],
                "enrollments_total": enrollment_kpi["total"],
                "enrollments_active": enrollment_kpi["active"],
                "enrollments_completed": enrollment_kpi["completed"],
                "revenue_total": round(total_revenue, 2),
                "payments_count": payments_count,
            },
            "top_courses": [_top_course(c) for c in top_courses],
            "series": {
                "period": f"{days}d",
                "new_users_per_day": new_users_series,
                "enrollments_per_day": enrollments_series,
                "revenue_per_day": revenue_series,
            },
            "generated_at": timezone.now().isoformat(),
        })
