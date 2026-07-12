"""
best_epargne/apis/api_admin_overview.py — R45.1

Endpoint agrégat pour le cockpit administrateur — expose en 1 appel :
    - alertes (payouts pending, avis masqués récemment, cours draft…)
    - activité récente (derniers CourseLifecycleEvent)
    - snapshots rapides (users actifs, revenu du mois, etc.)

    GET /api/admin/overview/

Réservé ``is_platform_admin``. Fait exprès de renvoyer un payload
compact pour éviter le double round-trip depuis le dashboard.
"""
from __future__ import annotations

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db.models import Count, Q, Sum
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from catalog.models import Course, CourseLifecycleEvent
from commerce.models import Order, Payout
from enrollments.models import Enrollment
from reviews.models import CourseReview


User = get_user_model()


class AdminOverviewView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Admin — cockpit consolidé")
    def get(self, request):
        if not getattr(request.user, "is_platform_admin", False):
            return Response(
                {"detail": "Réservé aux administrateurs plateforme."},
                status=403,
            )

        now = timezone.now()
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        # ── Alertes (nombre d'items nécessitant une action) ─────────
        alerts = {
            "payouts_pending": Payout.objects.filter(status="PENDING").count(),
            "payouts_validated": Payout.objects.filter(status="VALIDATED").count(),
            "reviews_hidden": CourseReview.objects.filter(is_public=False).count(),
            "courses_draft": Course.objects.filter(status="DRAFT").count(),
            "orders_pending": Order.objects.filter(status="PENDING").count(),
            "orders_failed": Order.objects.filter(status="FAILED").count(),
        }

        # ── KPI rapides ─────────────────────────────────────────────
        seven_days_ago = now - timedelta(days=7)
        kpis = {
            "users_total": User.objects.count(),
            "users_active": User.objects.filter(is_active=True).count(),
            "users_new_7d": User.objects.filter(date_joined__gte=seven_days_ago).count(),
            "courses_total": Course.objects.count(),
            "courses_published": Course.objects.filter(status="PUBLISHED").count(),
            "enrollments_total": Enrollment.objects.count(),
            "enrollments_active": Enrollment.objects.filter(status="ACTIVE").count(),
            "revenue_month": float(
                Order.objects.filter(
                    status="PAID", paid_at__gte=month_start
                ).aggregate(total=Sum("total"))["total"]
                or 0
            ),
            "revenue_paid_all": float(
                Order.objects.filter(status="PAID").aggregate(total=Sum("total"))[
                    "total"
                ]
                or 0
            ),
            "payouts_net_pending": float(
                Payout.objects.filter(
                    status__in=["PENDING", "VALIDATED"]
                ).aggregate(total=Sum("net_amount"))["total"]
                or 0
            ),
        }

        # ── Activité récente (10 derniers lifecycle events) ─────────
        recent_events = list(
            CourseLifecycleEvent.objects.select_related("course", "actor")
            .order_by("-created_at")[:10]
            .values(
                "id",
                "action",
                "from_status",
                "to_status",
                "course_id",
                "course_title_snapshot",
                "actor_id",
                "created_at",
            )
        )
        # Enrichir avec le titre/email des acteurs (fallback si supprimé)
        recent_activity = []
        for e in recent_events:
            actor_email = ""
            if e["actor_id"]:
                u = User.objects.filter(pk=e["actor_id"]).first()
                actor_email = getattr(u, "email", "") if u else ""
            course_title = e["course_title_snapshot"] or ""
            if not course_title and e["course_id"]:
                c = Course.objects.filter(pk=e["course_id"]).only("title").first()
                course_title = c.title if c else ""
            recent_activity.append(
                {
                    "id": e["id"],
                    "action": e["action"],
                    "from_status": e["from_status"],
                    "to_status": e["to_status"],
                    "course_id": e["course_id"],
                    "course_title": course_title,
                    "actor_email": actor_email,
                    "created_at": e["created_at"],
                }
            )

        # ── Top formateurs (par nb inscrits sur leurs cours) ────────
        top_instructors = list(
            User.objects.filter(instructor_profile__isnull=False)
            .annotate(
                enrolled_count=Count(
                    "instructor_courses__enrollments", distinct=True
                ),
                published_courses=Count(
                    "instructor_courses",
                    filter=Q(instructor_courses__status="PUBLISHED"),
                    distinct=True,
                ),
            )
            .order_by("-enrolled_count")[:5]
            .values("id", "email", "full_name", "enrolled_count", "published_courses")
        )

        return Response(
            {
                "generated_at": now,
                "alerts": alerts,
                "kpis": kpis,
                "recent_activity": recent_activity,
                "top_instructors": top_instructors,
            }
        )
