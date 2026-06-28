from decimal import Decimal

from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin
from django.contrib.auth.views import redirect_to_login
from django.core.paginator import Paginator
from django.db import models
from django.db.models import (
    Avg,
    Count,
    DecimalField,
    IntegerField,
    Q,
    Sum,
)
from django.db.models.functions import Coalesce
from django.http import HttpResponsePermanentRedirect
from django.shortcuts import get_object_or_404, redirect
from django.urls import NoReverseMatch, reverse
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.utils.text import slugify
from django.views import View
from django.views.generic import DetailView, TemplateView
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView as DRFAPIView

from assessments.models import Quiz
from assessments.recommendations import recommend_courses
from best_epargne.apis.serializers import OpenApiObjectSerializer, PublicCourseSerializer
from best_epargne.apis.views import _course_to_dict
from catalog.models import (
    Category,
    Course,
    CourseSection,
    Lesson,
    MediaAsset,
    Notification,
    Payment,
    User,
)
from catalog.services import get_visible_courses_qs
from certifications.models import IssuedCertificate
from compte.models import InstructorProfile
from core.decorators import platform_admin_otp_required as _platform_admin_otp_required
from enrollments.models import Enrollment, LessonProgress
from formations.Rolemixin import (
    InstructorBaseMixin,
    LearnerRequiredMixin,
)
from organizations.models import OrganizationMembership
from organizations.organ_forms import BusinessInterestRequestForm
from reviews.models import CourseReview


class APIView(DRFAPIView):
    """Base OpenAPI pour les réponses JSON assemblées manuellement."""

    serializer_class = OpenApiObjectSerializer


# Create your views here.
# def _redirect_by_role(user):
#     # 🔐 Cas utilisateur non connecté
#     if not user or not user.is_authenticated:
#         return reverse("account_login")  # ou "home"
#
#     if user.is_superuser or user.is_staff:
#         return reverse("admin_dashboard")
#
#     if user.role == user.Role.INSTRUCTOR:
#         return reverse("instructor:dashboard")
#
#     if user.role == user.Role.COMPANY_ADMIN:
#         return reverse("business_dashboard")
#     return reverse("learner:dashboard")

def resolve_user_dashboard_url(user):
    """
    Détermine le dashboard principal selon le profil effectif.

    Renvoie un NOM d'URL résolvable par ``django.urls.reverse``.

    Ordre de priorité (aligné avec ``Rolemixin._redirect_by_role`` et
    ``compte.adapters.resolve_user_dashboard_url``) :
        org admin/manager > admin plateforme > formateur >
        staff technique pur > apprenant.

    L'org membership prime sur ``is_platform_admin`` : un OWNER d'org
    qui est aussi ``is_staff`` ne doit pas être routé vers ``admin:index``.
    """
    if not user or not user.is_authenticated:
        return "account_login"

    # 1. Rôle d'organisation — toujours prioritaire.
    memberships = getattr(user, "organization_memberships", None)
    if memberships is not None:
        if memberships.filter(
                is_active=True,
                organization__is_active=True,
                role__in=[
                    OrganizationMembership.Role.OWNER,
                    OrganizationMembership.Role.ADMIN,
                    OrganizationMembership.Role.MANAGER,
                ],
        ).exists():
            return "business_dashboard"

    # 2. Admin plateforme métier (PLATFORM_ADMIN / superuser) → vue dédiée
    #    et NON ``admin:index`` (réservé au staff technique).
    role_cls = getattr(user.__class__, "PlatformRole", None)
    is_platform_admin_role = (
        role_cls is not None
        and getattr(user, "platform_role", None) == role_cls.PLATFORM_ADMIN
    )
    if is_platform_admin_role or user.is_superuser:
        return "admin_dashboard"

    # 3. Formateur.
    if getattr(user, "is_instructor", False):
        return "instructor:dashboard"

    # 4. Pur staff technique → admin Django.
    if user.is_staff:
        return "admin:index"

    # 5. Apprenant (cas par défaut).
    return "learner:dashboard"


def _month_bounds(now=None):
    """Retourne (now, month_start, next_month) pour le mois courant."""
    now = now or timezone.now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if month_start.month == 12:
        next_month = month_start.replace(year=month_start.year + 1, month=1)
    else:
        next_month = month_start.replace(month=month_start.month + 1)
    return now, month_start, next_month


def get_instructor_dashboard_kpis(user):
    """
    KPIs pour le dashboard formateur.

    Optimisation : chaque groupe logique (cours, inscriptions, reviews,
    paiements, progression, notifications) est réduit à UN seul aggregate()
    — soit 6 requêtes au total, au lieu de ~18 auparavant.
    """

    _, month_start, next_month = _month_bounds()

    # ---- 1 requête : stats cours
    course_stats = Course.objects.filter(instructor=user).aggregate(
        total=Count("id"),
        draft=Count("id", filter=Q(status=Course.Status.DRAFT)),
        review=Count("id", filter=Q(status=Course.Status.REVIEW)),
        published=Count("id", filter=Q(status=Course.Status.PUBLISHED)),
        archived=Count("id", filter=Q(status=Course.Status.ARCHIVED)),
    )

    # ---- 2 requêtes : sections + leçons (join sur course)
    total_sections = CourseSection.objects.filter(course__instructor=user).count()
    total_lessons = Lesson.objects.filter(section__course__instructor=user).count()
    total_media = MediaAsset.objects.filter(owner=user).count()

    # ---- 1 requête : stats enrollments
    enrollment_stats = Enrollment.objects.filter(course__instructor=user).aggregate(
        total=Count("id"),
        active=Count("id", filter=Q(status=Enrollment.Status.ACTIVE)),
        completed=Count("id", filter=Q(status=Enrollment.Status.COMPLETED)),
        canceled=Count("id", filter=Q(status=Enrollment.Status.CANCELED)),
    )

    # ---- 1 requête : reviews (avg + count)
    review_stats = CourseReview.objects.filter(
        course__instructor=user, is_public=True
    ).aggregate(
        avg=Coalesce(
            Avg("rating", output_field=DecimalField(max_digits=5, decimal_places=2)),
            Decimal("0.00"),
            output_field=DecimalField(max_digits=5, decimal_places=2),
        ),
        count=Count("id"),
    )

    # ---- 1 requête : paiements (total, mois, nombre)
    payments_qs = Payment.objects.filter(
        course_id__in=Course.objects.filter(instructor=user).values("id"),
        status=Payment.Status.PAID,
    )
    payment_stats = payments_qs.aggregate(
        revenue_total=Coalesce(
            Sum("amount", output_field=DecimalField(max_digits=12, decimal_places=2)),
            Decimal("0.00"),
            output_field=DecimalField(max_digits=12, decimal_places=2),
        ),
        revenue_month=Coalesce(
            Sum(
                "amount",
                filter=Q(paid_at__gte=month_start, paid_at__lt=next_month),
                output_field=DecimalField(max_digits=12, decimal_places=2),
            ),
            Decimal("0.00"),
            output_field=DecimalField(max_digits=12, decimal_places=2),
        ),
        payments_count=Count("id"),
    )

    # ---- 1 requête : progression
    progress_stats = LessonProgress.objects.filter(
        enrollment__course__instructor=user
    ).aggregate(
        completion_avg=Coalesce(
            Avg("progress_percent", output_field=IntegerField()),
            0,
            output_field=IntegerField(),
        ),
        completed_lessons=Count("id", filter=Q(completed=True)),
    )

    # ---- 1 requête : notifications non lues
    unread_notifications = Notification.objects.filter(
        user=user, is_read=False
    ).count()

    return {
        "courses": {
            "total": course_stats["total"] or 0,
            "draft": course_stats["draft"] or 0,
            "review": course_stats["review"] or 0,
            "published": course_stats["published"] or 0,
            "archived": course_stats["archived"] or 0,
        },
        "sections": {"total": total_sections},
        "lessons": {
            "total": total_lessons,
            "completed": progress_stats["completed_lessons"] or 0,
        },
        "media": {"total": total_media},
        "enrollments": {
            "total": enrollment_stats["total"] or 0,
            "active": enrollment_stats["active"] or 0,
            "completed": enrollment_stats["completed"] or 0,
            "canceled": enrollment_stats["canceled"] or 0,
        },
        "reviews": {
            "avg": round(float(review_stats["avg"] or 0), 1),
            "count": review_stats["count"] or 0,
        },
        "revenue": {
            "total": float(payment_stats["revenue_total"] or 0),
            "month": float(payment_stats["revenue_month"] or 0),
            "payments_count": payment_stats["payments_count"] or 0,
        },
        "progress": {
            "avg": int(progress_stats["completion_avg"] or 0),
            "completed_lessons_count": progress_stats["completed_lessons"] or 0,
        },
        "notifications": {"unread": unread_notifications},
    }


class InstructorDashboard(InstructorBaseMixin, TemplateView):
    template_name = "instructor/instructor_dash.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        user = self.request.user
        now, month_start, next_month = _month_bounds()

        # KPIs agrégés (6 requêtes) — mutualisés avec l'API.
        kpis_data = get_instructor_dashboard_kpis(user)

        instructor_courses = Course.objects.filter(instructor=user)
        reviews_qs = CourseReview.objects.filter(
            course__instructor=user, is_public=True
        )
        payments_qs = Payment.objects.filter(
            course_id__in=instructor_courses.values("id"),
            status=Payment.Status.PAID,
        )

        courses = (
            instructor_courses
            .annotate(
                sections_count=Coalesce(
                    Count("sections", distinct=True),
                    0,
                    output_field=IntegerField(),
                ),
                lessons_count=Coalesce(
                    Count("sections__lessons", distinct=True),
                    0,
                    output_field=IntegerField(),
                ),
                enrolled_count=Coalesce(
                    Count("enrollments", distinct=True),
                    0,
                    output_field=IntegerField(),
                ),
                rating_avg=Coalesce(
                    Avg(
                        "reviews__rating",
                        filter=Q(reviews__is_public=True),
                        output_field=DecimalField(max_digits=5, decimal_places=2),
                    ),
                    Decimal("0.00"),
                    output_field=DecimalField(max_digits=5, decimal_places=2),
                ),
                rating_count=Coalesce(
                    Count("reviews", filter=Q(reviews__is_public=True), distinct=True),
                    0,
                    output_field=IntegerField(),
                ),
            )
            .order_by("-updated_at")
        )

        course_progress_map = {
            row["enrollment__course"]: int(round(row["avg_progress"] or 0))
            for row in (
                LessonProgress.objects
                .filter(enrollment__course__in=instructor_courses)
                .values("enrollment__course")
                .annotate(avg_progress=Avg("progress_percent"))
            )
        }

        courses_list = []
        for course in courses[:12]:
            courses_list.append({
                "id": course.id,
                "title": course.title,
                "subtitle": course.subtitle,
                "slug": course.slug,
                "status": course.status,
                "course_type": course.course_type,
                "pricing_type": course.pricing_type,
                "price": course.price,
                "currency": course.currency,
                "thumbnail_url": course.thumbnail.url if course.thumbnail else "",
                "preview_video_url": course.preview_video_url,
                "sections_count": course.sections_count,
                "lessons_count": course.lessons_count,
                "enrolled_count": course.enrolled_count,
                "rating_avg": round(float(course.rating_avg or 0), 1),
                "rating_count": course.rating_count,
                "completion_rate": course_progress_map.get(course.id, 0),
                "updated_at": course.updated_at,
                "published_at": course.published_at,
            })

        top_courses = sorted(courses_list, key=lambda x: x["enrolled_count"], reverse=True)[:5]

        recent_reviews = reviews_qs.select_related("course", "user").order_by("-created_at")[:8]
        recent_payments = payments_qs.order_by("-paid_at", "-created_at")[:8]

        notifications = Notification.objects.filter(user=user).order_by("-created_at")[:10]

        courses_needing_work = []
        for c in courses_list:
            issues = []
            if c["sections_count"] == 0:
                issues.append("Aucune section")
            if c["lessons_count"] == 0:
                issues.append("Aucune leçon")
            if c["pricing_type"] != "FREE" and Decimal(str(c["price"] or 0)) <= 0:
                issues.append("Prix non défini")
            if not c["thumbnail_url"]:
                issues.append("Thumbnail manquant")

            if issues:
                courses_needing_work.append({
                    "id": c["id"],
                    "title": c["title"],
                    "status": c["status"],
                    "issues": issues,
                })

        recent_media = MediaAsset.objects.filter(owner=user).order_by("-created_at")[:8]

        # Projection plate conservée pour les composants secondaires qui
        # consomment encore les anciennes clés.
        flat_kpis = {
            "total_courses": kpis_data["courses"]["total"],
            "draft_courses": kpis_data["courses"]["draft"],
            "review_courses": kpis_data["courses"]["review"],
            "published_courses": kpis_data["courses"]["published"],
            "archived_courses": kpis_data["courses"]["archived"],
            "total_sections": kpis_data["sections"]["total"],
            "total_lessons": kpis_data["lessons"]["total"],
            "total_media": kpis_data["media"]["total"],
            "enrolled_total": kpis_data["enrollments"]["total"],
            "active_enrollments": kpis_data["enrollments"]["active"],
            "completed_enrollments": kpis_data["enrollments"]["completed"],
            "canceled_enrollments": kpis_data["enrollments"]["canceled"],
            "rating_avg": kpis_data["reviews"]["avg"],
            "rating_count": kpis_data["reviews"]["count"],
            "revenue_total": kpis_data["revenue"]["total"],
            "revenue_month": kpis_data["revenue"]["month"],
            "payments_count": kpis_data["revenue"]["payments_count"],
            "completion_avg": kpis_data["progress"]["avg"],
            "completed_lessons_count": kpis_data["progress"]["completed_lessons_count"],
            "unread_notifications": kpis_data["notifications"]["unread"],
        }

        context.update({
            "dashboard_now": now,
            "kpis": kpis_data,
            "kpis_flat": flat_kpis,
            "courses": courses_list,
            "recent_courses": courses[:6],
            "top_courses": top_courses,
            "recent_reviews": recent_reviews,
            "recent_payments": recent_payments,
            "notifications": notifications,
            "recent_activity": notifications,
            "recent_media": recent_media,
            "courses_needing_work": courses_needing_work,
        })
        return context


class InstructorCourseView(InstructorBaseMixin, TemplateView):
    template_name = "instructor/instructor_courses.html"
    allowed_roles = ("INSTRUCTOR",)

    paginate_by = 12

    def _safe_int(self, value, default=1):
        try:
            return int(value)
        except Exception:
            return default

    def _humanize_date(self, dt):
        if not dt:
            return "—"
        now = timezone.now()
        delta = now - dt

        if delta.days == 0:
            seconds = int(delta.total_seconds())
            if seconds < 60:
                return "à l’instant"
            if seconds < 3600:
                return f"il y a {seconds // 60} min"
            return f"il y a {seconds // 3600} h"

        if delta.days == 1:
            return "hier"
        if delta.days < 7:
            return f"il y a {delta.days} jours"
        return dt.strftime("%d/%m/%Y")

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        user = self.request.user

        # -----------------------------
        # Query params / filtres
        # -----------------------------
        q = (self.request.GET.get("q") or "").strip()
        status_filter = (self.request.GET.get("status") or "").strip()
        pricing_filter = (self.request.GET.get("pricing") or "").strip()
        type_filter = (self.request.GET.get("course_type") or "").strip()
        sort = (self.request.GET.get("sort") or "recent").strip()
        page_number = self._safe_int(self.request.GET.get("page"), 1)

        # -----------------------------
        # Base queryset
        # -----------------------------
        courses_qs = (
            Course.objects.filter(instructor=user)
            .select_related("category", "instructor")
            .annotate(
                sections_count=Coalesce(
                    Count("sections", distinct=True),
                    0,
                    output_field=models.IntegerField(),
                ),
                lessons_count=Coalesce(
                    Count("sections__lessons", distinct=True),
                    0,
                    output_field=models.IntegerField(),
                ),
                enrolled_count=Coalesce(
                    Count("enrollments", distinct=True),
                    0,
                    output_field=models.IntegerField(),
                ),
                rating_avg=Coalesce(
                    Avg(
                        "reviews__rating",
                        filter=Q(reviews__is_public=True),
                        output_field=models.DecimalField(max_digits=5, decimal_places=2),
                    ),
                    Decimal("0.00"),
                    output_field=models.DecimalField(max_digits=5, decimal_places=2),
                ),
                rating_count=Coalesce(
                    Count("reviews", filter=Q(reviews__is_public=True), distinct=True),
                    0,
                    output_field=models.IntegerField(),
                ),
            )
        )

        # -----------------------------
        # Filtres
        # -----------------------------
        if q:
            courses_qs = courses_qs.filter(
                Q(title__icontains=q) |
                Q(subtitle__icontains=q) |
                Q(description__icontains=q)
            )

        if status_filter:
            courses_qs = courses_qs.filter(status=status_filter)

        if pricing_filter:
            courses_qs = courses_qs.filter(pricing_type=pricing_filter)

        if type_filter:
            courses_qs = courses_qs.filter(course_type=type_filter)

        # -----------------------------
        # Tri
        # -----------------------------
        if sort == "title":
            courses_qs = courses_qs.order_by("title")
        elif sort == "popular":
            courses_qs = courses_qs.order_by("-enrolled_count", "-updated_at")
        elif sort == "rating":
            courses_qs = courses_qs.order_by("-rating_avg", "-rating_count", "-updated_at")
        elif sort == "published":
            courses_qs = courses_qs.order_by("-published_at", "-updated_at")
        else:
            courses_qs = courses_qs.order_by("-updated_at", "-created_at")

        # -----------------------------
        # KPIs globaux
        # -----------------------------
        instructor_courses = Course.objects.filter(instructor=user)

        total_courses = instructor_courses.count()
        draft_courses = instructor_courses.filter(status=Course.Status.DRAFT).count()
        review_courses = instructor_courses.filter(status=Course.Status.REVIEW).count()
        published_courses = instructor_courses.filter(status=Course.Status.PUBLISHED).count()
        archived_courses = instructor_courses.filter(status=Course.Status.ARCHIVED).count()

        total_sections = CourseSection.objects.filter(course__instructor=user).count()
        total_lessons = Lesson.objects.filter(section__course__instructor=user).count()
        total_media = MediaAsset.objects.filter(owner=user).count()

        reviews_qs = CourseReview.objects.filter(course__instructor=user, is_public=True)
        global_rating_avg = reviews_qs.aggregate(
            v=Coalesce(
                Avg("rating", output_field=models.DecimalField(max_digits=5, decimal_places=2)),
                Decimal("0.00"),
                output_field=models.DecimalField(max_digits=5, decimal_places=2),
            )
        )["v"] or Decimal("0.00")
        global_rating_count = reviews_qs.count()

        enrollments_qs = Enrollment.objects.filter(course__instructor=user)
        enrolled_total = enrollments_qs.count()

        completion_avg = LessonProgress.objects.filter(
            enrollment__course__instructor=user
        ).aggregate(
            v=Coalesce(
                Avg("progress_percent", output_field=models.IntegerField()),
                0,
                output_field=models.IntegerField(),
            )
        )["v"] or 0

        unread_notifications = Notification.objects.filter(user=user, is_read=False).count()

        # -----------------------------
        # Préparer les cartes cours
        # -----------------------------
        courses_payload = []
        courses_needing_work = []

        for course in courses_qs:
            course_progress_avg = LessonProgress.objects.filter(
                enrollment__course=course
            ).aggregate(
                v=Coalesce(
                    Avg("progress_percent", output_field=models.IntegerField()),
                    0,
                    output_field=models.IntegerField(),
                )
            )["v"] or 0

            thumbnail_url = ""
            try:
                if course.thumbnail:
                    thumbnail_url = course.thumbnail.url
            except Exception:
                thumbnail_url = ""

            issues = []
            if course.sections_count == 0:
                issues.append("Aucune section")
            if course.lessons_count == 0:
                issues.append("Aucune leçon")
            if course.pricing_type != Course.PricingType.FREE and Decimal(str(course.price or 0)) <= 0:
                issues.append("Prix non défini")
            if not thumbnail_url:
                issues.append("Thumbnail manquant")

            course_dict = {
                "id": course.id,
                "title": course.title,
                "subtitle": course.subtitle or "",
                "slug": course.slug,
                "status": course.status,
                "course_type": course.course_type,
                "pricing_type": course.pricing_type,
                "price": course.price,
                "currency": course.currency,
                "thumbnail_url": thumbnail_url,
                "preview_video_url": course.preview_video_url or "",
                "sections_count": course.sections_count,
                "lessons_count": course.lessons_count,
                "enrolled_count": course.enrolled_count,
                "rating_avg": round(float(course.rating_avg or 0), 1),
                "rating_count": course.rating_count,
                "completion_rate": int(course_progress_avg),
                "updated_at": course.updated_at,
                "updated_at_human": self._humanize_date(course.updated_at),
                "published_at": course.published_at,
                "published_at_human": self._humanize_date(course.published_at) if course.published_at else "—",
                "issues": issues,
                "needs_work": len(issues) > 0,
            }
            courses_payload.append(course_dict)

            if issues:
                courses_needing_work.append({
                    "id": course.id,
                    "title": course.title,
                    "status": course.status,
                    "issues": issues,
                })

        # -----------------------------
        # Pagination
        # -----------------------------
        paginator = Paginator(courses_payload, self.paginate_by)
        page_obj = paginator.get_page(page_number)

        # -----------------------------
        # Segments utiles
        # -----------------------------
        featured_courses = sorted(
            courses_payload,
            key=lambda x: (x["enrolled_count"], x["rating_avg"], x["completion_rate"]),
            reverse=True
        )[:5]

        recent_drafts = [c for c in courses_payload if c["status"] == Course.Status.DRAFT][:5]

        recent_media = MediaAsset.objects.filter(owner=user).order_by("-created_at")[:8]
        recent_notifications = Notification.objects.filter(user=user).order_by("-created_at")[:8]

        # -----------------------------
        # Context
        # -----------------------------
        context.update({
            "side_active": "courses",
            "page_title": "Mes cours",
            "page_subtitle": "Gérez votre catalogue de formation, vos contenus et la qualité de publication.",

            "filters": {
                "q": q,
                "status": status_filter,
                "pricing": pricing_filter,
                "course_type": type_filter,
                "sort": sort,
            },

            "kpis": {
                "total_courses": total_courses,
                "draft_courses": draft_courses,
                "review_courses": review_courses,
                "published_courses": published_courses,
                "archived_courses": archived_courses,
                "total_sections": total_sections,
                "total_lessons": total_lessons,
                "total_media": total_media,
                "enrolled_total": enrolled_total,
                "rating_avg": round(float(global_rating_avg or 0), 1),
                "rating_count": global_rating_count,
                "completion_avg": int(completion_avg or 0),
                "unread_notifications": unread_notifications,
            },

            "courses": page_obj.object_list,
            "page_obj": page_obj,
            "paginator": paginator,
            "is_paginated": page_obj.has_other_pages(),

            "featured_courses": featured_courses,
            "recent_drafts": recent_drafts,
            "courses_needing_work": courses_needing_work[:8],
            "recent_media": recent_media,
            "recent_notifications": recent_notifications,

            "status_choices": Course.Status.choices,
            "pricing_choices": Course.PricingType.choices,
            "course_type_choices": Course.CourseType.choices,
            "sort_choices": [
                ("recent", "Plus récents"),
                ("title", "Titre A-Z"),
                ("popular", "Plus populaires"),
                ("rating", "Mieux notés"),
                ("published", "Récemment publiés"),
            ],
        })
        return context


class InstructorCourseCreateView(InstructorBaseMixin, TemplateView):
    template_name = "instructor/instructor_course_create.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context.update({
            "side_active": "courses",
            "page_title": "Créer un cours",
            "page_subtitle": "Initialisez une nouvelle offre de formation et préparez sa structure.",
            "status_choices": Course.Status.choices,
            "pricing_choices": Course.PricingType.choices,
            "course_type_choices": Course.CourseType.choices,
        })
        return context


class InstructorCourseDetailView(InstructorBaseMixin, TemplateView):
    template_name = "instructor/instructor_course_detail.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        course = self.get_instructor_course()

        course = (
            Course.objects.filter(id=course.id, instructor=self.request.user)
            .select_related("category", "instructor")
            .annotate(
                sections_count=Coalesce(Count("sections", distinct=True), 0, output_field=models.IntegerField()),
                lessons_count=Coalesce(Count("sections__lessons", distinct=True), 0,
                                       output_field=models.IntegerField()),
                enrolled_count=Coalesce(Count("enrollments", distinct=True), 0, output_field=models.IntegerField()),
                rating_avg=Coalesce(
                    Avg(
                        "reviews__rating",
                        filter=Q(reviews__is_public=True),
                        output_field=models.DecimalField(max_digits=5, decimal_places=2),
                    ),
                    Decimal("0.00"),
                    output_field=models.DecimalField(max_digits=5, decimal_places=2),
                ),
                rating_count=Coalesce(
                    Count("reviews", filter=Q(reviews__is_public=True), distinct=True),
                    0,
                    output_field=models.IntegerField(),
                ),
            )
            .first()
        )

        sections = (
            CourseSection.objects.filter(course=course)
            .annotate(
                lessons_count=Coalesce(Count("lessons", distinct=True), 0, output_field=models.IntegerField())
            )
            .order_by("order")
        )

        lessons = Lesson.objects.filter(section__course=course).select_related("section", "media_asset").order_by(
            "section__order", "order"
        )

        recent_reviews = (
            CourseReview.objects.filter(course=course, is_public=True)
            .select_related("user")
            .order_by("-created_at")[:10]
        )

        enrollments = Enrollment.objects.filter(course=course).select_related("user").order_by("-enrolled_at")[:12]
        progress_avg = self._course_completion_avg(course)
        issues = self._course_issues(course)

        context.update({
            "side_active": "courses",
            "course": self._serialize_course_card(course),
            "course_obj": course,
            "sections": sections,
            "lessons": lessons,
            "recent_reviews": recent_reviews,
            "recent_enrollments": enrollments,
            "progress_avg": int(progress_avg),
            "issues": issues,
            "page_title": course.title,
            "page_subtitle": "Vue détaillée du cours, de ses contenus et de sa performance.",
        })
        return context


class InstructorCourseUpdateView(InstructorBaseMixin, TemplateView):
    template_name = "instructor/instructor_course_update.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        course = self.get_instructor_course()

        context.update({
            "side_active": "courses",
            "course": course,
            "course_card": self._serialize_course_card(course),
            "page_title": f"Modifier — {course.title}",
            "page_subtitle": "Mettez à jour les informations, le pricing et les éléments marketing du cours.",
            "status_choices": Course.Status.choices,
            "pricing_choices": Course.PricingType.choices,
            "course_type_choices": Course.CourseType.choices,
        })
        return context


class InstructorCourseBuilderView(InstructorBaseMixin, TemplateView):
    template_name = "instructor/instructor_builder.html"
    allowed_roles = ("INSTRUCTOR",)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        course_id = self.kwargs.get("course_id")

        course = get_object_or_404(Course, id=course_id, instructor=self.request.user)

        context["side_active"] = "builder"
        context["page_title"] = "Builder du cours"
        context["course"] = course
        return context


class InstructorMediaLibraryView(InstructorBaseMixin, TemplateView):
    template_name = "instructor/instructor_media.html"
    allowed_roles = ("INSTRUCTOR",)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context.update({
            "side_active": "media",
            "page_title": "Bibliothèque média",
            "page_subtitle": "Consultez, filtrez et ouvrez les fichiers MinIO associés à votre espace instructeur.",
        })
        return context


class InstructorMediaDetailPageView(InstructorBaseMixin, TemplateView):
    template_name = "instructor/instructor_media_detail.html"

    def dispatch(self, request, *args, **kwargs):
        if getattr(request.user, "role", None) not in ("INSTRUCTOR", "SUPERADMIN"):
            from django.http import HttpResponseForbidden
            return HttpResponseForbidden("Forbidden")
        return super().dispatch(request, *args, **kwargs)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        asset = get_object_or_404(MediaAsset, id=self.kwargs["asset_id"])

        if asset.owner_id != self.request.user.id and getattr(self.request.user, "role", None) != "SUPERADMIN":
            from django.http import Http404
            raise Http404()

        context.update({
            "side_active": "media",
            "asset": asset,
        })
        return context


class InstructorQuizListPageView(InstructorBaseMixin, TemplateView):
    template_name = "instructor/quiz/quiz_list.html"
    allowed_roles = ("INSTRUCTOR",)

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["side_active"] = "quizzes"
        ctx["quiz_endpoints"] = {
            "list": reverse("api_instructor_quiz_list"),
        }
        return ctx


class InstructorQuizCreatePageView(InstructorBaseMixin, TemplateView):
    template_name = "instructor/quiz/quiz_create.html"
    allowed_roles = ("INSTRUCTOR",)

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["side_active"] = "quiz_create"
        ctx["course_id"] = self.request.GET.get("course")
        ctx["section_id"] = self.request.GET.get("section")
        return ctx


class InstructorQuizDetailPageView(InstructorBaseMixin, TemplateView):
    template_name = "instructor/quiz/quiz_detail.html"
    allowed_roles = ("INSTRUCTOR",)

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        quiz_id = self.kwargs.get("quiz_id")
        ctx["quiz_id"] = quiz_id
        ctx["side_active"] = "quizzes"
        ctx["quiz_endpoints"] = {
            "detail": reverse("api_instructor_quiz_detail", kwargs={"quiz_id": quiz_id}),
            "question_create": reverse("api_instructor_quiz_question_create", kwargs={"quiz_id": quiz_id}),
        }
        return ctx


class InstructorQuizUpdatePageView(InstructorBaseMixin, TemplateView):
    template_name = "instructor/quiz/quiz_update.html"
    allowed_roles = ("INSTRUCTOR",)

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        quiz_id = self.kwargs.get("quiz_id")
        ctx["quiz_id"] = quiz_id
        ctx["side_active"] = "quizzes"
        ctx["quiz_endpoints"] = {
            "detail": reverse("api_instructor_quiz_detail", kwargs={"quiz_id": quiz_id}),
            "update": reverse("api_instructor_quiz_update", kwargs={"quiz_id": quiz_id}),
            "question_create": reverse("api_instructor_quiz_question_create", kwargs={"quiz_id": quiz_id}),
        }
        return ctx


class StudentDashboard(LoginRequiredMixin, LearnerRequiredMixin, TemplateView):
    template_name = "learner/student_dash.html"

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        user = self.request.user
        enrollments = (
            Enrollment.objects.filter(user=user)
            .exclude(status=Enrollment.Status.CANCELED)
            .select_related("course", "current_lesson")
            .order_by("-updated_at")
        )
        active_enrollments = enrollments.filter(status=Enrollment.Status.ACTIVE)
        certificates = (
            IssuedCertificate.objects.filter(user=user, revoked_at__isnull=True)
            .select_related("course")
            .order_by("-issued_at")
        )
        total_seconds = LessonProgress.objects.filter(
            enrollment__user=user,
            enrollment__status__in=[
                Enrollment.Status.ACTIVE,
                Enrollment.Status.COMPLETED,
            ],
        ).aggregate(
            total=Coalesce(Sum("last_position_sec"), 0, output_field=IntegerField())
        )["total"]
        learner_kyc = getattr(user, "kyc", None)
        onboarding_profile = getattr(learner_kyc, "onboarding_profile", {}) or {}

        ctx.update({
            "kpis": {
                "in_progress": active_enrollments.count(),
                "completed": enrollments.filter(
                    status=Enrollment.Status.COMPLETED
                ).count(),
                "certificates": certificates.count(),
                "total_hours": total_seconds / 3600,
            },
            "continue_enrollment": active_enrollments.first(),
            "active_enrollments": active_enrollments,
            "recommended_courses": recommend_courses(
                onboarding_profile,
                limit=4,
                user=user,
            ),
            "recent_certificates": certificates[:4],
        })
        # endpoints côté template (pratique pour Alpine)
        # /!\ Ces clés sont consommées par Alpine côté JS (cf. learner/
        # student_dash.html — ``loadOrganizationCourses`` lit
        # ``endpoints.organization_courses``). Elles n'ont aucun lien avec les
        # noms d'URL Django : ne pas y appliquer le mapping de rebrand
        # ``organization_courses → org:courses``.
        ctx["learner_endpoints"] = {
            "me": "/api/learner/me/",
            "kpis": "/api/learner/kpis/",
            "enrollments": "/api/learner/enrollments/",
            "organization_courses": "/api/learner/organization-courses/",
            "notifications": "/api/learner/notifications/",
            "payments": "/api/learner/payments/",
            # détail/progress via /api/learner/courses/<id>/...
        }
        return ctx


class LearnerExploreView(LoginRequiredMixin, LearnerRequiredMixin, TemplateView):
    template_name = "learner/learner_explore.html"
    allowed_roles = ("LEARNER",)


class LearnerCoursePlayerView(LoginRequiredMixin, LearnerRequiredMixin, TemplateView):
    template_name = "learner/learner_course_player.html"

    def dispatch(self, request, *args, **kwargs):
        """Sécurité + UX : valide Enrollment actif avant rendu.

        Policy (corrigée) :
        - 404 si cours inexistant (anti-énumération).
        - Le statut du cours (PUBLISHED / DRAFT / REVIEW) n'est plus
          bloquant côté player. Un apprenant inscrit doit pouvoir revenir
          consulter ses leçons même si l'instructor a temporairement
          basculé le cours en DRAFT pour mise à jour. Seul un cours
          ARCHIVED reste bloqué (cours retiré du catalogue, on protège
          en redirigeant).
        - Redirect vers le détail public + flash message si pas
          d'Enrollment actif.
        - Rendu de la page sinon.
        """
        from django.contrib import messages
        from django.shortcuts import get_object_or_404, redirect

        from catalog.models import Course
        from enrollments.models import Enrollment

        course_id = kwargs.get("course_id")
        # 1. Cours existant (anti-énumération).
        course = get_object_or_404(Course, pk=course_id)
        self.course = course

        # 2. Cours archivé → on bloque l'accès player (l'instructor a
        #    explicitement retiré le cours).
        if course.status == Course.Status.ARCHIVED:
            messages.warning(
                request,
                "Ce cours a été archivé et n'est plus accessible.",
            )
            return redirect("/")

        # 3. Enrollment actif obligatoire.
        enrollment = (
            Enrollment.objects.filter(user=request.user, course=course)
            .exclude(status=Enrollment.Status.CANCELED)
            .select_related("course", "current_lesson")
            .first()
        )
        if enrollment is None:
            messages.warning(
                request,
                "Vous devez être inscrit à ce cours pour le consulter.",
            )
            # Redirige vers la page de détail publique (pour inscription/achat).
            try:
                from django.urls import reverse
                slug = course.slug or ""
                target = reverse(
                    "course_public_page",
                    kwargs={"slug": slug, "course_id": course.id},
                ) if slug else f"/landinghome/courses/{course.id}/"
                return redirect(target)
            except Exception:
                return redirect("/")
        self.enrollment = enrollment
        return super().dispatch(request, *args, **kwargs)

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["course_id"] = self.kwargs.get("course_id")
        # Exposer le course et l'enrollment au template pour un rendu
        # server-side robuste (titre, breadcrumb, statut) — l'API JS
        # reste utilisée pour le contenu dynamique.
        if hasattr(self, "course"):
            ctx["course"] = self.course
        if hasattr(self, "enrollment"):
            ctx["enrollment"] = self.enrollment
        return ctx


class OrganisationDashboard(LoginRequiredMixin, TemplateView):
    """Vue de redirection pour ``business_dashboard``.

    Cette URL était autrefois branchée sur un dashboard générique qui :
    - exigeait ``is_staff or is_superuser`` (incompatible avec un OWNER
      d'organisation non-staff → boucle de redirection),
    - et affichait des KPIs **globaux à la plateforme** (``Course.objects.count()``,
      ``User.objects.count()``...) à n'importe quel admin org → fuite de données.

    Comportement corrigé :
    1. user non authentifié → redirect login ;
    2. admin plateforme ET aucune org admin → redirect platform admin
       (ou home si la route n'existe pas encore) ;
    3. exactement 1 org accessible (admin/owner/manager) → redirect direct
       vers ``organization_dashboard`` de cette org ;
    4. plusieurs orgs accessibles → redirect vers la 1re et stocke un
       message UX (le switcher de la Vague 2 prendra le relais) ;
    5. aucune org → redirect vers ``learner_dashboard`` (l'utilisateur
       n'a pas l'accréditation pour le business dashboard).

    Aucun template n'est rendu : c'est une porte d'entrée routante.
    """

    template_name = "organization/dashboard.html"  # fallback uniquement

    # rôles "manager" autorisés (cf. OrganizationScopedMixin)
    _MANAGER_ROLES = (
        OrganizationMembership.Role.OWNER,
        OrganizationMembership.Role.ADMIN,
        OrganizationMembership.Role.MANAGER,
    )

    def dispatch(self, request, *args, **kwargs):
        user = request.user
        if not user.is_authenticated:
            return redirect_to_login(request.get_full_path())

        # 1. Liste des orgs accessibles côté management (admin/owner/manager).
        accessible_orgs = list(
            user.organization_memberships
            .filter(
                is_active=True,
                organization__is_active=True,
                role__in=self._MANAGER_ROLES,
            )
            .select_related("organization")
            .order_by("organization__name")[:5]
        )

        # 2. Cas sans org accessible : on aiguille selon le profil effectif.
        if not accessible_orgs:
            # 2a. Admin plateforme (rôle PLATFORM_ADMIN / superuser)
            #     → vue métier dédiée. ``admin:index`` est réservé au staff
            #     technique et reste accessible depuis ``admin_dashboard``.
            role_cls = getattr(user.__class__, "PlatformRole", None)
            is_platform_admin_role = (
                role_cls is not None
                and getattr(user, "platform_role", None) == role_cls.PLATFORM_ADMIN
            )
            if is_platform_admin_role or user.is_superuser:
                try:
                    return redirect("admin_dashboard")
                except NoReverseMatch:
                    return redirect("home")

            # 2b. Pur staff technique → admin Django.
            if user.is_staff:
                try:
                    return redirect("admin:index")
                except NoReverseMatch:
                    return redirect("home")

            if getattr(user, "is_instructor", False):
                # Un formateur sans rôle org doit aller sur son espace
                # formateur, pas sur l'espace apprenant — ça évitait un
                # aller-retour learner → instructor lorsqu'il cliquait sur
                # un ancien lien ``business_dashboard``.
                return redirect("instructor:dashboard")
            # Pas d'org / pas de rôle élevé → espace apprenant.
            return redirect("learner:dashboard")

        # 3. Plusieurs orgs accessibles : on prend la 1re mais on signale à
        #    l'utilisateur qu'il peut basculer via le switcher de la topbar.
        first = accessible_orgs[0]
        if len(accessible_orgs) > 1:
            messages.info(
                request,
                "Vous avez accès à plusieurs organisations. Affichage de "
                f"« {first.organization.name} » par défaut — utilisez le "
                "sélecteur d’espace en haut à droite pour changer.",
            )

        # 4. Redirect vers le dashboard org (URL namespacée + org_id).
        try:
            return redirect("org:dashboard", organization_id=first.organization_id)
        except NoReverseMatch:
            # Fallback ultime si la route n'est pas montée
            return redirect("home")


class _PlatformAdminGateMixin(LoginRequiredMixin):
    """Gate d'accès commun aux vues plateforme admin.

    Règles d'accès :
    - utilisateur anonyme → renvoi vers le login ;
    - utilisateur sans rôle ``PLATFORM_ADMIN`` ni ``is_superuser`` →
      redirection vers son dashboard métier (``_redirect_by_role``).

    On n'expose AUCUN lien vers l'admin Django dans les pages métier :
    l'admin technique reste réservé au staff Django et n'est jamais
    surfacé dans les sidebars utilisateurs (un OWNER d'org cumulant
    ``is_staff=True`` ne doit pas tomber sur des écrans techniques par
    erreur).
    """

    def dispatch(self, request, *args, **kwargs):
        user = request.user
        if not user.is_authenticated:
            return redirect_to_login(request.get_full_path())

        role_cls = getattr(user.__class__, "PlatformRole", None)
        is_platform_admin_role = bool(
            role_cls is not None
            and getattr(user, "platform_role", None) == role_cls.PLATFORM_ADMIN
        )

        if not (is_platform_admin_role or user.is_superuser):
            from formations.Rolemixin import _redirect_by_role
            try:
                target = _redirect_by_role(user)
                # Garde anti-boucle : on ne se redirige pas sur soi-même.
                if target == "admin_dashboard":
                    return redirect("home")
                return redirect(target)
            except NoReverseMatch:
                return redirect("home")

        return super().dispatch(request, *args, **kwargs)


@method_decorator(_platform_admin_otp_required, name="dispatch")
class PlatformAdminDashboard(_PlatformAdminGateMixin, TemplateView):
    """Dashboard dédié aux administrateurs plateforme (rôle PLATFORM_ADMIN).

    Cet espace est volontairement séparé de ``admin:index`` (l'admin
    technique Django, réservé au staff). On y centralise le pilotage
    métier : vue d'ensemble des organisations, des utilisateurs, du
    catalogue.

    Règles d'accès :
    - utilisateur anonyme → renvoi vers le login ;
    - utilisateur sans rôle ``PLATFORM_ADMIN`` ni ``is_superuser`` →
      redirection vers son dashboard métier (``_redirect_by_role``) ;
    - utilisateur autorisé → rendu de ``platform/admin_dashboard.html``.
    """

    template_name = "platform/admin_dashboard.html"

    # Le gate (auth + rôle PLATFORM_ADMIN) est porté par
    # ``_PlatformAdminGateMixin``.

    def get_context_data(self, **kwargs):
        import datetime

        from django.db.models import FloatField, Value
        from django.db.models.functions import TruncDate

        from organizations.models import Organization

        context = super().get_context_data(**kwargs)

        now = timezone.now()
        last_7 = now - datetime.timedelta(days=7)
        last_30 = now - datetime.timedelta(days=30)
        last_90 = now - datetime.timedelta(days=90)

        # ---------- KPIs cœur ------------------------------------------------
        try:
            total_orgs = Organization.objects.filter(is_active=True).count()
        except Exception:
            total_orgs = 0
        try:
            total_users = User.objects.filter(is_active=True).count()
        except Exception:
            total_users = 0
        try:
            total_courses = Course.objects.count()
            published_courses = Course.objects.filter(
                status=Course.Status.PUBLISHED
            ).count()
            draft_courses = Course.objects.filter(status=Course.Status.DRAFT).count()
            review_courses = Course.objects.filter(status=Course.Status.REVIEW).count()
            archived_courses = Course.objects.filter(status=Course.Status.ARCHIVED).count()
        except Exception:
            total_courses = published_courses = 0
            draft_courses = review_courses = archived_courses = 0

        try:
            total_enrollments = Enrollment.objects.count()
            active_enrollments = (
                Enrollment.objects.filter(status=Enrollment.Status.ACTIVE).count()
                if hasattr(Enrollment, "Status")
                else total_enrollments
            )
            completed_enrollments = (
                Enrollment.objects.filter(status=Enrollment.Status.COMPLETED).count()
                if hasattr(Enrollment, "Status")
                else 0
            )
        except Exception:
            total_enrollments = active_enrollments = completed_enrollments = 0

        try:
            total_quizzes = Quiz.objects.count()
            active_quizzes = Quiz.objects.filter(is_active=True).count()
        except Exception:
            total_quizzes = active_quizzes = 0

        # Revenus globaux (paiements PAID).
        try:
            total_revenue = Payment.objects.filter(
                status=Payment.Status.PAID
            ).aggregate(
                v=Coalesce(
                    Sum("amount"),
                    Value(Decimal("0.00")),
                    output_field=DecimalField(max_digits=14, decimal_places=2),
                )
            )["v"]
        except Exception:
            total_revenue = Decimal("0.00")

        # Tendances : nouveaux users / nouveaux cours / nouveaux inscrits.
        try:
            new_users_7d = User.objects.filter(date_joined__gte=last_7).count() \
                if hasattr(User, "date_joined") \
                else User.objects.filter(created_at__gte=last_7).count()
            new_users_30d = User.objects.filter(date_joined__gte=last_30).count() \
                if hasattr(User, "date_joined") \
                else User.objects.filter(created_at__gte=last_30).count()
        except Exception:
            new_users_7d = new_users_30d = 0

        try:
            new_courses_30d = Course.objects.filter(created_at__gte=last_30).count()
            new_enrollments_30d = Enrollment.objects.filter(
                enrolled_at__gte=last_30
            ).count()
            new_enrollments_90d = Enrollment.objects.filter(
                enrolled_at__gte=last_90
            ).count()
        except Exception:
            new_courses_30d = new_enrollments_30d = new_enrollments_90d = 0

        # ---------- TOPS -----------------------------------------------------

        # Top 5 organisations par nombre de cours et d'inscrits.
        # NB ``Course.company`` est exposé via related_name="internal_courses"
        # côté ``Organization`` — pas "courses".
        top_organizations = (
            Organization.objects.filter(is_active=True)
            .annotate(
                courses_count=Coalesce(
                    Count("internal_courses", distinct=True),
                    0,
                    output_field=IntegerField(),
                ),
                enrollments_count=Coalesce(
                    Count("internal_courses__enrollments", distinct=True),
                    0,
                    output_field=IntegerField(),
                ),
                members_count=Coalesce(
                    Count(
                        "memberships",
                        filter=Q(memberships__is_active=True),
                        distinct=True,
                    ),
                    0,
                    output_field=IntegerField(),
                ),
            )
            .order_by("-enrollments_count", "-courses_count")[:5]
        )

        # Top 5 cours plateforme-wide par inscrits.
        top_courses = (
            Course.objects
            .select_related("category", "instructor", "company")
            .annotate(
                enrolled_count=Coalesce(
                    Count("enrollments", distinct=True),
                    0,
                    output_field=IntegerField(),
                ),
                rating_avg=Coalesce(
                    Avg(
                        "reviews__rating",
                        filter=Q(reviews__is_public=True),
                        output_field=FloatField(),
                    ),
                    Value(0.0),
                    output_field=FloatField(),
                ),
            )
            .order_by("-enrolled_count")[:5]
        )

        # Tendance : top 5 cours par inscrits sur les 30 derniers jours.
        trending_courses = (
            Course.objects
            .select_related("category", "instructor", "company")
            .annotate(
                recent_enrollments=Coalesce(
                    Count(
                        "enrollments",
                        filter=Q(enrollments__enrolled_at__gte=last_30),
                        distinct=True,
                    ),
                    0,
                    output_field=IntegerField(),
                ),
            )
            .filter(recent_enrollments__gt=0)
            .order_by("-recent_enrollments")[:5]
        )

        # Top 5 formateurs plateforme-wide par inscriptions cumulées.
        # NB ``Course.instructor`` est exposé via related_name="courses_created"
        # côté ``User`` — pas "courses".
        top_instructors = (
            User.objects.filter(is_active=True)
            .annotate(
                courses_count=Coalesce(
                    Count("courses_created", distinct=True),
                    0,
                    output_field=IntegerField(),
                ),
                enrolled_total=Coalesce(
                    Count("courses_created__enrollments", distinct=True),
                    0,
                    output_field=IntegerField(),
                ),
            )
            .filter(courses_count__gt=0)
            .order_by("-enrolled_total", "-courses_count")[:5]
        )

        # Top 5 catégories par cours publiés.
        top_categories = (
            Category.objects
            .annotate(
                published_count=Coalesce(
                    Count(
                        "courses",
                        filter=Q(courses__status=Course.Status.PUBLISHED),
                        distinct=True,
                    ),
                    0,
                    output_field=IntegerField(),
                ),
            )
            .filter(published_count__gt=0)
            .order_by("-published_count")[:5]
        )

        # Tendance d'inscriptions par jour sur 30 jours (sparkline).
        try:
            enrollments_trend_qs = (
                Enrollment.objects.filter(enrolled_at__gte=last_30)
                .annotate(day=TruncDate("enrolled_at"))
                .values("day")
                .annotate(n=Count("id"))
                .order_by("day")
            )
            enrollments_trend = [
                {
                    "day": row["day"].isoformat() if row["day"] else "",
                    "count": row["n"],
                }
                for row in enrollments_trend_qs
            ]
        except Exception:
            enrollments_trend = []

        # Signaux qualité : ce qui mérite une attention plateforme.
        try:
            courses_unassigned = Course.objects.filter(instructor__isnull=True).count()
            courses_no_sections = Course.objects.annotate(
                sec=Count("sections")
            ).filter(sec=0).count()
            inactive_orgs = Organization.objects.filter(is_active=False).count()
        except Exception:
            courses_unassigned = courses_no_sections = inactive_orgs = 0

        # ---------- Compose context -----------------------------------------
        stats = {
            "total_organizations": total_orgs,
            "inactive_organizations": inactive_orgs,
            "total_users": total_users,
            "total_courses": total_courses,
            "published_courses": published_courses,
            "draft_courses": draft_courses,
            "review_courses": review_courses,
            "archived_courses": archived_courses,
            "total_enrollments": total_enrollments,
            "active_enrollments": active_enrollments,
            "completed_enrollments": completed_enrollments,
            "completion_rate": (
                (completed_enrollments / total_enrollments * 100.0)
                if total_enrollments else 0.0
            ),
            "total_quizzes": total_quizzes,
            "active_quizzes": active_quizzes,
            "total_revenue": total_revenue,
            "new_users_7d": new_users_7d,
            "new_users_30d": new_users_30d,
            "new_courses_30d": new_courses_30d,
            "new_enrollments_30d": new_enrollments_30d,
            "new_enrollments_90d": new_enrollments_90d,
            "courses_unassigned": courses_unassigned,
            "courses_no_sections": courses_no_sections,
        }

        context.update({
            "stats": stats,
            "top_organizations": top_organizations,
            "top_courses": top_courses,
            "trending_courses": trending_courses,
            "top_instructors": top_instructors,
            "top_categories": top_categories,
            "enrollments_trend": enrollments_trend,
            "kpi_cards": [
                {
                    "label": "Organisations actives",
                    "value": total_orgs,
                    "sub": f"{inactive_orgs} inactives",
                },
                {
                    "label": "Utilisateurs actifs",
                    "value": total_users,
                    "sub": f"+{new_users_30d} sur 30j",
                },
                {
                    "label": "Cours publiés",
                    "value": published_courses,
                    "sub": f"{total_courses} au total",
                },
                {
                    "label": "Inscriptions",
                    "value": total_enrollments,
                    "sub": f"+{new_enrollments_30d} sur 30j",
                },
            ],
        })
        return context


@method_decorator(_platform_admin_otp_required, name="dispatch")
class PlatformOrganizationsView(_PlatformAdminGateMixin, TemplateView):
    """Liste métier des organisations (vue plateforme admin).

    Affiche : nom, statut, ville, nombre de cours, d'inscrits cumulés et
    de membres actifs. Filtres simples (recherche + actif/inactif).
    Pagination simple par 30.
    """

    template_name = "platform/organizations.html"

    def get_context_data(self, **kwargs):
        from django.core.paginator import Paginator

        from organizations.models import Organization

        context = super().get_context_data(**kwargs)

        q = (self.request.GET.get("q") or "").strip()
        status_filter = (self.request.GET.get("status") or "").strip()

        qs = (
            Organization.objects.all()
            .annotate(
                courses_count=Coalesce(
                    Count("internal_courses", distinct=True),
                    0,
                    output_field=IntegerField(),
                ),
                enrollments_count=Coalesce(
                    Count("internal_courses__enrollments", distinct=True),
                    0,
                    output_field=IntegerField(),
                ),
                members_count=Coalesce(
                    Count(
                        "memberships",
                        filter=Q(memberships__is_active=True),
                        distinct=True,
                    ),
                    0,
                    output_field=IntegerField(),
                ),
            )
            .order_by("-is_active", "name")
        )

        if q:
            qs = qs.filter(
                Q(name__icontains=q)
                | Q(slug__icontains=q)
                | Q(email__icontains=q)
                | Q(city__icontains=q)
            )
        if status_filter == "active":
            qs = qs.filter(is_active=True)
        elif status_filter == "inactive":
            qs = qs.filter(is_active=False)

        paginator = Paginator(qs, 30)
        page = paginator.get_page(self.request.GET.get("page"))

        # Compteurs globaux (avant filtrage) pour les KPIs.
        all_orgs = Organization.objects.all()
        context.update({
            "page_title": "Organisations — plateforme",
            "page_obj": page,
            "is_paginated": page.has_other_pages(),
            "filter_q": q,
            "filter_status": status_filter,
            "totals": {
                "all": all_orgs.count(),
                "active": all_orgs.filter(is_active=True).count(),
                "inactive": all_orgs.filter(is_active=False).count(),
            },
        })
        return context


@method_decorator(_platform_admin_otp_required, name="dispatch")
class PlatformUsersView(_PlatformAdminGateMixin, TemplateView):
    """Liste plateforme des utilisateurs avec filtre par rôle.

    Le filtre ``role`` est interprété comme :
    - ``platform_admin`` → ``platform_role == PLATFORM_ADMIN``
    - ``instructor`` → a un ``InstructorProfile`` ou rôle org INSTRUCTOR
    - ``learner`` → a un ``LearnerProfile`` ou rôle org LEARNER
    - ``org_admin`` → membership OWNER/ADMIN/MANAGER actif

    On ne propose volontairement PAS de bouton "désactiver" ici — la
    désactivation d'un user plateforme se fait via le shell ou l'admin
    Django (action sensible). Cette vue est en lecture seule.
    """

    template_name = "platform/users.html"

    def get_context_data(self, **kwargs):
        from django.core.paginator import Paginator
        from django.db.models import Exists, OuterRef

        from compte.models import LearnerProfile
        from organizations.models import OrganizationMembership

        context = super().get_context_data(**kwargs)

        q = (self.request.GET.get("q") or "").strip()
        role = (self.request.GET.get("role") or "").strip()

        qs = User.objects.all().order_by("-created_at")

        if q:
            qs = qs.filter(
                Q(email__icontains=q)
                | Q(full_name__icontains=q)
                | Q(phone__icontains=q)
            )

        if role == "platform_admin":
            qs = qs.filter(platform_role="PLATFORM_ADMIN")
        elif role == "instructor":
            instr_exists = InstructorProfile.objects.filter(user=OuterRef("pk"))
            org_instr_exists = OrganizationMembership.objects.filter(
                user=OuterRef("pk"),
                is_active=True,
                role=OrganizationMembership.Role.INSTRUCTOR,
            )
            qs = qs.annotate(
                _has_instr=Exists(instr_exists),
                _is_org_instr=Exists(org_instr_exists),
            ).filter(Q(_has_instr=True) | Q(_is_org_instr=True))
        elif role == "learner":
            learner_exists = LearnerProfile.objects.filter(user=OuterRef("pk"))
            org_learner_exists = OrganizationMembership.objects.filter(
                user=OuterRef("pk"),
                is_active=True,
                role=OrganizationMembership.Role.LEARNER,
            )
            qs = qs.annotate(
                _has_learner=Exists(learner_exists),
                _is_org_learner=Exists(org_learner_exists),
            ).filter(Q(_has_learner=True) | Q(_is_org_learner=True))
        elif role == "org_admin":
            qs = qs.filter(
                organization_memberships__is_active=True,
                organization_memberships__role__in=[
                    OrganizationMembership.Role.OWNER,
                    OrganizationMembership.Role.ADMIN,
                    OrganizationMembership.Role.MANAGER,
                ],
            ).distinct()

        # Annotations légères pour l'affichage : nombre d'inscriptions et
        # nombre d'orgs actives.
        qs = qs.annotate(
            enrollments_count=Coalesce(
                Count("enrollments", distinct=True),
                0,
                output_field=IntegerField(),
            ),
            orgs_count=Coalesce(
                Count(
                    "organization_memberships",
                    filter=Q(organization_memberships__is_active=True),
                    distinct=True,
                ),
                0,
                output_field=IntegerField(),
            ),
        )

        paginator = Paginator(qs, 30)
        page = paginator.get_page(self.request.GET.get("page"))

        context.update({
            "page_title": "Utilisateurs — plateforme",
            "page_obj": page,
            "is_paginated": page.has_other_pages(),
            "filter_q": q,
            "filter_role": role,
            "totals": {
                "all": User.objects.count(),
                "active": User.objects.filter(is_active=True).count(),
                "platform_admin": User.objects.filter(
                    platform_role="PLATFORM_ADMIN"
                ).count(),
            },
        })
        return context


class HomeView(TemplateView):
    """Landing publique de la plateforme.

    Comportement :
    - utilisateur anonyme → rendu normal de ``home/index.html`` ;
    - utilisateur connecté → redirection vers son espace de travail le
      plus pertinent (cf. ``compte.adapters.resolve_user_dashboard_url``).

    Cela évite qu'un apprenant / formateur / admin connecté retombe sur la
    page marketing publique après une navigation arrière, un bookmark ou
    un appui sur le logo.
    """

    template_name = "home/index.html"

    def get(self, request, *args, **kwargs):
        user = request.user
        if user.is_authenticated:
            # Import local pour éviter les imports circulaires entre
            # ``formations.views`` et ``compte.adapters``.
            from compte.adapters import resolve_user_dashboard_url

            target = resolve_user_dashboard_url(user)
            # ``resolve_user_dashboard_url`` peut renvoyer "/" si aucune
            # URL n'a pu être résolue : dans ce cas on ne tente pas de
            # boucle "/" → "/" et on rend la home.
            if target and target not in ("/", request.path):
                return redirect(target)
        return super().get(request, *args, **kwargs)


class BusinessLandingView(TemplateView):
    template_name = "business/landing.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        categories = (
            Category.objects
            .annotate(
                professional_courses_count=Count(
                    "courses",
                    filter=Q(
                        courses__status=Course.Status.PUBLISHED,
                        courses__course_type=Course.CourseType.PROFESSIONNELLE,
                        courses__company_only=False,
                    )
                )
            )
            .filter(professional_courses_count__gt=0)
            .order_by("name")
        )
        professional_courses = (
            get_visible_courses_qs(
                self.request.user,
                public_only=True,
                base_qs=Course.objects.select_related("category", "instructor"),
            )
            .filter(course_type=Course.CourseType.PROFESSIONNELLE)
            .order_by("-published_at", "-created_at")[:8]
        )
        context["interest_form"] = BusinessInterestRequestForm()
        context.update({
            "hero": {
                "title": "Développez les compétences de votre organisation",
                "subtitle": "Une plateforme e-learning complète pour former, suivre et optimiser les performances de vos équipes.",
                "cta_primary": "Demander une démo",
                "cta_secondary": "Créer un compte entreprise",
            },
            "categories": categories,
            "professional_courses": professional_courses,
            "features": [
                {
                    "title": "Gestion multi-utilisateurs",
                    "desc": "Administrez vos collaborateurs, formateurs et apprenants en toute simplicité.",
                    "icon": "users",
                },
                {
                    "title": "Suivi des performances",
                    "desc": "Analysez les progrès grâce à des dashboards intelligents.",
                    "icon": "chart-line",
                },
                {
                    "title": "Bibliothèque centralisée",
                    "desc": "Accédez aux contenus de tous les membres de votre organisation.",
                    "icon": "book-open",
                },
                {
                    "title": "IA pédagogique",
                    "desc": "Générez automatiquement des parcours de formation adaptés.",
                    "icon": "robot",
                },
            ],
            "stats": [
                {"value": "500+", "label": "Formations"},
                {"value": "50K+", "label": "Utilisateurs"},
                {"value": "120+", "label": "Entreprises"},
            ],
        })
        return context


class CategoryProfessionalCourseDetailView(DetailView):
    model = Category

    template_name = "business/category_detail.html"

    context_object_name = "category"

    slug_field = "slug"

    slug_url_kwarg = "slug"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)

        courses = (
            get_visible_courses_qs(
                self.request.user,
                public_only=True,
                base_qs=Course.objects.select_related("category", "instructor"),
            )
            .filter(
                category=self.object,
                course_type=Course.CourseType.PROFESSIONNELLE,
            )
            .order_by("-published_at", "-created_at")
        )

        context["courses"] = courses

        context["courses_count"] = courses.count()

        return context


class BusinessInterestRequestCreateView(View):
    def post(self, request, *args, **kwargs):
        form = BusinessInterestRequestForm(request.POST)
        if form.is_valid():
            form.save()
            messages.success(
                request,
                "Votre manifestation d’intérêt a bien été envoyée. Un devis personnalisé vous sera transmis."
            )
        else:
            messages.error(
                request,
                "Veuillez vérifier les informations renseignées dans le formulaire."
            )
        return redirect("business_landing")


class PublicExploreCoursesView(APIView):
    """
    GET /api/public/courses/
    Filtres: q, type, pricing
    Pagination: limit, offset
    """
    permission_classes = [AllowAny]

    def get(self, request):
        q = (request.query_params.get("q") or "").strip()
        course_type = (request.query_params.get("type") or "").strip()
        pricing = (request.query_params.get("pricing") or "").strip()

        # ✅ safe parsing
        try:
            limit = int(request.query_params.get("limit") or 20)
        except ValueError:
            limit = 20
        try:
            offset = int(request.query_params.get("offset") or 0)
        except ValueError:
            offset = 0

        limit = max(1, min(limit, 50))
        offset = max(0, offset)

        qs = get_visible_courses_qs(
            request.user,
            public_only=True,
            base_qs=Course.objects.select_related("category", "instructor"),
        )

        if q:
            qs = qs.filter(
                Q(title__icontains=q) |
                Q(subtitle__icontains=q) |
                Q(description__icontains=q)
            )

        if course_type:
            qs = qs.filter(course_type=course_type)

        if pricing:
            qs = qs.filter(pricing_type=pricing)

        total = qs.count()

        # ✅ ordering
        qs = qs.order_by("-updated_at", "-id")

        items = qs[offset:offset + limit]

        serializer = PublicCourseSerializer(items, many=True, context={"request": request})

        return Response({
            "success": True,
            "count": total,  # standard
            "total": total,  # compat
            "limit": limit,
            "offset": offset,
            "results": serializer.data,  # standard
            "courses": serializer.data,  # compat front actuel
        })


def _user_can_preview_course(user, course_id: int) -> bool:
    """Renvoie True si l'utilisateur peut consulter la page détail d'un
    cours non listé publiquement (status != PUBLISHED, ou company_only).

    Cas autorisés :
      - utilisateur ayant une Enrollment non CANCELED (a déjà payé / s'est
        inscrit avant le passage en DRAFT) ;
      - instructor du cours (preview de son propre travail) ;
      - membre OWNER / ADMIN actif de l'organisation propriétaire ;
      - administrateur plateforme.
    """
    if not user or not user.is_authenticated:
        return False

    # 1. Admin plateforme.
    try:
        from core.permissions import is_platform_admin
        if is_platform_admin(user):
            return True
    except Exception:
        pass

    # 2. Charge le cours pour les checks suivants.
    try:
        from catalog.models import Course
        course = Course.objects.only(
            "id", "instructor_id", "company_id", "company_only", "status"
        ).get(pk=course_id)
    except Exception:
        return False

    # 3. Instructor du cours.
    if course.instructor_id == getattr(user, "id", None):
        return True

    # 4. Enrollment actif.
    try:
        from enrollments.models import Enrollment
        if (
            Enrollment.objects
            .filter(user=user, course_id=course.id)
            .exclude(status=Enrollment.Status.CANCELED)
            .exists()
        ):
            return True
    except Exception:
        pass

    # 5. Admin/Owner de l'organisation propriétaire.
    if course.company_id:
        try:
            from organizations.models import OrganizationMembership
            if (
                OrganizationMembership.objects.filter(
                    user=user,
                    organization_id=course.company_id,
                    is_active=True,
                    role__in=(
                        OrganizationMembership.Role.OWNER,
                        OrganizationMembership.Role.ADMIN,
                    ),
                ).exists()
            ):
                return True
        except Exception:
            pass

    return False


class CourseDetailPageView(TemplateView):
    template_name = "home/course_detail.html"

    def dispatch(self, request, *args, **kwargs):
        course_id = kwargs.get("course_id")
        slug = kwargs.get("slug")

        # 🔁 Si on arrive sur /landinghome/courses/<id>/ (sans slug),
        # on redirige vers l’URL canonique /landinghome/courses/<slug>-<id>/
        if course_id and not slug:
            course = get_object_or_404(
                get_visible_courses_qs(request.user, public_only=True),
                id=course_id,
            )
            canon_slug = course.slug or slugify(course.title)
            return HttpResponsePermanentRedirect(
                reverse("course_public_page", kwargs={"slug": canon_slug, "course_id": course.id})
            )

        # CORRECTIF : on garde la 404 SEULEMENT si le cours n'est ni
        # visible publiquement, ni accessible via un lien privilégié.
        # Cas autorisés à voir la page détail d'un cours non PUBLISHED :
        #   - utilisateur déjà inscrit (Enrollment actif) — accès continu
        #     même si l'instructor passe en DRAFT pour mise à jour ;
        #   - instructor du cours — preview de son propre travail ;
        #   - membre ADMIN/OWNER de l'organisation propriétaire ;
        #   - admin plateforme.
        # Pour ces utilisateurs, le template affichera la page (ils
        # peuvent toujours fermer en interne s'ils ne veulent pas la
        # publier — c'est leur cours).
        if course_id:
            visible_public = (
                get_visible_courses_qs(request.user, public_only=True)
                .filter(id=course_id)
                .exists()
            )
            if not visible_public:
                # Fallback : accès privilégié (inscrit / instructor / admin).
                if not _user_can_preview_course(request.user, course_id):
                    from django.http import Http404
                    raise Http404("Cours non disponible.")

        return super().dispatch(request, *args, **kwargs)

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["course_id"] = self.kwargs.get("course_id")
        ctx["slug"] = self.kwargs.get("slug")  # ✅ plus de KeyError

        # FIX HOTFIX : injecter le cours + sections + leçons côté serveur
        # pour que la zone Programme/Curriculum se remplisse sans dépendre
        # exclusivement du fetch JS côté client (qui parfois échoue ou
        # ne consomme pas `sections`).
        from django.db.models import Prefetch

        from catalog.models import Course, CourseSection, Lesson

        course_id = self.kwargs.get("course_id")

        # On essaie d'abord la query "publique stricte" pour cohérence avec
        # les filtres marketing.
        base_qs = (
            Course.objects
            .select_related("category", "instructor")
            .prefetch_related(
                Prefetch(
                    "sections",
                    queryset=CourseSection.objects.order_by("order").prefetch_related(
                        Prefetch(
                            "lessons",
                            queryset=Lesson.objects.order_by("order").only(
                                "id", "title", "order", "section_id",
                                "lesson_type", "is_preview", "duration_sec",
                            ),
                        )
                    ),
                )
            )
        )

        course = (
            get_visible_courses_qs(self.request.user, public_only=True, base_qs=base_qs)
            .filter(id=course_id)
            .first()
        )

        # Si pas visible publiquement mais accès privilégié (cf. dispatch),
        # on charge quand même le cours pour pouvoir l'afficher en mode
        # preview (sinon le user passe le dispatch mais le template est vide).
        if course is None and _user_can_preview_course(self.request.user, course_id):
            course = base_qs.filter(id=course_id).first()
            ctx["preview_mode"] = True  # le template peut afficher un badge
            ctx["preview_status"] = getattr(course, "status", None) if course else None

        if course is not None:
            sections = []
            total_lessons = 0
            total_duration_sec = 0
            for sec in course.sections.all():
                lessons = []
                for lsn in sec.lessons.all():
                    lessons.append({
                        "id": lsn.id,
                        "title": lsn.title,
                        "order": lsn.order,
                        "lesson_type": lsn.lesson_type,
                        "is_preview": lsn.is_preview,
                        "duration_sec": lsn.duration_sec or 0,
                    })
                    total_duration_sec += lsn.duration_sec or 0
                    total_lessons += 1
                sections.append({
                    "id": sec.id,
                    "title": sec.title,
                    "order": sec.order,
                    "lessons": lessons,
                    "lessons_count": len(lessons),
                })
            ctx["course_obj"] = course
            ctx["sections"] = sections
            ctx["sections_count"] = len(sections)
            ctx["total_lessons"] = total_lessons
            ctx["total_duration_sec"] = total_duration_sec

        return ctx


class PublicCourseDetailView(APIView):
    """
    GET /api/public/courses/<course_id>/
    """
    permission_classes = [AllowAny]

    def get(self, request, course_id: int):
        course = (
            get_visible_courses_qs(
                request.user,
                public_only=True,
                base_qs=Course.objects.select_related("instructor", "category"),
            )
            .filter(id=course_id)
            .first()
        )
        if not course:
            return Response({"detail": "Cours introuvable."}, status=status.HTTP_404_NOT_FOUND)

        # ✅ pas d'enrollment pour public
        return Response(
            _course_to_dict(course, request=request, is_enrolled=False, enrolled_at=None),
            status=status.HTTP_200_OK
        )


class PublicCourseRelatedView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, course_id: int):
        try:
            limit = int(request.query_params.get("limit") or 6)
        except ValueError:
            limit = 6
        limit = max(1, min(limit, 12))

        base_qs = Course.objects.select_related("category", "instructor")
        visible_qs = get_visible_courses_qs(request.user, public_only=True, base_qs=base_qs)
        course = visible_qs.filter(id=course_id).first()
        if not course:
            return Response({"detail": "Cours introuvable."}, status=status.HTTP_404_NOT_FOUND)

        qs = visible_qs.exclude(id=course.id)

        # ✅ similarité: même catégorie si possible, sinon même type
        if course.category_id:
            qs = qs.filter(category_id=course.category_id)
        else:
            qs = qs.filter(course_type=course.course_type)

        # ✅ tri Udemy-like: plus récents d'abord
        qs = qs.order_by("-updated_at", "-id")[:limit]

        data = [_course_to_dict(c, request=request) for c in qs]
        return Response({"count": len(data), "results": data})


class LearnerExploreCoursesView(APIView):
    """
    GET /api/learner/courses/
    Filtres:
    - q: recherche titre/description/sous-titre
    - type: course_type
    - pricing: pricing_type (FREE/PAID/HYBRID)
    - level: level (beginner/intermediate/advanced)
    - mine=1 -> seulement les cours où l'apprenant est inscrit
    Pagination:
    - limit (default 20)
    - offset (default 0)
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        q = (request.query_params.get("q") or "").strip()
        course_type = (request.query_params.get("type") or "").strip()
        pricing = (request.query_params.get("pricing") or "").strip()
        level = (request.query_params.get("level") or "").strip()
        mine = (request.query_params.get("mine") or "").strip() in ("1", "true", "yes")

        limit = int(request.query_params.get("limit") or 20)
        offset = int(request.query_params.get("offset") or 0)

        qs = Course.objects.all()
        try:
            qs = qs.filter(status=Course.Status.PUBLISHED)
        except Exception:
            qs = qs.filter(status="PUBLISHED")

        if q:
            qs = qs.filter(
                Q(title__icontains=q) |
                Q(description__icontains=q) |
                Q(subtitle__icontains=q)
            )

        if course_type:
            qs = qs.filter(course_type=course_type)

        if pricing:
            qs = qs.filter(pricing_type=pricing)

        if level:
            qs = qs.filter(level=level)

        # enroll map
        enroll_qs = Enrollment.objects.filter(user=request.user).select_related("course")
        enrolled_map = {e.course_id: e for e in enroll_qs}

        if mine:
            qs = qs.filter(id__in=enrolled_map.keys())

        total = qs.count()
        items = list(qs.order_by("-updated_at")[offset:offset + limit])

        results = []
        for c in items:
            e = enrolled_map.get(c.id)
            results.append(_course_to_dict(
                c,
                request=request,
                is_enrolled=bool(e),
                enrolled_at=getattr(e, "created_at", None) if e else None
            ))

        return Response({
            "count": total,
            "limit": limit,
            "offset": offset,
            "results": results,
        })


class LearnerCourseDetailView(APIView):
    """
    GET /api/learner/courses/<course_id>/
    """
    permission_classes = [AllowAny]

    @extend_schema(operation_id="landing_learner_course_detail")
    def get(self, request, course_id: int):
        course = (
            Course.objects
            .select_related("instructor", "category")
            .filter(id=course_id)
            .first()
        )
        if not course:
            return Response({"detail": "Cours introuvable."}, status=status.HTTP_404_NOT_FOUND)

        if course.status != Course.Status.PUBLISHED:
            # Cours non publié — autorisé seulement pour les users
            # privilégiés (inscrits, instructor, admin org, admin plateforme).
            # Cohérent avec ``CourseDetailPageView`` côté template.
            if not _user_can_preview_course(request.user, course.id):
                return Response(
                    {"detail": "Cours non disponible."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        e = Enrollment.objects.filter(user=request.user, course=course).first()

        return Response(
            _course_to_dict(
                course,
                request=request,
                is_enrolled=bool(e),
                enrolled_at=getattr(e, "created_at", None) if e else None
            ),
            status=status.HTTP_200_OK
        )


class LearnerCoursePlayerPage(LoginRequiredMixin, TemplateView):
    template_name = "home/course_player.html"

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        course_id = int(kwargs["course_id"])
        course = get_object_or_404(Course, id=course_id)

        enrollment = Enrollment.objects.filter(user=self.request.user, course=course).first()
        if not enrollment:
            # pas inscrit => retour détail cours (landing)
            ctx["blocked"] = True
            ctx["course_id"] = course.id
            return ctx

        ctx["blocked"] = False
        ctx["course_id"] = course.id
        return ctx
