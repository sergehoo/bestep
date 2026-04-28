from decimal import Decimal

from allauth.account.forms import LoginForm
from django.contrib.auth import login
from django.contrib.auth.mixins import LoginRequiredMixin, UserPassesTestMixin
from django.contrib.auth.views import LoginView, redirect_to_login
from django.core.exceptions import PermissionDenied
from django.core.paginator import Paginator
from django.db import models
from django.db.models import (
    Avg, Count, Sum, Q,
    IntegerField, DecimalField,
)
from django.db.models.functions import Coalesce
from django.http import Http404, HttpResponsePermanentRedirect
from django.shortcuts import render, redirect, get_object_or_404
from django.urls import reverse, reverse_lazy
from django.utils import timezone
from django.utils.text import slugify
from django.views.generic import TemplateView, DetailView
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from assessments.models import Quiz
from best_epargne.apis.serializers import PublicCourseSerializer
from best_epargne.apis.views import _course_to_dict
from catalog.models import (
    Course, CourseSection, Lesson, MediaAsset, Payment, Notification, Category, User,
)
from compte.models import InstructorProfile
from enrollments.models import Enrollment, LessonProgress
from formations.Rolemixin import RoleRequiredMixin, InstructorBaseMixin, LearnerRequiredMixin, _redirect_by_role, \
    OrganizationAdminRequiredMixin
from organizations.models import OrganizationMembership
from reviews.models import CourseReview


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
    """
    if not user or not user.is_authenticated:
        return "account_login"

    if getattr(user, "is_platform_admin", False):
        return "admin_dashboard"

    memberships = getattr(user, "organization_memberships", None)
    if memberships is not None:
        if memberships.filter(
                is_active=True,
                role__in=[
                    OrganizationMembership.Role.OWNER,
                    OrganizationMembership.Role.ADMIN,
                ],
        ).exists():
            return "business_dashboard"

    if getattr(user, "is_instructor", False):
        return "instructor:dashboard"

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
        unread_notifications = Notification.objects.filter(user=user, is_read=False).count()

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

        # Projection plate des KPIs pour les gabarits existants qui y accèdent
        # via des clés à plat (``kpis.total_courses`` …).
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
            "kpis": flat_kpis,
            "kpis_grouped": kpis_data,
            "courses": courses_list,
            "top_courses": top_courses,
            "recent_reviews": recent_reviews,
            "recent_payments": recent_payments,
            "notifications": notifications,
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

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["course_id"] = self.kwargs.get("course_id")
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

        # 2. Cas admin plateforme sans org : on n'a pas (encore) d'admin
        #    plateforme dédié → fallback home.
        if not accessible_orgs:
            if getattr(user, "is_platform_admin", False):
                # Pas de dashboard plateforme dédié pour l'instant : on
                # renvoie sur la home plutôt que sur learner.
                return redirect("home")
            # Pas d'org → l'utilisateur n'est pas admin business.
            return redirect("learner:dashboard")

        # 3. Une seule org → redirect direct.
        first = accessible_orgs[0]
        try:
            return redirect("org:dashboard", organization_id=first.organization_id)
        except Exception:
            # Fallback ultime si la route n'est pas montée
            return redirect("home")


class HomeView(TemplateView):
    template_name = "home/index.html"


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

                    )

                )

            )

            .filter(professional_courses_count__gt=0)

            .order_by("name")

        )

        professional_courses = (

            Course.objects

            .select_related("category", "instructor")

            .filter(

                status=Course.Status.PUBLISHED,

                course_type=Course.CourseType.PROFESSIONNELLE,

            )

            .order_by("-published_at", "-created_at")[:8]

        )

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

            Course.objects

            .select_related("category", "instructor")

            .filter(

                category=self.object,

                status=Course.Status.PUBLISHED,

                course_type=Course.CourseType.PROFESSIONNELLE,

            )

            .order_by("-published_at", "-created_at")

        )

        context["courses"] = courses

        context["courses_count"] = courses.count()

        return context


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

        qs = Course.objects.all().select_related('category')

        # ✅ uniquement cours publiés
        qs = qs.filter(status=Course.Status.PUBLISHED)

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


class CourseDetailPageView(TemplateView):
    template_name = "home/course_detail.html"

    def dispatch(self, request, *args, **kwargs):
        course_id = kwargs.get("course_id")
        slug = kwargs.get("slug")

        # 🔁 Si on arrive sur /landinghome/courses/<id>/ (sans slug),
        # on redirige vers l’URL canonique /landinghome/courses/<slug>-<id>/
        if course_id and not slug:
            course = get_object_or_404(Course, id=course_id)
            canon_slug = course.slug or slugify(course.title)
            return HttpResponsePermanentRedirect(
                reverse("course_public_page", kwargs={"slug": canon_slug, "course_id": course.id})
            )

        return super().dispatch(request, *args, **kwargs)

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["course_id"] = self.kwargs.get("course_id")
        ctx["slug"] = self.kwargs.get("slug")  # ✅ plus de KeyError
        return ctx


class PublicCourseDetailView(APIView):
    """
    GET /api/public/courses/<course_id>/
    """
    permission_classes = [AllowAny]

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
            return Response({"detail": "Cours non disponible."}, status=status.HTTP_403_FORBIDDEN)

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

        course = (
            Course.objects.select_related("category", "instructor")
            .filter(id=course_id, status=Course.Status.PUBLISHED)
            .first()
        )
        if not course:
            return Response({"detail": "Cours introuvable."}, status=status.HTTP_404_NOT_FOUND)

        qs = Course.objects.select_related("category", "instructor").filter(status=Course.Status.PUBLISHED).exclude(
            id=course.id)

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
            return Response({"detail": "Cours non disponible."}, status=status.HTTP_403_FORBIDDEN)

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
