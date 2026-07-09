from __future__ import annotations

import uuid
from datetime import timedelta

import boto3
from botocore.client import Config
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import Avg, Count, DecimalField, IntegerField, Max, Q, Sum
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from django.urls import reverse
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated, IsAuthenticatedOrReadOnly
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from rest_framework.views import APIView as DRFAPIView
from rest_framework.viewsets import ModelViewSet, ReadOnlyModelViewSet

from assessments.models import Attempt, AttemptAnswer, Choice, Question, Quiz
from catalog.models import (
    Category,
    Course,
    CourseSection,
    Lesson,
    MediaAsset,
    MediaUploadLog,
    Payment,
)
from catalog.services import (
    can_modify_media,
    get_instructor_courses_qs,
    get_visible_courses_qs,
    get_visible_media_qs,
    resolve_default_organization_for_user,
)
from compte.workspaces import get_active_workspace
from core import policies
from formations.tasks import process_media_asset
from organizations.models import OrganizationMembership

from .permissions import IsInstructor
from .serializers import (
    CategorySerializer,
    CourseSectionSerializer,
    CourseSerializer,
    LessonSerializer,
    MediaAssetDetailSerializer,
    MediaAssetSerializer,
    MediaAssetUpdateSerializer,
    MediaUploadFinalizeSerializer,
    MediaUploadInitSerializer,
    OpenApiObjectSerializer,
)

# from compte.api.permissions import IsInstructor


class APIView(DRFAPIView):
    """APIView documentable pour les réponses JSON construites à la main."""

    serializer_class = OpenApiObjectSerializer


class CategoryViewSet(ReadOnlyModelViewSet):
    queryset = Category.objects.all().order_by("name")
    serializer_class = CategorySerializer


class PublicCourseViewSet(ReadOnlyModelViewSet):
    """Catalogue public API.

    Read-only par construction : aucune mutation de cours ne doit passer par
    ``/api/apis/courses/``. Les contenus privés entreprise restent exclus.
    """
    serializer_class = CourseSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        qs = Course.objects.select_related("category", "instructor").prefetch_related("sections__lessons")
        qs = get_visible_courses_qs(
            self.request.user,
            public_only=True,
            base_qs=qs,
        )
        q = self.request.query_params.get("q")
        if q:
            qs = qs.filter(Q(title__icontains=q) | Q(subtitle__icontains=q) | Q(description__icontains=q))
        return qs.order_by("-published_at", "-created_at")


class InstructorCourseViewSet(ModelViewSet):
    """API privée instructor.

    Les écritures sont limitées aux cours de l'utilisateur ou aux cours d'une
    organisation où il a un rôle pédagogique/manager valide.
    """
    serializer_class = CourseSerializer
    permission_classes = [IsAuthenticated, IsInstructor]

    def get_queryset(self):
        active = get_active_workspace(self.request)
        current_org_id = active.organization_id if active and active.is_org else None
        qs = get_instructor_courses_qs(
            self.request.user,
            current_organization_id=current_org_id,
        ).prefetch_related("sections__lessons")
        q = self.request.query_params.get("q")
        if q:
            qs = qs.filter(Q(title__icontains=q) | Q(subtitle__icontains=q) | Q(description__icontains=q))
        return qs.order_by("-updated_at", "-created_at")

    def get_object(self):
        course = super().get_object()
        if not policies.can_edit_course(self.request.user, course):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Vous ne pouvez pas modifier ce cours.")
        return course

    def perform_create(self, serializer):
        active = get_active_workspace(self.request)
        save_kwargs = {"instructor": self.request.user}
        if active and active.is_org:
            from organizations.models import Organization
            organization = get_object_or_404(Organization, id=active.organization_id, is_active=True)
            if not policies.can_create_org_course(self.request.user, organization):
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied("Workspace organisation non autorisé.")
            save_kwargs.update(company=organization, company_only=True)
        serializer.save(**save_kwargs)

    @action(detail=False, methods=["get"], permission_classes=[IsAuthenticated, IsInstructor], url_path="my")
    def my_courses(self, request):
        # Portée des cours visibles : centralisée dans
        # ``catalog.services.get_instructor_courses_qs`` afin que la page
        # template (InstructorCourseView via InstructorBaseMixin) et l'API
        # renvoient le même périmètre. Si l'user est sur un espace org actif,
        # on restreint à ce scope.
        active = get_active_workspace(request)
        current_org_id = active.organization_id if active and active.is_org else None

        qs = (
            get_instructor_courses_qs(
                request.user,
                current_organization_id=current_org_id,
            )
            .prefetch_related("sections__lessons")
            .annotate(
                sections_count=Count("sections", distinct=True),
                lessons_count=Count("sections__lessons", distinct=True),
                enrolled_count=Count("enrollments", distinct=True),
            )
            .order_by("-updated_at", "-created_at")
        )

        q = request.query_params.get("q")
        if q:
            qs = qs.filter(Q(title__icontains=q) | Q(subtitle__icontains=q) | Q(description__icontains=q))

        status = request.query_params.get("status")
        if status:
            qs = qs.filter(status=status)

        pricing = request.query_params.get("pricing")
        if pricing:
            qs = qs.filter(pricing_type=pricing)

        course_type = request.query_params.get("course_type")
        if course_type:
            qs = qs.filter(course_type=course_type)

        # TODO: rating_avg, rating_count, completion_rate (si tu as des modèles review/progress)
        # Pour ne pas casser, on renvoie defaults si pas dispo:
        data = CourseSerializer(qs, many=True, context={"request": request}).data
        for c in data:
            c.setdefault("rating_avg", None)
            c.setdefault("rating_count", 0)
            c.setdefault("completion_rate", 0)
        return Response(data)


class OrganizationCourseViewSet(ModelViewSet):
    """API privée organisation, scope strictement lié au workspace actif."""
    queryset = Course.objects.none()
    serializer_class = CourseSerializer
    permission_classes = [IsAuthenticated]

    def _organization(self):
        from organizations.models import Organization
        active = get_active_workspace(self.request)
        org_id = active.organization_id if active and active.is_org else self.request.query_params.get("organization_id")
        organization = get_object_or_404(Organization, id=org_id, is_active=True)
        if not policies.can_create_org_course(self.request.user, organization):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Workspace organisation non autorisé.")
        return organization

    def get_queryset(self):
        organization = self._organization()
        return (
            Course.objects
            .filter(company=organization)
            .select_related("category", "instructor", "company")
            .prefetch_related("sections__lessons")
            .order_by("-updated_at", "-created_at")
        )

    def perform_create(self, serializer):
        organization = self._organization()
        serializer.save(
            instructor=self.request.user,
            company=organization,
            company_only=True,
        )


# Compatibilité temporaire pour les imports historiques. Les routes doivent
# utiliser PublicCourseViewSet / InstructorCourseViewSet / OrganizationCourseViewSet.
CourseViewSet = PublicCourseViewSet


def _course_owned(course_id, user):
    """
    Retourne le cours ``course_id`` si ``user`` peut écrire dessus (owner
    direct, admin plateforme, ou owner/admin/manager d'une organisation
    propriétaire). Sinon 404.

    Note : le nom historique de l'helper suggère "owner uniquement", mais
    la règle pratique est "peut écrire". La logique est déportée dans
    ``_get_writable_course`` (défini plus bas). L'ordre d'apparition de
    ces deux helpers dans le fichier importe : ``_get_writable_course``
    est déclaré après, mais son exécution ne se fait qu'au moment de
    l'appel de ``_course_owned``, donc pas de problème de forward-ref.
    """
    return _get_writable_course(course_id, user)


# ----------------------------------------------------------------------
# Helpers de scoping : qui peut écrire sur les ressources pédagogiques
# (cours, quiz, questions) ?
#
# Historiquement les vues ``Instructor*`` filtraient sur
# ``course__instructor=request.user``, ce qui empêchait :
#  - un admin plateforme d'éditer le contenu de n'importe quel cours ;
#  - un OWNER / ADMIN / MANAGER d'organisation d'éditer un quiz d'un
#    cours rattaché à son organisation mais créé par un autre formateur.
#
# Les helpers ci-dessous centralisent la règle d'accès en écriture pour
# qu'un seul endroit décide qui peut quoi.
# ----------------------------------------------------------------------

# Rôles qui donnent un droit d'édition sur les cours d'une organisation
# (alignés sur ``permissions.PermissionUtils.ORG_MANAGER_ROLES``).
_ORG_WRITE_ROLES = (
    OrganizationMembership.Role.OWNER,
    OrganizationMembership.Role.ADMIN,
    OrganizationMembership.Role.MANAGER,
)


def _user_writable_org_ids(user) -> list[int]:
    """IDs des organisations où ``user`` a un droit d'écriture pédagogique."""
    if not user or not user.is_authenticated:
        return []
    return list(
        user.organization_memberships
        .filter(
            is_active=True,
            organization__is_active=True,
            role__in=_ORG_WRITE_ROLES,
        )
        .values_list("organization_id", flat=True)
    )


def _writable_courses_qs(user):
    """QuerySet des cours sur lesquels ``user`` peut écrire (créer un quiz,
    une question, etc.).

    Règles :
    - admin plateforme : tous les cours ;
    - autres : cours dont ``instructor == user`` OU dont
      ``company`` est une organisation où l'user a un rôle OWNER /
      ADMIN / MANAGER.
    """
    if not user or not user.is_authenticated:
        return Course.objects.none()
    if getattr(user, "is_platform_admin", False):
        return Course.objects.all()
    org_ids = _user_writable_org_ids(user)
    scope = Q(instructor=user)
    if org_ids:
        scope |= Q(company_id__in=org_ids)
    return Course.objects.filter(scope).distinct()


def _get_writable_course(course_id, user):
    """Renvoie le cours ``course_id`` si ``user`` peut écrire dessus, sinon 404."""
    return get_object_or_404(_writable_courses_qs(user), id=course_id)


def _get_writable_quiz(quiz_id, user, *, select_related=None, prefetch_related=None):
    """Renvoie le quiz ``quiz_id`` si ``user`` peut écrire sur le cours
    associé, sinon 404."""
    qs = Quiz.objects.filter(course__in=_writable_courses_qs(user))
    if select_related:
        qs = qs.select_related(*select_related)
    if prefetch_related:
        qs = qs.prefetch_related(*prefetch_related)
    return get_object_or_404(qs, id=quiz_id)


def _get_writable_question(question_id, user):
    """Renvoie la question ``question_id`` si ``user`` peut écrire sur le
    cours du quiz parent, sinon 404."""
    return get_object_or_404(
        Question.objects
        .select_related("quiz", "quiz__course")
        .filter(quiz__course__in=_writable_courses_qs(user)),
        id=question_id,
    )


User = get_user_model()

# ---- OPTIONAL imports (si ces modèles n'existent pas encore, on renvoie vide)
try:
    # Exemple: enrollments/models.py
    from enrollments.models import Enrollment
except Exception:  # pragma: no cover
    Enrollment = None

try:
    # Exemple: progress/models.py
    from enrollments.models import LessonProgress
except Exception:  # pragma: no cover
    LessonProgress = None

try:
    # Exemple: payments/models.py
    from catalog.models import Payout  # adapte si tu as un app payments
except Exception:  # pragma: no cover
    Payout = None

try:
    from reviews.models import CourseReview, Review
except Exception:
    Review = None
    CourseReview = None  # 🔥 IMPORTANT

try:
    from notifications.models import Notification  # adapte si tu as un app notifications
except Exception:  # pragma: no cover
    Notification = None


def _range_to_days(r: str) -> int:
    r = (r or "30d").lower().strip()
    return {"7d": 7, "30d": 30, "90d": 90}.get(r, 30)


class InstructorBaseAPIView(APIView):
    """Base pour toutes les vues instructor (CORRECTIF API-21 : IsInstructor implique déjà IsAuthenticated)."""
    permission_classes = [IsInstructor]


class InstructorMeView(InstructorBaseAPIView):

    def get(self, request):
        u = request.user
        profile = getattr(u, "instructor_profile", None)

        return Response({
            "id": u.id,
            "email": u.email,
            "full_name": getattr(u, "full_name", "") or "",
            "phone": getattr(u, "phone", "") or "",
            "role": getattr(u, "role", None),
            "is_staff": bool(getattr(u, "is_staff", False)),
            "is_superuser": bool(getattr(u, "is_superuser", False)),
            "instructor_profile": {
                "headline": getattr(profile, "headline", "") if profile else "",
                "bio": getattr(profile, "bio", "") if profile else "",
                "is_verified": bool(getattr(profile, "is_verified", False)) if profile else False,
                "payout_percent": str(getattr(profile, "payout_percent", "70.00")) if profile else "70.00",
            }
        })


class InstructorKpisView(InstructorBaseAPIView):
    permission_classes = [IsAuthenticated, IsInstructor]

    def get(self, request):
        u = request.user
        days = _range_to_days(request.query_params.get("range", "30d"))
        since = timezone.now() - timedelta(days=days)

        # ─── COURSES — P4.2 : aggregate conditionnel → 1 seule query
        # au lieu de 5 .count() séparés sur le même queryset.
        from django.db.models import Count, Q
        courses_qs = Course.objects.filter(instructor=u)
        courses_kpi = courses_qs.aggregate(
            total=Count("id"),
            published=Count("id", filter=Q(status=Course.Status.PUBLISHED)),
            review=Count("id", filter=Q(status=Course.Status.REVIEW)),
            draft=Count("id", filter=Q(status=Course.Status.DRAFT)),
            archived=Count("id", filter=Q(status=Course.Status.ARCHIVED)),
        )
        total_courses = courses_kpi["total"]
        published_courses = courses_kpi["published"]
        review_courses = courses_kpi["review"]
        draft_courses = courses_kpi["draft"]
        archived_courses = courses_kpi["archived"]

        total_media = MediaAsset.objects.filter(owner=u).count()

        # ─── ENROLLMENTS — P4.2 : 4 .count() → 1 aggregate (4× moins de queries)
        if Enrollment:
            enrollments_qs = Enrollment.objects.filter(course__instructor=u)
            enrol_kpi = enrollments_qs.aggregate(
                total=Count("id"),
                recent=Count("id", filter=Q(enrolled_at__gte=since)),
                active=Count("id", filter=Q(status="ACTIVE")),
                completed=Count("id", filter=Q(status="COMPLETED")),
            )
            enrolled_total = enrol_kpi["total"]
            enrolled_recent = enrol_kpi["recent"]
            active_enrollments = enrol_kpi["active"]
            completed_enrollments = enrol_kpi["completed"]
        else:
            enrolled_total = 0
            enrolled_recent = 0
            active_enrollments = 0
            completed_enrollments = 0

        # ------------------ REVIEWS ------------------
        if CourseReview:
            reviews_qs = CourseReview.objects.filter(course__instructor=u, is_public=True)

            rating_avg = reviews_qs.aggregate(
                v=Coalesce(
                    Avg("rating", output_field=DecimalField(max_digits=5, decimal_places=2)),
                    0,
                    output_field=DecimalField(max_digits=5, decimal_places=2),
                )
            )["v"] or 0

            rating_count = reviews_qs.count()
        else:
            rating_avg = 0
            rating_count = 0

        # ─── REVENUE (PAYOUT) — P4.2 : 2 aggregates + 1 count → 1 aggregate
        if Payout:
            payouts_qs = Payout.objects.filter(user=u)
            _dec = DecimalField(max_digits=12, decimal_places=2)
            revenue_kpi = payouts_qs.aggregate(
                total=Coalesce(Sum("amount", output_field=_dec), 0, output_field=_dec),
                recent=Coalesce(
                    Sum("amount", filter=Q(created_at__gte=since), output_field=_dec),
                    0,
                    output_field=_dec,
                ),
                count=Count("id"),
            )
            revenue_total = revenue_kpi["total"] or 0
            revenue_recent = revenue_kpi["recent"] or 0
            payments_count = revenue_kpi["count"]
        else:
            revenue_total = 0
            revenue_recent = 0
            payments_count = 0

        # ------------------ PROGRESS ------------------
        if LessonProgress:
            completion_avg = LessonProgress.objects.filter(
                enrollment__course__instructor=u
            ).aggregate(
                v=Coalesce(
                    Avg("progress_percent", output_field=IntegerField()),
                    0,
                    output_field=IntegerField(),
                )
            )["v"] or 0
        else:
            completion_avg = 0

        # ------------------ NOTIFICATIONS ------------------
        if Notification:
            unread_notifications = Notification.objects.filter(user=u, is_read=False).count()
        else:
            unread_notifications = 0

        # ------------------ RESPONSE ------------------
        return Response({
            "courses": {
                "total": total_courses,
                "published": published_courses,
                "review": review_courses,
                "draft": draft_courses,
                "archived": archived_courses,
            },
            "media": {
                "total": total_media,
            },
            "enrollments": {
                "total": enrolled_total,
                "recent": enrolled_recent,
                "active": active_enrollments,
                "completed": completed_enrollments,
            },
            "reviews": {
                "avg": round(float(rating_avg), 1),
                "count": rating_count,
            },
            "revenue": {
                "total": float(revenue_total),
                "month": float(revenue_recent),
                "payments_count": payments_count,
            },
            "progress": {
                "avg": int(completion_avg),
            },
            "notifications": {
                "unread": unread_notifications,
            },
        })


class InstructorReviewsView(APIView):
    permission_classes = [IsAuthenticated, IsInstructor]

    def get(self, request):
        u = request.user
        q = (request.query_params.get("q") or "").strip()
        limit = int(request.query_params.get("limit") or 50)

        qs = CourseReview.objects.filter(
            course__instructor=u,
            is_public=True
        ).select_related("course", "user").order_by("-created_at")

        if q:
            qs = qs.filter(
                Q(course__title__icontains=q) |
                Q(user__full_name__icontains=q) |
                Q(comment__icontains=q)
            )

        data = []
        for r in qs[:limit]:
            data.append({
                "id": r.id,
                "course_id": r.course_id,
                "course_title": r.course.title,
                "user_name": r.user.full_name or r.user.email,
                "rating": r.rating,
                "comment": r.comment,
                "created_at": r.created_at,
                "created_at_human": r.created_at.strftime("%d/%m/%Y %H:%M"),
            })

        return Response({"count": qs.count(), "results": data})


class InstructorPayoutsView(APIView):
    """
    Renvoie l'historique de paiements formateur.
    Si pas de modèle Payout => []
    """
    permission_classes = [IsAuthenticated, IsInstructor]

    def get(self, request):
        if Payout is None:
            return Response({"count": 0, "results": []})

        u = request.user
        limit = int(request.query_params.get("limit") or 50)

        qs = Payout.objects.filter(instructor=u).order_by("-created_at")
        data = []
        for p in qs[:limit]:
            data.append({
                "id": p.id,
                "ref": getattr(p, "reference", "") or getattr(p, "ref", "") or "",
                "amount": str(getattr(p, "amount", 0) or 0),
                "currency": getattr(p, "currency", "XOF"),
                "status": getattr(p, "status", "PENDING"),
                "created_at": getattr(p, "created_at", None),
            })

        return Response({"count": qs.count(), "results": data})


class InstructorNotificationsView(APIView):
    permission_classes = [IsAuthenticated, IsInstructor]

    def get(self, request):
        u = request.user
        limit = int(request.query_params.get("limit") or 30)

        qs = Notification.objects.filter(user=u).order_by("-created_at")

        data = []
        for n in qs[:limit]:
            data.append({
                "id": n.id,
                "title": n.title,
                "body": n.body,
                "level": n.level,
                "is_read": n.is_read,
                "created_at": n.created_at,
                "time": n.created_at.strftime("%d/%m/%Y %H:%M"),
            })

        return Response({"count": qs.count(), "results": data})


class InstructorCourseDetailView(APIView):
    permission_classes = [IsAuthenticated, IsInstructor]

    @extend_schema(operation_id="instructor_course_detail", responses=CourseSerializer)
    def get(self, request, course_id):
        course = _course_owned(course_id, request.user)
        return Response(CourseSerializer(course, context={"request": request}).data)


# ── P1.2 — Transitions de cycle de vie via le service catalog.lifecycle ──
#
# Toutes les transitions PASSENT par catalog.lifecycle (source de vérité unique).
# Cela garantit : permissions, validations métier, audit log, atomicité.
# Voir catalog/lifecycle.py pour les règles précises.

def _lifecycle_response(course, action_label: str):
    """Sérialise une réponse de transition cohérente pour le front."""
    return Response({
        "status": course.status,
        "published_at": course.published_at.isoformat() if course.published_at else None,
        "archived_at": course.archived_at.isoformat() if course.archived_at else None,
        "action": action_label,
        "message": f"Cours {action_label.lower()} avec succès.",
    })


def _lifecycle_error(exc) -> Response:
    """Convertit ValidationError/PermissionDenied en réponse DRF cohérente."""
    from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
    from django.core.exceptions import ValidationError as DjangoValidationError
    if isinstance(exc, DjangoPermissionDenied):
        return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)
    if isinstance(exc, DjangoValidationError):
        msgs = exc.messages if hasattr(exc, "messages") else [str(exc)]
        return Response({"detail": msgs}, status=status.HTTP_400_BAD_REQUEST)
    return Response({"detail": "Erreur interne."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class InstructorCoursePublishView(APIView):
    """POST /api/instructor/courses/<id>/publish/ — DRAFT/REVIEW → PUBLISHED."""
    permission_classes = [IsAuthenticated, IsInstructor]

    def post(self, request, course_id):
        from catalog.lifecycle import publish_course
        course = _course_owned(course_id, request.user)
        try:
            course = publish_course(course, actor=request.user, note=request.data.get("note", ""))
        except Exception as e:
            return _lifecycle_error(e)
        return _lifecycle_response(course, "Publié")


class InstructorCourseUnpublishView(APIView):
    """POST /api/instructor/courses/<id>/unpublish/ — PUBLISHED → DRAFT."""
    permission_classes = [IsAuthenticated, IsInstructor]

    def post(self, request, course_id):
        from catalog.lifecycle import unpublish_course
        course = _course_owned(course_id, request.user)
        try:
            course = unpublish_course(course, actor=request.user, note=request.data.get("note", ""))
        except Exception as e:
            return _lifecycle_error(e)
        return _lifecycle_response(course, "Dépublié")


class InstructorCourseArchiveView(APIView):
    """POST /api/instructor/courses/<id>/archive/ — any → ARCHIVED."""
    permission_classes = [IsAuthenticated, IsInstructor]

    def post(self, request, course_id):
        from catalog.lifecycle import archive_course
        course = _course_owned(course_id, request.user)
        try:
            course = archive_course(course, actor=request.user, note=request.data.get("note", ""))
        except Exception as e:
            return _lifecycle_error(e)
        return _lifecycle_response(course, "Archivé")


class InstructorCourseRestoreView(APIView):
    """POST /api/instructor/courses/<id>/restore/ — ARCHIVED → DRAFT (désarchiver)."""
    permission_classes = [IsAuthenticated, IsInstructor]

    def post(self, request, course_id):
        from catalog.lifecycle import restore_course
        course = _course_owned(course_id, request.user)
        try:
            course = restore_course(course, actor=request.user, note=request.data.get("note", ""))
        except Exception as e:
            return _lifecycle_error(e)
        return _lifecycle_response(course, "Restauré")


class InstructorSectionListView(APIView):
    permission_classes = [IsAuthenticated, IsInstructor]

    def get(self, request, course_id):
        course = _course_owned(course_id, request.user)
        qs = CourseSection.objects.filter(course=course).order_by("order")
        data = CourseSectionSerializer(qs, many=True, context={"request": request}).data
        # include lessons_count
        # Note : ne pas utiliser strict=False (Python 3.10+). data et qs
        # ont toujours la même longueur ici (issue du même queryset).
        for item, obj in zip(data, qs):
            item["lessons_count"] = obj.lessons.count()
        return Response(data)


class InstructorSectionCreateView(APIView):
    permission_classes = [IsAuthenticated, IsInstructor]

    def post(self, request, course_id):
        course = _course_owned(course_id, request.user)
        title = request.data.get("title", "").strip()
        if not title:
            return Response({"detail": "title is required"}, status=400)
        max_order = CourseSection.objects.filter(course=course).aggregate(m=Max("order"))["m"] or 0
        section = CourseSection.objects.create(course=course, title=title, order=max_order + 1)
        return Response(CourseSectionSerializer(section).data, status=status.HTTP_201_CREATED)


class InstructorSectionUpdateView(APIView):
    permission_classes = [IsAuthenticated, IsInstructor]

    def post(self, request, course_id, section_id):
        course = _course_owned(course_id, request.user)
        section = get_object_or_404(CourseSection, id=section_id, course=course)
        updates: list[str] = []
        title = (request.data.get("title") or "").strip()
        if title:
            section.title = title
            updates.append("title")
        # R6 : réordonnancement — on swap avec la section qui a l'ordre demandé
        if "order" in request.data:
            try:
                new_order = int(request.data["order"])
            except (TypeError, ValueError):
                return Response({"detail": "order must be int"}, status=400)
            neighbor = (
                CourseSection.objects.filter(course=course, order=new_order)
                .exclude(id=section.id)
                .first()
            )
            if neighbor:
                neighbor.order, section.order = section.order, new_order
                neighbor.save(update_fields=["order"])
            else:
                section.order = new_order
            updates.append("order")
        if updates:
            section.save(update_fields=updates)
        return Response(CourseSectionSerializer(section).data)


class InstructorSectionDeleteView(APIView):
    permission_classes = [IsAuthenticated, IsInstructor]

    def post(self, request, course_id, section_id):
        course = _course_owned(course_id, request.user)
        section = get_object_or_404(CourseSection, id=section_id, course=course)
        section.delete()
        return Response({"ok": True})


class InstructorLessonListView(APIView):
    permission_classes = [IsAuthenticated, IsInstructor]

    def get(self, request, course_id, section_id):
        course = _course_owned(course_id, request.user)
        section = get_object_or_404(CourseSection, id=section_id, course=course)
        qs = Lesson.objects.filter(section=section).order_by("order")
        return Response(LessonSerializer(qs, many=True, context={"request": request}).data)


class InstructorLessonCreateView(APIView):
    permission_classes = [IsAuthenticated, IsInstructor]

    def post(self, request, course_id, section_id):
        course = _course_owned(course_id, request.user)
        section = get_object_or_404(CourseSection, id=section_id, course=course)

        title = (request.data.get("title") or "").strip()
        lesson_type = (request.data.get("lesson_type") or Lesson.LessonType.VIDEO).strip()

        if not title:
            return Response({"detail": "title is required"}, status=400)

        max_order = Lesson.objects.filter(section=section).aggregate(m=Max("order"))["m"] or 0

        media_asset = None
        media_asset_id = request.data.get("media_asset_id")
        if media_asset_id:
            media_asset = get_object_or_404(MediaAsset, id=media_asset_id, owner=request.user)

        lesson = Lesson.objects.create(
            section=section,
            title=title,
            lesson_type=lesson_type,
            order=max_order + 1,
            is_preview=bool(request.data.get("is_preview", False)),
            duration_sec=int(request.data.get("duration_sec") or 0),
            video_url=request.data.get("video_url") or "",
            content=request.data.get("content") or "",
            media_asset=media_asset,
        )

        return Response(LessonSerializer(lesson, context={"request": request}).data, status=201)


class InstructorLessonUpdateView(APIView):
    permission_classes = [IsAuthenticated, IsInstructor]

    def post(self, request, course_id, section_id, lesson_id):
        course = _course_owned(course_id, request.user)
        section = get_object_or_404(CourseSection, id=section_id, course=course)
        lesson = get_object_or_404(Lesson, id=lesson_id, section=section)

        for f in ["title", "lesson_type", "is_preview", "duration_sec", "video_url", "content"]:
            if f in request.data:
                setattr(lesson, f, request.data.get(f))

        # R6 : réordonnancement lesson dans sa section (swap avec voisin)
        if "order" in request.data:
            try:
                new_order = int(request.data["order"])
            except (TypeError, ValueError):
                return Response({"detail": "order must be int"}, status=400)
            neighbor = (
                Lesson.objects.filter(section=section, order=new_order)
                .exclude(id=lesson.id)
                .first()
            )
            if neighbor:
                neighbor.order, lesson.order = lesson.order, new_order
                neighbor.save(update_fields=["order"])
            else:
                lesson.order = new_order

        if "media_asset_id" in request.data:
            media_asset_id = request.data.get("media_asset_id")
            if media_asset_id:
                lesson.media_asset = get_object_or_404(MediaAsset, id=media_asset_id, owner=request.user)
            else:
                lesson.media_asset = None

        lesson.save()
        return Response(LessonSerializer(lesson, context={"request": request}).data)


class InstructorLessonDeleteView(APIView):
    permission_classes = [IsAuthenticated, IsInstructor]

    def post(self, request, course_id, section_id, lesson_id):
        course = _course_owned(course_id, request.user)
        section = get_object_or_404(CourseSection, id=section_id, course=course)
        lesson = get_object_or_404(Lesson, id=lesson_id, section=section)
        lesson.delete()
        return Response({"ok": True})


# def s3_client():
#     return boto3.client(
#         "s3",
#         endpoint_url=getattr(settings, "MINIO_ENDPOINT_URL", None),
#         aws_access_key_id=getattr(settings, "MINIO_ACCESS_KEY", None),
#         aws_secret_access_key=getattr(settings, "MINIO_SECRET_KEY", None),
#         region_name=getattr(settings, "MINIO_REGION", "us-east-1"),
#         config=Config(signature_version="s3v4"),
#         verify=getattr(settings, "MINIO_SECURE", False),
#     )

def s3_internal_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.MINIO_INTERNAL_ENDPOINT,
        aws_access_key_id=settings.MINIO_ROOT_USER,
        aws_secret_access_key=settings.MINIO_ROOT_PASSWORD,
        region_name=settings.MINIO_REGION,
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "path"},
        ),
        verify=False,
    )


def s3_public_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.MINIO_PUBLIC_ENDPOINT,
        aws_access_key_id=settings.MINIO_ROOT_USER,
        aws_secret_access_key=settings.MINIO_ROOT_PASSWORD,
        region_name=settings.MINIO_REGION,
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "path"},
        ),
        verify=True,
    )


def build_object_key(user_id: int, kind: str, filename: str) -> str:
    prefix = getattr(settings, "MINIO_UPLOAD_PREFIX", "instructors")
    ext = ""
    if "." in filename:
        ext = "." + filename.split(".")[-1].lower()[:10]
    return f"{prefix}/{user_id}/{kind}/{uuid.uuid4().hex}{ext}"


UPLOAD_LOG_TTL = timedelta(hours=6)
SIGNED_UPLOAD_PART_TTL_SECONDS = 30 * 60
SIGNED_READ_TTL_SECONDS = 60
MAX_MULTIPART_PARTS = 10_000


def _get_started_upload_log(user, upload_id: str, object_key: str | None = None, *, lock: bool = False):
    qs = MediaUploadLog.objects.filter(
        user=user,
        upload_id=upload_id,
        status="started",
    )
    if object_key:
        qs = qs.filter(object_key=object_key)
    if lock:
        qs = qs.select_for_update()
    log = qs.first()
    if not log:
        return None
    if timezone.now() - log.started_at > UPLOAD_LOG_TTL:
        log.status = "failed"
        log.error_message = "Upload expiré."
        log.save(update_fields=["status", "error_message"])
        return None
    expected_prefix = f"{getattr(settings, 'MINIO_UPLOAD_PREFIX', 'instructors')}/{user.id}/"
    if not log.object_key.startswith(expected_prefix):
        return None
    return log


class MediaUploadInitView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ser = MediaUploadInitSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data

        bucket = getattr(settings, "MINIO_BUCKET", None)
        if not bucket:
            return Response({"detail": "MINIO_BUCKET is not configured"}, status=500)

        object_key = build_object_key(request.user.id, data["kind"], data["filename"])
        client = s3_public_client()

        upload_id = uuid.uuid4().hex
        MediaUploadLog.objects.create(
            user=request.user,
            object_key=object_key,
            upload_id=upload_id,
            filename=data["filename"],
            size=int(data["size"]),
            content_type=data["content_type"],
            status="started",
        )

        upload_url = client.generate_presigned_url(
            ClientMethod="put_object",
            Params={
                "Bucket": bucket,
                "Key": object_key,
                "ContentType": data["content_type"],
            },
            ExpiresIn=SIGNED_UPLOAD_PART_TTL_SECONDS,
        )

        return Response({
            "upload_id": upload_id,
            "bucket": bucket,
            "object_key": object_key,
            "upload_url": upload_url,
            "method": "PUT",
            "headers": {
                "Content-Type": data["content_type"],
            },
        })


class MediaUploadFinalizeView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        ser = MediaUploadFinalizeSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        log = _get_started_upload_log(
            request.user,
            data["upload_id"],
            data.get("object_key"),
            lock=True,
        )
        if not log:
            return Response({"detail": "Upload introuvable, expiré ou non autorisé."}, status=404)
        data["object_key"] = log.object_key

        bucket = getattr(settings, "MINIO_BUCKET", None)
        if not bucket:
            return Response({"detail": "MINIO_BUCKET is not configured"}, status=500)

        client = s3_internal_client()

        try:
            head = client.head_object(Bucket=bucket, Key=data["object_key"])
        except Exception as exc:
            raise ValidationError({
                "object_key": "Object not found in MinIO (head_object failed). Upload may have failed."
            }) from exc

        remote_size = int(head.get("ContentLength") or 0)
        remote_type = head.get("ContentType") or data["content_type"]

        if remote_size <= 0:
            raise ValidationError({"size": "Remote size invalid (0)."})

        _SIZE_TOLERANCE = 64 * 1024  # CORRECTIF API-11 : 64 KiB max
        if abs(remote_size - int(data["size"])) > _SIZE_TOLERANCE:
            raise ValidationError({
                "size": f"Size mismatch. local={data['size']} remote={remote_size}"
            })

        # Rattachement org automatique : si l'utilisateur n'a qu'une seule
        # org "active" en tant qu'instructeur/manager/admin/owner, on
        # rattache le média à cette org pour qu'il soit partagé en lecture
        # avec les autres membres. Sinon on laisse NULL (média personnel).
        default_org = resolve_default_organization_for_user(request.user)

        asset, created = MediaAsset.objects.get_or_create(
            object_key=data["object_key"],
            defaults=dict(
                owner=request.user,
                organization=default_org,
                kind=data["kind"],
                title=(data.get("title") or ""),
                content_type=remote_type,
                size=remote_size,
                duration_seconds=data.get("duration_seconds"),
                processing_status=(
                    MediaAsset.ProcessingStatus.PENDING
                    if data["kind"] == MediaAsset.Kind.VIDEO
                    else MediaAsset.ProcessingStatus.READY
                ),
            )
        )

        if not created and asset.owner_id != request.user.id:
            return Response({"detail": "Forbidden: object_key already owned by another user."}, status=403)

        bind = data.get("bind")
        if bind:
            course = get_object_or_404(Course, id=bind["course_id"])
            if not policies.can_edit_course(request.user, course):
                return Response({"detail": "Forbidden: course not owned"}, status=403)

            section = get_object_or_404(CourseSection, id=bind["section_id"], course=course)
            lesson = get_object_or_404(Lesson, id=bind["lesson_id"], section=section)

            lesson.media_asset = asset
            if asset.kind == MediaAsset.Kind.VIDEO:
                lesson.lesson_type = Lesson.LessonType.VIDEO
            else:
                lesson.lesson_type = Lesson.LessonType.FILE

            lesson.save(update_fields=["media_asset", "lesson_type"])

        if asset.kind == MediaAsset.Kind.VIDEO:
            process_media_asset.delay(str(asset.id))

        log.status = "completed"
        log.completed_at = timezone.now()
        log.duration_seconds = int((log.completed_at - log.started_at).total_seconds())
        log.save(update_fields=["status", "completed_at", "duration_seconds"])

        return Response(MediaAssetDetailSerializer(asset).data, status=201)


class MediaMultipartInitView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ser = MediaUploadInitSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data

        bucket = settings.MINIO_BUCKET

        filename = data["filename"]
        content_type = data["content_type"]
        size = int(data.get("size") or 0)
        kind = data["kind"]

        object_key = build_object_key(request.user.id, kind, filename)

        client = s3_internal_client()

        resp = client.create_multipart_upload(
            Bucket=bucket,
            Key=object_key,
            ContentType=content_type,
            Metadata={
                "owner_id": str(request.user.id),
                "kind": kind,
                "filename": filename[:180],
            },
        )

        upload_id = resp["UploadId"]

        MediaUploadLog.objects.create(
            user=request.user,
            object_key=object_key,
            upload_id=upload_id,
            filename=filename,
            size=size,
            content_type=content_type,
            status="started",
        )

        return Response({
            "upload_id": upload_id,
            "bucket": bucket,
            "object_key": object_key,
            "part_size": 25 * 1024 * 1024,
            "expires_in": SIGNED_UPLOAD_PART_TTL_SECONDS,
        })


class MediaMultipartPartUrlView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        bucket = settings.MINIO_BUCKET
        object_key = request.data.get("object_key")
        upload_id = request.data.get("upload_id")
        part_number = int(request.data.get("part_number") or 0)

        if not upload_id or part_number < 1 or part_number > MAX_MULTIPART_PARTS:
            return Response({"detail": "object_key, upload_id et part_number sont requis."}, status=400)

        log = _get_started_upload_log(request.user, upload_id, object_key)
        if not log:
            return Response({"detail": "Upload introuvable, expiré ou non autorisé."}, status=404)

        client = s3_public_client()

        url = client.generate_presigned_url(
            ClientMethod="upload_part",
            Params={
                "Bucket": bucket,
                "Key": log.object_key,
                "UploadId": upload_id,
                "PartNumber": part_number,
            },
            ExpiresIn=SIGNED_UPLOAD_PART_TTL_SECONDS,
        )

        return Response({
            "url": url,
            "part_number": part_number,
        })


class MediaMultipartCompleteView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        bucket = settings.MINIO_BUCKET

        object_key = request.data.get("object_key")
        upload_id = request.data.get("upload_id")
        parts = request.data.get("parts") or []

        kind = request.data.get("kind")
        title = request.data.get("title") or ""
        content_type = request.data.get("content_type") or "application/octet-stream"
        size = int(request.data.get("size") or 0)
        duration_seconds = request.data.get("duration_seconds")
        bind = request.data.get("bind")

        if not upload_id or not parts:
            return Response({"detail": "object_key, upload_id et parts sont requis."}, status=400)
        if len(parts) > MAX_MULTIPART_PARTS:
            return Response({"detail": "Trop de parts multipart."}, status=400)

        log = _get_started_upload_log(request.user, upload_id, object_key, lock=True)
        if not log:
            return Response({"detail": "Upload introuvable, expiré ou non autorisé."}, status=404)
        object_key = log.object_key

        normalized_parts = []
        seen_parts = set()
        for p in parts:
            try:
                part_number = int(p["PartNumber"])
            except Exception:
                return Response({"detail": "PartNumber invalide."}, status=400)
            if part_number < 1 or part_number > MAX_MULTIPART_PARTS or part_number in seen_parts:
                return Response({"detail": "Parts multipart invalides."}, status=400)
            etag = str(p.get("ETag") or "").strip()
            if not etag:
                return Response({"detail": "ETag manquant."}, status=400)
            seen_parts.add(part_number)
            normalized_parts.append({"PartNumber": part_number, "ETag": etag})

        normalized_parts.sort(key=lambda x: x["PartNumber"])

        client = s3_internal_client()

        client.complete_multipart_upload(
            Bucket=bucket,
            Key=object_key,
            UploadId=upload_id,
            MultipartUpload={
                "Parts": normalized_parts
            },
        )
        head = client.head_object(Bucket=bucket, Key=object_key)
        remote_size = int(head.get("ContentLength") or 0)
        remote_type = head.get("ContentType") or content_type

        if remote_size <= 0:
            raise ValidationError({"size": "Remote size invalid."})

        _SIZE_TOLERANCE = 64 * 1024  # CORRECTIF API-11
        if size and abs(remote_size - size) > _SIZE_TOLERANCE:
            raise ValidationError({
                "size": f"Size mismatch. local={size} remote={remote_size}"
            })

        # Rattachement org automatique (cf. MediaUploadFinalizeView pour la
        # règle complète).
        default_org = resolve_default_organization_for_user(request.user)

        asset, created = MediaAsset.objects.get_or_create(
            object_key=object_key,
            defaults=dict(
                owner=request.user,
                organization=default_org,
                kind=kind,
                title=title,
                content_type=remote_type,
                size=remote_size,
                duration_seconds=duration_seconds,
                processing_status=(
                    MediaAsset.ProcessingStatus.PENDING
                    if kind == MediaAsset.Kind.VIDEO
                    else MediaAsset.ProcessingStatus.READY
                ),
            )
        )

        if not created and asset.owner_id != request.user.id:
            return Response({"detail": "Forbidden"}, status=403)

        if bind:
            course = get_object_or_404(Course, id=bind["course_id"])
            if not policies.can_edit_course(request.user, course):
                return Response({"detail": "Forbidden: course not owned"}, status=403)

            section = get_object_or_404(CourseSection, id=bind["section_id"], course=course)
            lesson = get_object_or_404(Lesson, id=bind["lesson_id"], section=section)

            lesson.media_asset = asset
            if asset.kind == MediaAsset.Kind.VIDEO:
                lesson.lesson_type = Lesson.LessonType.VIDEO
            else:
                lesson.lesson_type = Lesson.LessonType.FILE

            lesson.save(update_fields=["media_asset", "lesson_type"])

        if asset.kind == MediaAsset.Kind.VIDEO:
            process_media_asset.delay(str(asset.id))

        log.status = "completed"
        log.completed_at = timezone.now()
        log.duration_seconds = int((log.completed_at - log.started_at).total_seconds())
        log.save(update_fields=["status", "completed_at", "duration_seconds"])

        return Response(MediaAssetDetailSerializer(asset).data, status=201)


class MediaMultipartAbortView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        bucket = settings.MINIO_BUCKET
        object_key = request.data.get("object_key")
        upload_id = request.data.get("upload_id")

        if not upload_id:
            return Response({"detail": "object_key et upload_id requis."}, status=400)

        log = _get_started_upload_log(request.user, upload_id, object_key, lock=True)
        if not log:
            return Response({"detail": "Upload introuvable, expiré ou non autorisé."}, status=404)
        object_key = log.object_key

        client = s3_internal_client()

        try:
            client.abort_multipart_upload(
                Bucket=bucket,
                Key=object_key,
                UploadId=upload_id,
            )
        except Exception:
            pass
        log.status = "failed"
        log.error_message = "Upload annulé par l'utilisateur."
        log.save(update_fields=["status", "error_message"])

        return Response({"ok": True})


class MediaMultipartListPartsView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        bucket = settings.MINIO_BUCKET
        object_key = request.data.get("object_key")
        upload_id = request.data.get("upload_id")

        if not upload_id:
            return Response({
                "detail": "object_key et upload_id sont requis."
            }, status=400)

        log = _get_started_upload_log(request.user, upload_id, object_key)
        if not log:
            return Response({
                "detail": "Upload introuvable ou non autorisé."
            }, status=404)
        object_key = log.object_key

        client = s3_internal_client()

        parts = []
        part_number_marker = 0

        while True:
            resp = client.list_parts(
                Bucket=bucket,
                Key=object_key,
                UploadId=upload_id,
                PartNumberMarker=part_number_marker,
            )

            for p in resp.get("Parts", []):
                if len(parts) >= MAX_MULTIPART_PARTS:
                    break
                parts.append({
                    "PartNumber": int(p["PartNumber"]),
                    "ETag": p["ETag"].replace('"', ""),
                    "Size": int(p.get("Size") or 0),
                })

            if not resp.get("IsTruncated") or len(parts) >= MAX_MULTIPART_PARTS:
                break

            part_number_marker = int(resp.get("NextPartNumberMarker") or 0)

        return Response({
            "upload_id": upload_id,
            "parts": parts,
        })


def _get_visible_media_or_404(request, asset_id):
    """Récupère un MediaAsset si visible par ``request.user``.

    Visibilité = ``catalog.services.get_visible_media_qs`` :
    - admin plateforme : tout ;
    - sinon : owner OU membre actif de l'org du média.

    Si l'asset n'est pas visible : 404 (on ne leak pas son existence
    en renvoyant 403, qui révélerait que l'objet existe).
    """
    active = get_active_workspace(request)
    current_org_id = active.organization_id if active and active.is_org else None
    qs = get_visible_media_qs(request.user, current_organization_id=current_org_id)
    return get_object_or_404(qs, id=asset_id)


def _get_modifiable_media_or_403(request, asset_id):
    """Comme ``_get_visible_media_or_404`` mais exige aussi que l'user
    puisse modifier l'asset (auteur OU admin/owner de l'org de l'asset).

    Lève DRF ``PermissionDenied`` (403) si visible mais non modifiable.
    """
    from rest_framework.exceptions import PermissionDenied
    asset = _get_visible_media_or_404(request, asset_id)
    if not can_modify_media(request.user, asset):
        raise PermissionDenied("Vous ne pouvez pas modifier ce média.")
    return asset


class InstructorMediaDetailView(APIView):
    """Détail d'un média.

    Lecture autorisée pour : owner, membres actifs de l'org du média,
    admin plateforme. Voir ``catalog.services.get_visible_media_qs``.
    """
    permission_classes = [IsAuthenticated, IsInstructor]

    @extend_schema(
        operation_id="instructor_media_detail",
        responses=MediaAssetDetailSerializer,
    )
    def get(self, request, asset_id):
        asset = _get_visible_media_or_404(request, asset_id)
        serializer = MediaAssetDetailSerializer(asset)
        return Response(serializer.data)


class InstructorMediaUpdateView(APIView):
    """Modification d'un média.

    Réservée à : owner OU admin/owner de l'org du média OU admin plateforme.
    Voir ``catalog.services.can_modify_media``.
    """
    permission_classes = [IsAuthenticated, IsInstructor]

    @transaction.atomic
    def post(self, request, asset_id):
        asset = _get_modifiable_media_or_403(request, asset_id)
        serializer = MediaAssetUpdateSerializer(instance=asset, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(MediaAssetDetailSerializer(asset).data, status=status.HTTP_200_OK)

    @transaction.atomic
    def patch(self, request, asset_id):
        asset = _get_modifiable_media_or_403(request, asset_id)
        serializer = MediaAssetUpdateSerializer(instance=asset, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(MediaAssetDetailSerializer(asset).data, status=status.HTTP_200_OK)


class InstructorMediaDeleteView(APIView):
    """Suppression d'un média (S3 + DB).

    Mêmes règles que la modification (owner / admin org / admin plateforme).
    """
    permission_classes = [IsAuthenticated, IsInstructor]

    def get_object(self, request, asset_id):
        return _get_modifiable_media_or_403(request, asset_id)

    @transaction.atomic
    def delete(self, request, asset_id):
        asset = self.get_object(request, asset_id)

        bucket = getattr(settings, "MINIO_BUCKET", None)
        if not bucket:
            return Response({"detail": "MINIO_BUCKET is not configured"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        client = s3_internal_client()

        keys_to_delete = [asset.object_key]
        if asset.optimized_object_key:
            keys_to_delete.append(asset.optimized_object_key)
        if asset.thumbnail_object_key:
            keys_to_delete.append(asset.thumbnail_object_key)

        for key in keys_to_delete:
            try:
                client.delete_object(Bucket=bucket, Key=key)
            except Exception:
                pass

        asset.delete()
        return Response({"status": "ok"}, status=status.HTTP_200_OK)

    @transaction.atomic
    def post(self, request, asset_id):
        return self.delete(request, asset_id)


class MediaSignedGetView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, asset_id):
        asset = _get_visible_media_or_404(request, asset_id)

        bucket = getattr(settings, "MINIO_BUCKET", None)
        if not bucket:
            return Response({"detail": "MINIO_BUCKET is not configured"}, status=500)

        client = s3_public_client()
        target_key = asset.effective_object_key

        url = client.generate_presigned_url(
            ClientMethod="get_object",
            Params={"Bucket": bucket, "Key": target_key},
            ExpiresIn=SIGNED_READ_TTL_SECONDS,
        )

        thumbnail_url = ""
        if asset.thumbnail_object_key:
            thumbnail_url = client.generate_presigned_url(
                ClientMethod="get_object",
                Params={"Bucket": bucket, "Key": asset.thumbnail_object_key},
                ExpiresIn=SIGNED_READ_TTL_SECONDS,
            )

        return Response({
            "url": url,
            "thumbnail_url": thumbnail_url,
            "processing_status": asset.processing_status,
            "optimized": bool(asset.optimized_object_key),
            "kind": asset.kind,
        })


class MediaThumbnailSignedGetView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, asset_id):
        asset = _get_visible_media_or_404(request, asset_id)

        if not asset.thumbnail_object_key:
            return Response({"detail": "Thumbnail not available"}, status=404)

        bucket = getattr(settings, "MINIO_BUCKET", None)
        client = s3_public_client()

        url = client.generate_presigned_url(
            ClientMethod="get_object",
            Params={"Bucket": bucket, "Key": asset.thumbnail_object_key},
            ExpiresIn=SIGNED_READ_TTL_SECONDS,
        )
        return Response({"url": url})


class InstructorMediaListView(APIView):
    """Bibliothèque média de l'espace instructeur.

    Délègue la logique de scope à ``catalog.services.get_visible_media_qs``
    pour rester cohérent avec les vues template et les futures interfaces
    (org dashboard).

    Portée :
    - espace ``instructor`` : médias persos + médias de toutes ses orgs ;
    - espace ``org`` : médias persos + médias de l'org courante uniquement
      (permet à un user qui pivote dans l'espace d'une de ses orgs de ne
      pas voir le bruit des autres).
    """

    permission_classes = [IsAuthenticated, IsInstructor]

    def get_queryset(self):
        active = get_active_workspace(self.request)
        current_org_id = active.organization_id if active and active.is_org else None
        return get_visible_media_qs(
            self.request.user,
            current_organization_id=current_org_id,
        )

    def get(self, request):
        page = max(int(request.query_params.get("page", 1) or 1), 1)
        page_size = int(request.query_params.get("page_size", 10) or 10)
        page_size = min(max(page_size, 8), 100)

        qs = self.get_queryset()

        kind = request.query_params.get("kind")
        if kind in ("video", "audio", "doc"):
            qs = qs.filter(kind=kind)

        q = (request.query_params.get("q") or "").strip()
        if q:
            filters = (
                    Q(title__icontains=q) |
                    Q(object_key__icontains=q) |
                    Q(content_type__icontains=q)
            )

            if hasattr(MediaAsset, "processing_status"):
                filters |= Q(processing_status__icontains=q)

            if hasattr(MediaAsset, "organization"):
                filters |= Q(organization__name__icontains=q)

            qs = qs.filter(filters)

        sort = request.query_params.get("sort") or "recent"

        if sort == "oldest":
            qs = qs.order_by("created_at")
        elif sort == "title":
            qs = qs.order_by("title", "-created_at")
        elif sort == "size_desc":
            qs = qs.order_by("-size", "-created_at")
        elif sort == "size_asc":
            qs = qs.order_by("size", "-created_at")
        else:
            qs = qs.order_by("-created_at")

        total = qs.count()
        total_pages = max(1, (total + page_size - 1) // page_size)
        page = min(page, total_pages)

        start = (page - 1) * page_size
        end = start + page_size

        ser = MediaAssetSerializer(
            qs[start:end],
            many=True,
            context={"request": request},
        )

        return Response({
            "count": total,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
            "results": ser.data,
        })


class InstructorQuizListApiView(APIView):
    permission_classes = [IsAuthenticated, IsInstructor]

    def get(self, request):
        quizzes = (
            Quiz.objects
            .filter(course__in=_writable_courses_qs(request.user))
            .select_related("course", "section", "lesson")
            .prefetch_related("questions")
            .order_by("-id")
        )

        results = []
        for q in quizzes:
            results.append({
                "id": q.id,
                "title": q.title,
                "slug": q.slug,
                "course_id": q.course_id,
                "course_title": q.course.title if q.course else "",
                "section_id": q.section_id,
                "section_title": q.section.title if q.section else "",
                "lesson_id": q.lesson_id,
                "is_active": q.is_active,
                "passing_score": q.passing_score,
                "max_attempts": q.max_attempts,
                "questions_count": q.questions.count(),
            })

        return Response({
            "count": len(results),
            "results": results,
        })


class InstructorQuizUpdateView(APIView):
    permission_classes = [IsAuthenticated, IsInstructor]

    def get(self, request, quiz_id: int):
        quiz = _get_writable_quiz(
            quiz_id,
            request.user,
            select_related=("course", "section"),
            prefetch_related=("questions__choices",),
        )

        return Response({
            "id": quiz.id,
            "title": quiz.title,
            "slug": quiz.slug,
            "course_id": quiz.course_id,
            "course_title": quiz.course.title if quiz.course else "",
            "section_id": quiz.section_id,
            "section_title": quiz.section.title if quiz.section else "",
            "lesson_id": quiz.lesson_id,
            "passing_score": quiz.passing_score,
            "max_attempts": quiz.max_attempts,
            "is_active": quiz.is_active,
            "questions": [
                {
                    "id": q.id,
                    "prompt": q.prompt,
                    "topic": q.topic,
                    "order": q.order,
                    "choices": [
                        {
                            "id": c.id,
                            "text": c.text,
                            "is_correct": c.is_correct,
                        }
                        for c in q.choices.all()
                    ]
                }
                for q in quiz.questions.all().order_by("order")
            ]
        })

    def post(self, request, quiz_id: int):
        quiz = _get_writable_quiz(quiz_id, request.user)

        title = (request.data.get("title") or quiz.title).strip()
        if not title:
            return Response({"detail": "Le titre est requis."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            passing_score = int(request.data.get("passing_score", quiz.passing_score or 70))
            max_attempts = int(request.data.get("max_attempts", quiz.max_attempts or 3))
        except (TypeError, ValueError):
            return Response({"detail": "Paramètres invalides."}, status=status.HTTP_400_BAD_REQUEST)

        quiz.title = title
        quiz.passing_score = passing_score
        quiz.max_attempts = max_attempts

        if "is_active" in request.data:
            raw_is_active = request.data.get("is_active")
            quiz.is_active = raw_is_active in (True, "true", "True", 1, "1", "on")

        quiz.save()

        return Response({
            "id": quiz.id,
            "title": quiz.title,
            "passing_score": quiz.passing_score,
            "max_attempts": quiz.max_attempts,
            "is_active": quiz.is_active,
        })


class InstructorCourseQuizListView(APIView):
    permission_classes = [IsAuthenticated, IsInstructor]

    def get(self, request, course_id: int):
        course = _get_writable_course(course_id, request.user)

        quizzes = (
            Quiz.objects
            .filter(course=course, is_onboarding=False)
            .select_related("section", "lesson")
            .order_by("title")
        )

        results = []
        for q in quizzes:
            results.append({
                "id": q.id,
                "title": q.title,
                "slug": q.slug,
                "section_id": q.section_id,
                "section_title": q.section.title if q.section else "",
                "lesson_id": q.lesson_id,
                "is_active": q.is_active,
                "passing_score": q.passing_score,
                "max_attempts": q.max_attempts,
                "questions_count": q.questions.count(),
            })

        return Response(results)


class InstructorQuizCreateView(APIView):
    """
    POST /api/instructor/quizzes/create/
    Crée un quiz au niveau cours, avec section optionnelle.
    Payload : { title, course_id, section_id (opt), passing_score, max_attempts }
    """
    permission_classes = [IsAuthenticated, IsInstructor]

    def post(self, request):
        course_id = request.data.get("course_id")
        if not course_id:
            return Response({"detail": "course_id requis."}, status=status.HTTP_400_BAD_REQUEST)
        course = _get_writable_course(course_id, request.user)

        section_id = request.data.get("section_id") or None
        section = None
        if section_id:
            section = get_object_or_404(CourseSection, id=section_id, course=course)

        title = (request.data.get("title") or "").strip()
        if not title:
            return Response({"detail": "Le titre est requis."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            passing_score = int(request.data.get("passing_score") or 70)
            max_attempts = int(request.data.get("max_attempts") or 3)
        except (ValueError, TypeError):
            return Response({"detail": "passing_score / max_attempts doivent être des entiers."}, status=status.HTTP_400_BAD_REQUEST)

        quiz = Quiz.objects.create(
            title=title,
            course=course,
            section=section,
            passing_score=passing_score,
            max_attempts=max_attempts,
            is_onboarding=False,
            is_active=True,
        )

        return Response({
            "id": quiz.id,
            "title": quiz.title,
            "slug": quiz.slug,
            "course_id": quiz.course_id,
            "course_title": course.title,
            "section_id": quiz.section_id,
            "section_title": section.title if section else "",
            "passing_score": quiz.passing_score,
            "max_attempts": quiz.max_attempts,
            "questions_count": 0,
        }, status=status.HTTP_201_CREATED)


class InstructorSectionQuizCreateView(APIView):
    permission_classes = [IsAuthenticated, IsInstructor]

    def post(self, request, course_id: int, section_id: int):
        course = _get_writable_course(course_id, request.user)
        section = get_object_or_404(CourseSection, id=section_id, course=course)

        title = (request.data.get("title") or "").strip()
        passing_score = int(request.data.get("passing_score") or 70)
        max_attempts = int(request.data.get("max_attempts") or 3)

        if not title:
            return Response({"detail": "Le titre est requis."}, status=status.HTTP_400_BAD_REQUEST)

        quiz = Quiz.objects.create(
            title=title,
            course=course,
            section=section,
            passing_score=passing_score,
            max_attempts=max_attempts,
            is_onboarding=False,
            is_active=True,
        )

        return Response({
            "id": quiz.id,
            "title": quiz.title,
            "slug": quiz.slug,
            "section_id": quiz.section_id,
            "section_title": section.title,
            "passing_score": quiz.passing_score,
            "max_attempts": quiz.max_attempts,
            "questions_count": 0,
        }, status=status.HTTP_201_CREATED)


class InstructorQuizQuestionUpdateView(APIView):
    permission_classes = [IsAuthenticated, IsInstructor]

    def post(self, request, question_id: int):
        question = _get_writable_question(question_id, request.user)

        prompt = (request.data.get("prompt") or "").strip()
        topic = (request.data.get("topic") or "").strip()
        order = int(request.data.get("order") or question.order)
        choices = request.data.get("choices") or []

        if not prompt:
            return Response({"detail": "Le libellé de la question est requis."}, status=status.HTTP_400_BAD_REQUEST)

        if not isinstance(choices, list) or len(choices) < 2:
            return Response({"detail": "Au moins 2 choix sont requis."}, status=status.HTTP_400_BAD_REQUEST)

        has_correct = any(bool(item.get("is_correct")) for item in choices)
        if not has_correct:
            return Response({"detail": "Un choix correct est obligatoire."}, status=status.HTTP_400_BAD_REQUEST)

        question.prompt = prompt
        question.topic = topic
        question.order = order
        question.save(update_fields=["prompt", "topic", "order"])

        question.choices.all().delete()

        created_choices = []
        for item in choices:
            text = (item.get("text") or "").strip()
            if not text:
                continue

            choice = Choice.objects.create(
                question=question,
                text=text,
                is_correct=bool(item.get("is_correct"))
            )
            created_choices.append({
                "id": choice.id,
                "text": choice.text,
                "is_correct": choice.is_correct,
            })

        return Response({
            "id": question.id,
            "prompt": question.prompt,
            "topic": question.topic,
            "order": question.order,
            "choices": created_choices,
        })


class InstructorQuizQuestionDeleteView(APIView):
    permission_classes = [IsAuthenticated, IsInstructor]

    def post(self, request, question_id: int):
        question = _get_writable_question(question_id, request.user)
        question.delete()
        return Response({"ok": True})


class InstructorSectionQuizAssignView(APIView):
    permission_classes = [IsAuthenticated, IsInstructor]

    def post(self, request, course_id: int, section_id: int):
        course = _get_writable_course(course_id, request.user)
        section = get_object_or_404(CourseSection, id=section_id, course=course)

        quiz_id = request.data.get("quiz_id")
        if not quiz_id:
            return Response({"detail": "quiz_id requis."}, status=status.HTTP_400_BAD_REQUEST)

        quiz = get_object_or_404(Quiz, id=quiz_id, course=course)

        quiz.section = section
        quiz.course = course
        quiz.save(update_fields=["section", "course"])

        return Response({
            "ok": True,
            "quiz": {
                "id": quiz.id,
                "title": quiz.title,
                "section_id": quiz.section_id,
                "section_title": section.title,
            }
        })


class InstructorSectionQuizUnassignView(APIView):
    permission_classes = [IsAuthenticated, IsInstructor]

    def post(self, request, course_id: int, section_id: int):
        course = _get_writable_course(course_id, request.user)
        section = get_object_or_404(CourseSection, id=section_id, course=course)

        quiz = Quiz.objects.filter(course=course, section=section).first()
        if not quiz:
            return Response({"detail": "Aucun quiz rattaché à cette section."}, status=status.HTTP_404_NOT_FOUND)

        quiz.section = None
        quiz.save(update_fields=["section"])

        return Response({"ok": True})


class InstructorQuizQuestionCreateView(APIView):
    permission_classes = [IsAuthenticated, IsInstructor]

    def post(self, request, quiz_id: int):
        quiz = _get_writable_quiz(quiz_id, request.user)

        prompt = (request.data.get("prompt") or "").strip()
        topic = (request.data.get("topic") or "").strip()
        choices = request.data.get("choices") or []
        order = int(request.data.get("order") or (quiz.questions.count() + 1))

        if not prompt:
            return Response({"detail": "Le libellé de la question est requis."}, status=status.HTTP_400_BAD_REQUEST)

        if not isinstance(choices, list) or len(choices) < 2:
            return Response({"detail": "Au moins 2 choix sont requis."}, status=status.HTTP_400_BAD_REQUEST)

        question = Question.objects.create(
            quiz=quiz,
            prompt=prompt,
            topic=topic,
            order=order,
        )

        has_correct = False
        created_choices = []
        for item in choices:
            text = (item.get("text") or "").strip()
            is_correct = bool(item.get("is_correct"))
            if not text:
                continue
            if is_correct:
                has_correct = True

            ch = Choice.objects.create(
                question=question,
                text=text,
                is_correct=is_correct,
            )
            created_choices.append({
                "id": ch.id,
                "text": ch.text,
                "is_correct": ch.is_correct,
            })

        if not has_correct:
            question.delete()
            return Response({"detail": "Un choix correct est obligatoire."}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            "id": question.id,
            "prompt": question.prompt,
            "topic": question.topic,
            "order": question.order,
            "choices": created_choices,
        }, status=status.HTTP_201_CREATED)


class InstructorQuizDetailView(APIView):
    permission_classes = [IsAuthenticated, IsInstructor]

    @extend_schema(operation_id="instructor_quiz_detail")
    def get(self, request, quiz_id: int):
        quiz = _get_writable_quiz(
            quiz_id,
            request.user,
            select_related=("course", "section"),
            prefetch_related=("questions__choices",),
        )

        return Response({
            "id": quiz.id,
            "title": quiz.title,
            "slug": quiz.slug,
            "section_id": quiz.section_id,
            "section_title": quiz.section.title if quiz.section else "",
            "passing_score": quiz.passing_score,
            "max_attempts": quiz.max_attempts,
            "is_active": quiz.is_active,
            "questions": [
                {
                    "id": q.id,
                    "prompt": q.prompt,
                    "topic": q.topic,
                    "order": q.order,
                    "choices": [
                        {
                            "id": c.id,
                            "text": c.text,
                            "is_correct": c.is_correct,
                        }
                        for c in q.choices.all()
                    ]
                }
                for q in quiz.questions.all().order_by("order")
            ]
        })


class LearnerSectionQuizView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, course_id: int, section_id: int):
        course = get_object_or_404(Course, id=course_id)
        section = get_object_or_404(CourseSection, id=section_id, course=course)

        enrollment = Enrollment.objects.filter(user=request.user, course=course).first()
        if not enrollment:
            return Response({"detail": "Inscription requise."}, status=status.HTTP_403_FORBIDDEN)

        quiz = Quiz.objects.filter(course=course, section=section, is_active=True).prefetch_related(
            "questions__choices").first()
        if not quiz:
            return Response({"detail": "Aucun quiz pour cette section."}, status=status.HTTP_404_NOT_FOUND)

        attempts_count = Attempt.objects.filter(user=request.user, quiz=quiz).count()

        return Response({
            "id": quiz.id,
            "title": quiz.title,
            "passing_score": quiz.passing_score,
            "max_attempts": quiz.max_attempts,
            "attempts_count": attempts_count,
            "questions": [
                {
                    "id": q.id,
                    "prompt": q.prompt,
                    "topic": q.topic,
                    "order": q.order,
                    "choices": [
                        {
                            "id": c.id,
                            "text": c.text,
                        }
                        for c in q.choices.all()
                    ]
                }
                for q in quiz.questions.all().order_by("order")
            ]
        })


class LearnerSectionQuizSubmitView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, course_id: int, section_id: int):
        from django.db.models import Avg as _Avg
        course = get_object_or_404(Course, id=course_id)
        section = get_object_or_404(CourseSection, id=section_id, course=course)

        enrollment = Enrollment.objects.filter(user=request.user, course=course).first()
        if not enrollment:
            return Response({"detail": "Inscription requise."}, status=status.HTTP_403_FORBIDDEN)

        quiz = (
            Quiz.objects
            .filter(course=course, section=section, is_active=True)
            .prefetch_related("questions__choices")
            .first()
        )
        if not quiz:
            return Response({"detail": "Quiz introuvable."}, status=status.HTTP_404_NOT_FOUND)

        # CORRECTIF API-05 : select_for_update pour éviter la race condition sur max_attempts.
        with transaction.atomic():
            locked_attempts = list(
                Attempt.objects.select_for_update()
                .filter(user=request.user, quiz=quiz, submitted_at__isnull=False)
            )
            attempts_count = len(locked_attempts)
            if quiz.max_attempts and attempts_count >= quiz.max_attempts:
                return Response({"detail": "Nombre maximal de tentatives atteint."}, status=status.HTTP_400_BAD_REQUEST)

        raw_answers = request.data.get("answers") or []
        if not isinstance(raw_answers, list):
            return Response({"detail": "Format answers invalide."}, status=status.HTTP_400_BAD_REQUEST)

        # ── Déduplication : on garde la dernière réponse par question ──────────
        deduped: dict = {}
        for item in raw_answers:
            qid = item.get("question_id")
            if qid is not None:
                deduped[int(qid)] = item.get("choice_id")

        attempt = Attempt.objects.create(
            quiz=quiz,
            user=request.user,
            started_at=timezone.now(),
        )

        # ── Construire les maps en une seule passe (évite le N+1) ─────────────
        question_map = {}
        choice_map = {}
        for q in quiz.questions.all():
            question_map[q.id] = q
            for c in q.choices.all():
                choice_map[c.id] = c

        total_questions = len(question_map)
        good = 0
        bulk_answers = []

        for qid, cid in deduped.items():
            question = question_map.get(qid)
            if not question:
                continue
            choice = choice_map.get(cid) if cid else None
            if choice and choice.question_id != question.id:
                choice = None

            bulk_answers.append(AttemptAnswer(
                attempt=attempt,
                question=question,
                selected_choice=choice,
            ))
            if choice and choice.is_correct:
                good += 1

        AttemptAnswer.objects.bulk_create(bulk_answers, ignore_conflicts=True)

        score = int(round((good / total_questions) * 100)) if total_questions else 0
        passed = score >= quiz.passing_score

        attempt.score_percent = score
        attempt.passed = passed
        attempt.submitted_at = timezone.now()
        attempt.save(update_fields=["score_percent", "passed", "submitted_at"])

        # ── Mise à jour de la progression du learner ──────────────────────────
        # CORRECTIF API-55 : ne marquer la leçon complete QUE si le quiz est réussi.
        if quiz.lesson_id and enrollment and passed:
            try:
                lp, _ = LessonProgress.objects.get_or_create(
                    enrollment=enrollment,
                    lesson_id=quiz.lesson_id,
                    defaults={"progress_percent": 0, "completed": False, "last_position_sec": 0},
                )
                if not lp.completed:
                    lp.completed = True
                    lp.progress_percent = 100
                    lp.save(update_fields=["completed", "progress_percent", "updated_at"])

                # Recalcul du pourcentage global d'inscription
                lessons_qs = Lesson.objects.filter(section__course=course)
                total_l = lessons_qs.count()
                if total_l > 0:
                    avg = LessonProgress.objects.filter(
                        enrollment=enrollment,
                        lesson__in=lessons_qs,
                    ).aggregate(a=_Avg("progress_percent"))["a"] or 0
                    enrollment.progress_percent = int(round(avg))
                    save_fields = ["progress_percent"]
                    if hasattr(enrollment, "updated_at"):
                        save_fields.append("updated_at")
                    enrollment.save(update_fields=save_fields)
            except Exception:
                pass  # Ne jamais bloquer la soumission pour un bug de progression

        return Response({
            "attempt_id": attempt.id,
            "score_percent": score,
            "passed": passed,
            "passing_score": quiz.passing_score,
            "good_answers": good,
            "total_questions": total_questions,
        }, status=status.HTTP_201_CREATED)


try:
    from enrollments.models import Enrollment, LessonProgress
except Exception:
    Enrollment = None
    LessonProgress = None

try:
    from catalog.models import Payment
except Exception:
    Payment = None

try:
    from notifications.models import Notification
except Exception:
    Notification = None

try:
    from reviews.models import Review
except Exception:
    Review = None

# Si tu as boto helper / minio helper
try:
    from utils.storage import s3_client
except Exception:
    s3_client = None


# --------------------------------------------
# HELPERS
# --------------------------------------------
def _safe_get(obj, attr, default=""):
    try:
        value = getattr(obj, attr)
        return value if value is not None else default
    except Exception:
        return default


def _iso(dt):
    if not dt:
        return None
    try:
        return dt.isoformat()
    except Exception:
        return None


def _initials(name: str) -> str:
    name = (name or "").strip()
    if not name:
        return "A"
    parts = [p for p in name.split() if p]
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[1][0]).upper()


def _course_is_published(course: Course) -> bool:
    try:
        return course.status == Course.Status.PUBLISHED
    except Exception:
        return getattr(course, "status", "") == "PUBLISHED"


def _direct_enrollment_rejection(user, course):
    if not policies.can_view_course(user, course):
        return "Cours non disponible pour cet utilisateur."
    pricing_type = getattr(course, "pricing_type", None)
    price = getattr(course, "price", 0) or 0
    if pricing_type != Course.PricingType.FREE or price:
        return "Ce cours nécessite un paiement ou une attribution organisationnelle."
    return None


def _enrollment_defaults_for_course(course):
    defaults = {}
    if hasattr(Enrollment, "Status"):
        defaults["status"] = Enrollment.Status.ACTIVE
    elif "status" in {f.name for f in Enrollment._meta.fields}:
        defaults["status"] = "ACTIVE"
    if "progress_percent" in {f.name for f in Enrollment._meta.fields}:
        defaults["progress_percent"] = 0
    if getattr(course, "company_only", False) and getattr(course, "company_id", None):
        if "source" in {f.name for f in Enrollment._meta.fields} and hasattr(Enrollment, "Source"):
            defaults["source"] = Enrollment.Source.COMPANY
        if "company" in {f.name for f in Enrollment._meta.fields}:
            defaults["company"] = course.company
    return defaults


def _get_enrollment(user, course):
    if Enrollment is None:
        return None
    return Enrollment.objects.filter(user=user, course=course).first()


def ensure_lesson_progress(enrollment, course):
    """
    Crée les lignes LessonProgress manquantes pour un enrollment.
    """
    if LessonProgress is None:
        return

    lessons_qs = Lesson.objects.filter(section__course=course).only("id")
    lesson_ids = list(lessons_qs.values_list("id", flat=True))

    existing = set(
        LessonProgress.objects.filter(
            enrollment=enrollment,
            lesson_id__in=lesson_ids
        ).values_list("lesson_id", flat=True)
    )

    missing = [lid for lid in lesson_ids if lid not in existing]
    if missing:
        LessonProgress.objects.bulk_create([
            LessonProgress(
                enrollment=enrollment,
                lesson_id=lid,
                progress_percent=0,
                completed=False,
                last_position_sec=0
            )
            for lid in missing
        ], ignore_conflicts=True)


def _course_to_dict(course, request=None, is_enrolled=False, enrolled_at=None):
    thumb_url = ""
    try:
        if getattr(course, "thumbnail", None):
            thumb_url = course.thumbnail.url
    except Exception:
        thumb_url = ""

    instr = getattr(course, "instructor", None)
    instructor_name = (
            _safe_get(instr, "full_name", "")
            or f"{getattr(instr, 'first_name', '')} {getattr(instr, 'last_name', '')}".strip()
            or _safe_get(instr, "email", "")
            or "Formateur"
    )

    category = getattr(course, "category", None)
    category_name = _safe_get(category, "name", "") if category else ""

    detail_url = f"/landinghome/courses/{getattr(course, 'slug', course.id)}-{course.id}/"
    preview_url = detail_url
    enroll_url = f"/api/learner/courses/{course.id}/enroll/"
    continue_url = f"/learn/course/{getattr(course, 'slug', course.id)}/"

    try:
        detail_url = reverse("course_public_page", kwargs={"slug": course.slug, "course_id": course.id})
        preview_url = detail_url
    except Exception:
        pass

    try:
        continue_url = reverse("learn:course_learn", kwargs={"slug": course.slug})
    except Exception:
        pass

    try:
        course_type_label = course.get_course_type_display()
    except Exception:
        course_type_label = str(_safe_get(course, "course_type", "") or "")

    try:
        pricing_type_label = course.get_pricing_type_display()
    except Exception:
        pricing_type_label = str(_safe_get(course, "pricing_type", "") or "")

    rating_avg = _safe_get(course, "rating_avg", None)
    rating = rating_avg if rating_avg is not None else _safe_get(course, "rating", None)

    published_at = _safe_get(course, "published_at", None) or _safe_get(course, "created_at", None)
    updated_at = _safe_get(course, "updated_at", None)

    return {
        "id": course.id,
        "title": _safe_get(course, "title", ""),
        "subtitle": _safe_get(course, "subtitle", ""),
        "description": _safe_get(course, "description", ""),
        "course_type": _safe_get(course, "course_type", None),
        "course_type_label": course_type_label,
        "pricing_type": _safe_get(course, "pricing_type", "PAID"),
        "pricing_type_label": pricing_type_label,
        "price": _safe_get(course, "price", 0) or 0,
        "currency": _safe_get(course, "currency", "XOF") or "XOF",
        "status": _safe_get(course, "status", None),
        "thumbnail_url": thumb_url,
        "preview_video_url": _safe_get(course, "preview_video_url", ""),
        "detail_url": detail_url,
        "preview_url": preview_url,
        "enroll_url": enroll_url,
        "continue_url": continue_url if is_enrolled else None,
        "published_at": _iso(published_at),
        "updated_at": _iso(updated_at),
        "price_period": _safe_get(course, "price_period", "cours"),
        "category_name": category_name,
        "instructor": {
            "id": getattr(instr, "id", None),
            "full_name": instructor_name,
        },
        "instructor_name": instructor_name,
        "instructor_initials": _initials(instructor_name),
        "rating_avg": rating_avg,
        "rating_count": _safe_get(course, "rating_count", None),
        "rating": rating,
        "enrolled_count": _safe_get(course, "enrolled_count", 0) or 0,
        "is_enrolled": bool(is_enrolled),
        "enrolled_at": _iso(enrolled_at),
    }


# --------------------------------------------
# BASE API
# --------------------------------------------
class LearnerBaseAPIView(APIView):
    permission_classes = [IsAuthenticated]
    renderer_classes = [JSONRenderer]


# --------------------------------------------
# /api/learner/me/
# --------------------------------------------
class LearnerMeView(LearnerBaseAPIView):
    def get(self, request):
        u = request.user
        full_name = (
                getattr(u, "full_name", "")
                or getattr(u, "get_full_name", lambda: "")()
                or ""
        )
        return Response({
            "id": u.id,
            "email": getattr(u, "email", "") or "",
            "full_name": full_name,
            "phone": getattr(u, "phone", "") or "",
            "role": getattr(u, "role", None),
            "is_staff": bool(getattr(u, "is_staff", False)),
            "initials": _initials(full_name or getattr(u, "email", "")),
        })


# --------------------------------------------
# /api/learner/kpis/
# --------------------------------------------
class LearnerKpisView(LearnerBaseAPIView):
    def get(self, request):
        days = _range_to_days(request.query_params.get("range", "30d"))
        since = timezone.now() - timedelta(days=days)
        u = request.user

        enrolled_total = 0
        enrolled_recent = 0
        completed_total = 0
        progress_avg = 0
        hours_watched = 0
        rating_avg_given = None

        if Enrollment is not None:
            base = Enrollment.objects.filter(user=u)
            enrolled_total = base.count()
            try:
                enrolled_recent = base.filter(created_at__gte=since).count()
            except Exception:
                enrolled_recent = 0

            try:
                completed_total = base.filter(status__in=["COMPLETED", "DONE"]).count()
            except Exception:
                try:
                    completed_total = base.filter(progress_percent__gte=100).count()
                except Exception:
                    completed_total = 0

        if LessonProgress is not None:
            try:
                qs = LessonProgress.objects.filter(enrollment__user=u)
                progress_avg = qs.aggregate(a=Avg("progress_percent"))["a"] or 0
            except Exception:
                progress_avg = 0

            try:
                watched_seconds = qs.aggregate(s=Sum("last_position_sec"))["s"] or 0
                hours_watched = int(watched_seconds / 3600)
            except Exception:
                hours_watched = 0

        if Review is not None:
            try:
                rating_avg_given = Review.objects.filter(user=u).aggregate(a=Avg("rating"))["a"]
            except Exception:
                rating_avg_given = None

        return Response({
            "range": f"{days}d",
            "enrollments": {
                "total": enrolled_total,
                "recent": enrolled_recent,
                "completed": completed_total,
            },
            "progress": {
                "avg_percent": round(float(progress_avg or 0), 1),
                "hours_watched_est": hours_watched,
            },
            "reviews": {
                "avg_rating_given": round(float(rating_avg_given), 1) if rating_avg_given is not None else None,
            }
        })


# --------------------------------------------
# /api/learner/enrollments/
# GET + POST
# --------------------------------------------
class LearnerEnrollmentsView(LearnerBaseAPIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        u = request.user
        q = (request.query_params.get("q") or "").strip()
        status_param = (request.query_params.get("status") or "").strip()
        limit = int(request.query_params.get("limit") or 100)

        if Enrollment is None or Course is None:
            return Response({"count": 0, "results": []})

        qs = Enrollment.objects.filter(user=u).select_related("course", "course__instructor").order_by("-id")

        if status_param:
            try:
                qs = qs.filter(status=status_param)
            except Exception:
                pass

        if q:
            qs = qs.filter(
                Q(course__title__icontains=q) |
                Q(course__subtitle__icontains=q) |
                Q(course__description__icontains=q)
            )

        results = []
        for e in qs[:limit]:
            c = getattr(e, "course", None)
            if not c:
                continue

            course_data = _course_to_dict(
                c,
                request=request,
                is_enrolled=True,
                enrolled_at=getattr(e, "created_at", None)
            )

            results.append({
                "enrollment_id": e.id,
                "course": course_data,
                "status": getattr(e, "status", None),
                "progress_percent": int(getattr(e, "progress_percent", 0) or 0),
                "created_at": _iso(getattr(e, "created_at", None)),
            })

        return Response({"count": qs.count(), "results": results})

    def post(self, request):
        if Enrollment is None or Course is None:
            return Response(
                {"detail": "Enrollment/Course non disponibles."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        raw_id = request.data.get("course_id") or request.data.get("id") or request.data.get("course")
        try:
            course_id = int(raw_id)
        except Exception:
            return Response({"detail": "course_id invalide."}, status=status.HTTP_400_BAD_REQUEST)

        course = get_object_or_404(
            get_visible_courses_qs(request.user).select_related("company"),
            id=course_id,
        )
        rejection = _direct_enrollment_rejection(request.user, course)
        if rejection:
            return Response({"detail": rejection}, status=status.HTTP_402_PAYMENT_REQUIRED)

        defaults = _enrollment_defaults_for_course(course)

        try:
            with transaction.atomic():
                Course.objects.select_for_update().filter(pk=course.pk).exists()
                enrollment, created = Enrollment.objects.get_or_create(
                    user=request.user,
                    course=course,
                    defaults=defaults
                )
        except IntegrityError:
            enrollment = Enrollment.objects.filter(user=request.user, course=course).first()
            created = False

        if not enrollment:
            return Response(
                {"detail": "Impossible de créer l'inscription."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        ensure_lesson_progress(enrollment, course)

        return Response({
            "enrollment_id": enrollment.id,
            "course_id": course.id,
            "created": bool(created),
            "detail": "Inscription effectuée." if created else "Déjà inscrit."
        }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


# --------------------------------------------
# /api/learner/courses/
# explore
# --------------------------------------------
class LearnerExploreCoursesView(LearnerBaseAPIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        q = (request.query_params.get("q") or "").strip()
        course_type = (request.query_params.get("type") or "").strip()
        pricing = (request.query_params.get("pricing") or "").strip()
        mine = (request.query_params.get("mine") or "").strip().lower() in ("1", "true", "yes")

        limit = int(request.query_params.get("limit") or 20)
        offset = int(request.query_params.get("offset") or 0)

        qs = get_visible_courses_qs(
            request.user,
            base_qs=Course.objects.select_related("instructor", "category", "company"),
        )

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

        enrolled_map = {}
        if Enrollment is not None:
            enroll_qs = Enrollment.objects.filter(user=request.user)
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
            "results": results
        })


# --------------------------------------------
# /api/learner/courses/<id>/
# --------------------------------------------
class LearnerOrganizationCoursesAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user

        organization_ids = OrganizationMembership.objects.filter(

            user=user,

            is_active=True,

            organization__is_active=True,

            role=OrganizationMembership.Role.LEARNER,

        ).values_list("organization_id", flat=True)

        courses = (

            Course.objects.filter(

                company_only=True,

                company_id__in=organization_ids,

                status=Course.Status.PUBLISHED,

            )

            .select_related("category", "instructor", "company")

            .order_by("-published_at", "-created_at")

        )

        results = []

        for course in courses:
            results.append({

                "id": course.id,

                "title": course.title,

                "subtitle": course.subtitle,

                "company_name": course.company.name if course.company else "",

                "category_name": course.category.name if course.category else "",

                "instructor_name": course.instructor.full_name or course.instructor.email,

                "thumbnail_url": course.thumbnail.url if course.thumbnail else "",

                "detail_url": reverse("course_public_page", kwargs={"slug": course.slug, "course_id": course.id}),

                "continue_url": f"/dashboard/learner/courses/{course.id}/",

            })

        return Response({

            "count": len(results),

            "results": results,

        })


class LearnerCourseDetailView(LearnerBaseAPIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(operation_id="learner_course_detail")
    def get(self, request, course_id: int):
        course = get_object_or_404(
            get_visible_courses_qs(
                request.user,
                base_qs=Course.objects.select_related("instructor", "category", "company"),
            ),
            id=course_id,
        )

        is_enrolled = False
        enrolled_at = None
        if Enrollment is not None:
            e = Enrollment.objects.filter(user=request.user, course=course).first()
            is_enrolled = bool(e)
            enrolled_at = getattr(e, "created_at", None) if e else None

        return Response(_course_to_dict(course, request=request, is_enrolled=is_enrolled, enrolled_at=enrolled_at))


# --------------------------------------------
# /api/learner/courses/<id>/enroll/
# --------------------------------------------
class LearnerEnrollView(LearnerBaseAPIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, course_id: int):
        if Enrollment is None:
            return Response({"detail": "Enrollment indisponible."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        course = get_object_or_404(
            get_visible_courses_qs(request.user).select_related("company"),
            id=course_id,
        )
        rejection = _direct_enrollment_rejection(request.user, course)
        if rejection:
            return Response({"detail": rejection}, status=status.HTTP_402_PAYMENT_REQUIRED)

        defaults = _enrollment_defaults_for_course(course)

        try:
            with transaction.atomic():
                Course.objects.select_for_update().filter(pk=course.pk).exists()
                enrollment, created = Enrollment.objects.get_or_create(
                    user=request.user,
                    course=course,
                    defaults=defaults
                )
        except IntegrityError:
            enrollment = Enrollment.objects.filter(user=request.user, course=course).first()
            created = False
        except Exception as e:
            return Response(
                {"detail": "Erreur pendant l'inscription.", "error": str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

        ensure_lesson_progress(enrollment, course)

        return Response({
            "enrolled": True,
            "created": bool(created),
            "enrollment_id": enrollment.id,
            "course_id": course.id
        }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


# --------------------------------------------
# /api/learner/courses/<id>/progress/
# progression globale d'un cours
# --------------------------------------------
class LearnerCourseProgressView(LearnerBaseAPIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, course_id: int):
        course = get_object_or_404(Course, id=course_id)
        enrollment = _get_enrollment(request.user, course)
        if not enrollment:
            return Response({"detail": "Inscription requise."}, status=status.HTTP_403_FORBIDDEN)

        ensure_lesson_progress(enrollment, course)

        lessons_qs = Lesson.objects.filter(section__course=course).only("id", "title")
        lesson_ids = list(lessons_qs.values_list("id", flat=True))

        lp_qs = LessonProgress.objects.filter(enrollment=enrollment, lesson_id__in=lesson_ids)
        completed_lessons = lp_qs.filter(completed=True).count()
        avg_percent = lp_qs.aggregate(a=Avg("progress_percent"))["a"] or 0
        course_percent = int(round(avg_percent))

        lps = {p.lesson_id: p for p in lp_qs.select_related("lesson")}
        lessons_payload = []
        for lesson in lessons_qs:
            p = lps.get(lesson.id)
            lessons_payload.append({
                "lesson_id": lesson.id,
                "lesson_title": lesson.title,
                "percent": int(p.progress_percent or 0) if p else 0,
                "is_completed": bool(p.completed) if p else False,
                "updated_at": _iso(getattr(p, "updated_at", None)) if p else None,
            })

        return Response({
            "course_id": course.id,
            "progress_percent": course_percent,
            "completed_lessons": completed_lessons,
            "total_lessons": lessons_qs.count(),
            "lessons": lessons_payload
        })


# --------------------------------------------
# /api/learner/progress/
# progression globale apprenant
# --------------------------------------------
class LearnerProgressView(LearnerBaseAPIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        days = _range_to_days(request.query_params.get("range", "30d"))

        if Enrollment is None:
            return Response({
                "range": f"{days}d",
                "summary": {
                    "courses_enrolled": 0,
                    "courses_completed": 0,
                    "avg_completion": 0,
                    "lessons_done": 0,
                    "lessons_total": 0,
                    "last_activity": None,
                },
                "results": []
            })

        enrollments_qs = Enrollment.objects.filter(user=user).select_related("course")
        q = (request.query_params.get("q") or "").strip()
        if q:
            enrollments_qs = enrollments_qs.filter(course__title__icontains=q)

        limit = int(request.query_params.get("limit") or 50)
        offset = int(request.query_params.get("offset") or 0)
        enrollments = list(enrollments_qs.order_by("-created_at")[offset:offset + limit])

        if LessonProgress is None:
            results = []
            for e in enrollments:
                c = e.course
                results.append({
                    "course_id": c.id,
                    "course_title": getattr(c, "title", ""),
                    "course_status": getattr(c, "status", None),
                    "enrolled_at": _iso(getattr(e, "created_at", None)),
                    "completion_rate": 0,
                    "lessons_done": 0,
                    "lessons_total": 0,
                    "last_activity": None,
                })
            return Response({
                "range": f"{days}d",
                "summary": {
                    "courses_enrolled": enrollments_qs.count(),
                    "courses_completed": 0,
                    "avg_completion": 0,
                    "lessons_done": 0,
                    "lessons_total": 0,
                    "last_activity": None,
                },
                "results": results
            })

        results = []
        total_courses_completed = 0
        sum_completion = 0
        sum_done = 0
        sum_total = 0
        global_last = None

        for e in enrollments:
            course = e.course
            ensure_lesson_progress(e, course)

            lessons_ids = list(
                Lesson.objects.filter(section__course=course).values_list("id", flat=True)
            )
            lp_qs = LessonProgress.objects.filter(enrollment=e, lesson_id__in=lessons_ids)

            done = lp_qs.filter(completed=True).count()
            total = len(lessons_ids)
            last_activity = lp_qs.aggregate(m=Max("updated_at"))["m"]
            completion = int(round((done / total) * 100)) if total > 0 else 0

            if total > 0 and done >= total:
                total_courses_completed += 1

            sum_completion += completion
            sum_done += done
            sum_total += total

            if last_activity and (global_last is None or last_activity > global_last):
                global_last = last_activity

            results.append({
                "course_id": course.id,
                "course_title": getattr(course, "title", ""),
                "course_status": getattr(course, "status", None),
                "enrolled_at": _iso(getattr(e, "created_at", None)),
                "completion_rate": completion,
                "lessons_done": done,
                "lessons_total": total,
                "last_activity": _iso(last_activity),
            })

        avg_completion = int(round(sum_completion / len(results))) if results else 0

        return Response({
            "range": f"{days}d",
            "summary": {
                "courses_enrolled": enrollments_qs.count(),
                "courses_completed": total_courses_completed,
                "avg_completion": avg_completion,
                "lessons_done": sum_done,
                "lessons_total": sum_total,
                "last_activity": _iso(global_last),
            },
            "results": results
        })


# --------------------------------------------
# /api/learner/notifications/
# --------------------------------------------
class LearnerNotificationsView(LearnerBaseAPIView):
    def get(self, request):
        if Notification is None:
            return Response({"count": 0, "results": []})

        u = request.user
        limit = int(request.query_params.get("limit") or 50)

        try:
            qs = Notification.objects.filter(user=u).order_by("-created_at")
        except Exception:
            return Response({"count": 0, "results": []})

        results = []
        for n in qs[:limit]:
            results.append({
                "id": n.id,
                "title": getattr(n, "title", "") or "",
                "body": getattr(n, "body", "") or getattr(n, "message", "") or "",
                "time": _iso(getattr(n, "created_at", None)),
                "is_read": bool(getattr(n, "is_read", False)),
            })

        return Response({"count": qs.count(), "results": results})


# --------------------------------------------
# /api/learner/payments/
# --------------------------------------------
class LearnerPaymentsView(LearnerBaseAPIView):
    def get(self, request):
        if Payment is None:
            return Response({"count": 0, "results": []})

        u = request.user
        limit = int(request.query_params.get("limit") or 100)

        try:
            qs = Payment.objects.filter(user=u).order_by("-created_at")
        except Exception:
            return Response({"count": 0, "results": []})

        results = []
        for p in qs[:limit]:
            results.append({
                "id": p.id,
                "reference": getattr(p, "reference", None) or getattr(p, "ref", None) or str(p.id),
                "created_at": _iso(getattr(p, "created_at", None)),
                "amount": getattr(p, "amount", None),
                "currency": getattr(p, "currency", "XOF"),
                "status": getattr(p, "status", None),
                "status_label": getattr(p, "status_label", None) or getattr(p, "status", None),
            })

        return Response({"count": qs.count(), "results": results})


# --------------------------------------------
# /api/learner/courses/<id>/outline/
# --------------------------------------------
class LearnerCourseOutlineView(LearnerBaseAPIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, course_id: int):
        course = get_object_or_404(Course, id=course_id)
        if not _course_is_published(course):
            return Response({"detail": "Cours non disponible."}, status=status.HTTP_403_FORBIDDEN)

        enrollment = _get_enrollment(request.user, course)
        if not enrollment:
            return Response({"detail": "Vous n'êtes pas inscrit à ce cours."}, status=status.HTTP_403_FORBIDDEN)

        ensure_lesson_progress(enrollment, course)

        lessons_qs = (
            Lesson.objects
            .filter(section__course=course)
            .select_related("section")
            .order_by("section__order", "order", "id")
        )

        progress_qs = LessonProgress.objects.filter(enrollment=enrollment, lesson__in=lessons_qs)
        progress_map = {p.lesson_id: p for p in progress_qs}

        total_lessons = lessons_qs.count()
        completed_lessons = sum(1 for p in progress_map.values() if p.completed)
        percent_global = round((completed_lessons / total_lessons) * 100) if total_lessons else 0

        sections = CourseSection.objects.filter(course=course).prefetch_related("lessons").order_by("order", "id")

        out_sections = []
        for s in sections:
            out_lessons = []
            for lesson in s.lessons.all().order_by("order", "id"):
                p = progress_map.get(lesson.id)
                out_lessons.append({
                    "id": lesson.id,
                    "title": lesson.title,
                    "lesson_type": lesson.lesson_type,
                    "type": lesson.lesson_type,
                    "duration_sec": lesson.duration_sec,
                    "duration_seconds": lesson.duration_sec,
                    "is_preview": bool(lesson.is_preview),
                    "progress_percent": int(float(p.progress_percent)) if p else 0,
                    "percent": int(float(p.progress_percent)) if p else 0,
                    "completed": bool(p.completed) if p else False,
                    "is_completed": bool(p.completed) if p else False,
                })
            out_sections.append({
                "id": s.id,
                "title": s.title,
                "order": s.order,
                "lessons": out_lessons
            })

        first_lesson_id = lessons_qs.first().id if total_lessons else None
        current_id = getattr(enrollment, "current_lesson_id", None) or first_lesson_id

        return Response({
            "course": {"id": course.id, "title": getattr(course, "title", "")},
            "current_lesson_id": current_id,
            "progress": {
                "percent": percent_global,
                "completed_lessons": completed_lessons,
                "total_lessons": total_lessons
            },
            "sections": out_sections,
        })


# --------------------------------------------
# /api/learner/courses/<id>/continue/
# --------------------------------------------
class LearnerContinueView(LearnerBaseAPIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, course_id: int):
        course = get_object_or_404(Course, id=course_id)
        if not _course_is_published(course):
            return Response({"detail": "Cours non disponible."}, status=status.HTTP_403_FORBIDDEN)

        enrollment = _get_enrollment(request.user, course)
        if not enrollment:
            return Response({"detail": "Vous n'êtes pas inscrit à ce cours."}, status=status.HTTP_403_FORBIDDEN)

        ensure_lesson_progress(enrollment, course)

        lessons = Lesson.objects.filter(section__course=course).order_by("section__order", "order", "id")
        if not lessons.exists():
            return Response({"detail": "Cours vide."}, status=status.HTTP_404_NOT_FOUND)

        if getattr(enrollment, "current_lesson_id", None):
            lesson = Lesson.objects.filter(id=enrollment.current_lesson_id, section__course=course).first()
            if lesson:
                return Response({"lesson_id": lesson.id})

        completed_ids = set(
            LessonProgress.objects.filter(
                enrollment=enrollment,
                lesson__section__course=course,
                completed=True
            ).values_list("lesson_id", flat=True)
        )

        for lesson in lessons:
            if lesson.id not in completed_ids:
                if hasattr(enrollment, "current_lesson"):
                    enrollment.current_lesson = lesson
                    fields = ["current_lesson"]
                    if hasattr(enrollment, "updated_at"):
                        fields.append("updated_at")
                    enrollment.save(update_fields=fields)
                return Response({"lesson_id": lesson.id})

        last = lessons.last()
        if hasattr(enrollment, "current_lesson"):
            enrollment.current_lesson = last
        if hasattr(Enrollment, "Status"):
            enrollment.status = Enrollment.Status.COMPLETED
        elif hasattr(enrollment, "status"):
            enrollment.status = "COMPLETED"
        if hasattr(enrollment, "completed_at"):
            enrollment.completed_at = timezone.now()

        fields = []
        for f in ["current_lesson", "status", "completed_at", "updated_at"]:
            if hasattr(enrollment, f):
                fields.append(f)
        if fields:
            enrollment.save(update_fields=fields)

        return Response({"lesson_id": last.id, "course_completed": True})


# --------------------------------------------
# /api/learner/courses/<id>/lessons/<id>/state/
# --------------------------------------------
class LearnerLessonStateView(LearnerBaseAPIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, course_id: int, lesson_id: int):
        course = get_object_or_404(Course, id=course_id)
        lesson = get_object_or_404(
            Lesson.objects.select_related("media_asset", "section__course"),
            id=lesson_id,
            section__course=course
        )

        enrollment = _get_enrollment(request.user, course)
        if not enrollment:
            return Response({"detail": "Inscription requise."}, status=status.HTTP_403_FORBIDDEN)

        lp, _ = LessonProgress.objects.get_or_create(enrollment=enrollment, lesson=lesson)

        video_url = lesson.video_url or None
        file_url = None

        bucket = getattr(settings, "MINIO_BUCKET", None)

        # Fichier Django classique
        if getattr(lesson, "file", None):
            try:
                file_url = lesson.file.url
            except Exception:
                file_url = None

        # Média MinIO attaché
        if lesson.media_asset_id and bucket:
            try:
                if not policies.can_access_media(request.user, lesson.media_asset):
                    return Response({"detail": "Média non autorisé."}, status=status.HTTP_403_FORBIDDEN)
                client = s3_public_client()
                signed_url = client.generate_presigned_url(
                    ClientMethod="get_object",
                    Params={
                        "Bucket": bucket,
                        "Key": lesson.media_asset.effective_object_key,
                    },
                    ExpiresIn=SIGNED_READ_TTL_SECONDS,
                )

                if lesson.lesson_type == Lesson.LessonType.VIDEO:
                    video_url = signed_url
                else:
                    file_url = signed_url
            except Exception:
                pass

        return Response({
            "lesson": {
                "id": lesson.id,
                "title": lesson.title,
                "lesson_type": lesson.lesson_type,
                "type": lesson.lesson_type,
                "video_url": video_url,
                "file_url": file_url,
                "content": lesson.content,
                "duration_sec": lesson.duration_sec,
                "duration_seconds": lesson.duration_sec,
                "media_asset_id": str(lesson.media_asset_id) if lesson.media_asset_id else None,
            },
            "progress": {
                "percent": int(lp.progress_percent or 0),
                "progress_percent": int(lp.progress_percent or 0),
                "is_completed": bool(lp.completed),
                "completed": bool(lp.completed),
                "last_position_seconds": int(lp.last_position_sec or 0),
                "last_position_sec": int(lp.last_position_sec or 0),
                "updated_at": _iso(getattr(lp, "updated_at", None)),
            }
        })


# --------------------------------------------
# /api/learner/courses/<id>/lessons/<id>/progress/
# --------------------------------------------
class LearnerLessonProgressUpdateView(LearnerBaseAPIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, course_id: int, lesson_id: int):
        course = get_object_or_404(Course, id=course_id)
        lesson = get_object_or_404(Lesson, id=lesson_id, section__course=course)

        enrollment = _get_enrollment(request.user, course)
        if not enrollment:
            return Response({"detail": "Inscription requise."}, status=status.HTTP_403_FORBIDDEN)

        lp, _ = LessonProgress.objects.get_or_create(enrollment=enrollment, lesson=lesson)

        percent = request.data.get("percent")
        last_pos = request.data.get("last_position_seconds", request.data.get("last_position_sec"))
        is_completed = request.data.get("is_completed")
        current_percent = int(lp.progress_percent or 0)
        current_position = int(lp.last_position_sec or 0)
        reported_percent = current_percent
        reported_position = current_position

        if percent is not None:
            try:
                reported_percent = max(0, min(100, int(percent)))
            except Exception:
                pass

        if last_pos is not None:
            try:
                reported_position = max(0, int(last_pos))
            except Exception:
                pass

        duration = int(getattr(lesson, "duration_sec", 0) or 0)
        if duration:
            reported_position = min(reported_position, duration + 60)
            derived_percent = min(99, int((reported_position / max(duration, 1)) * 100))
            reported_percent = max(reported_percent, derived_percent)
            if lesson.lesson_type == Lesson.LessonType.VIDEO and reported_position < int(duration * 0.9):
                reported_percent = min(reported_percent, 94)

        lp.last_position_sec = max(current_position, reported_position)
        lp.progress_percent = max(current_percent, min(100, reported_percent))

        completed_flag = False
        if is_completed is True or str(is_completed).lower() == "true":
            completed_flag = True

        can_mark_completed = int(lp.progress_percent or 0) >= 100
        if lesson.lesson_type == Lesson.LessonType.VIDEO and duration:
            can_mark_completed = (
                int(lp.progress_percent or 0) >= 95
                and int(lp.last_position_sec or 0) >= int(duration * 0.9)
            )

        if can_mark_completed and (completed_flag or int(lp.progress_percent or 0) >= 100):
            lp.completed = True
            lp.progress_percent = 100
        else:
            if int(lp.progress_percent or 0) < 100:
                lp.completed = False

        lp.save()

        # R14 : recompute course progress (completion ratio, pas moyenne)
        summary = _recompute_course_progress(enrollment, course)

        return Response({
            "ok": True,
            "lesson_id": lesson.id,
            "progress": {
                "percent": int(lp.progress_percent or 0),
                "progress_percent": int(lp.progress_percent or 0),
                "is_completed": bool(lp.completed),
                "completed": bool(lp.completed),
                "last_position_seconds": int(lp.last_position_sec or 0),
                "last_position_sec": int(lp.last_position_sec or 0),
            },
            "course_progress": {
                "course_id": course.id,
                "progress_percent": summary["progress_percent"],
                "completed_lessons": summary["completed_lessons"],
                "total_lessons": summary["total_lessons"],
                "status": summary["status"],
                "completed_at": summary["completed_at"],
            },
        })


# --------------------------------------------
# R14 — Helper recompute course progress
# --------------------------------------------
def _recompute_course_progress(enrollment, course) -> dict:
    """
    Recalcule le pourcentage du cours à partir des LessonProgress
    (ratio completed_lessons / total_lessons) puis persiste sur Enrollment.

    Retour : dict avec progress_percent (int), completed_lessons, total_lessons,
    status, completed_at (ISO ou None).
    """
    lesson_ids = list(
        Lesson.objects.filter(section__course=course).values_list("id", flat=True)
    )
    total_lessons = len(lesson_ids)
    completed_lessons = 0
    if total_lessons > 0:
        completed_lessons = LessonProgress.objects.filter(
            enrollment=enrollment,
            lesson_id__in=lesson_ids,
            completed=True,
        ).count()

    course_percent = (
        int(round((completed_lessons / total_lessons) * 100)) if total_lessons else 0
    )

    fields_to_update = []
    if hasattr(enrollment, "progress_percent") and enrollment.progress_percent != course_percent:
        enrollment.progress_percent = course_percent
        fields_to_update.append("progress_percent")

    if total_lessons > 0 and completed_lessons >= total_lessons:
        # Cours 100% : marque COMPLETED (idempotent)
        target_status = getattr(Enrollment.Status, "COMPLETED", "COMPLETED")
        if getattr(enrollment, "status", None) != target_status:
            enrollment.status = target_status
            fields_to_update.append("status")
        if hasattr(enrollment, "completed_at") and not enrollment.completed_at:
            enrollment.completed_at = timezone.now()
            fields_to_update.append("completed_at")

    if fields_to_update:
        fields_to_update.append("updated_at")
        enrollment.save(update_fields=fields_to_update)

    return {
        "progress_percent": course_percent,
        "completed_lessons": completed_lessons,
        "total_lessons": total_lessons,
        "status": getattr(enrollment, "status", "ACTIVE"),
        "completed_at": (
            enrollment.completed_at.isoformat()
            if getattr(enrollment, "completed_at", None)
            else None
        ),
    }


# --------------------------------------------
# R14 — /api/learner/courses/<id>/lessons/<lesson_id>/complete/
# Marquage manuel (doc, article, audio, quiz). Bypass la logique
# vidéo 90 % : réservée aux types non-vidéo.
# --------------------------------------------
class LearnerLessonCompleteView(LearnerBaseAPIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, course_id: int, lesson_id: int):
        course = get_object_or_404(Course, id=course_id)
        lesson = get_object_or_404(Lesson, id=lesson_id, section__course=course)

        enrollment = _get_enrollment(request.user, course)
        if not enrollment:
            return Response(
                {"detail": "Inscription requise."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Vidéo : refuser le marquage manuel — passer par progress avec 90 %
        if (
            lesson.lesson_type == Lesson.LessonType.VIDEO
            and int(getattr(lesson, "duration_sec", 0) or 0) > 0
        ):
            return Response(
                {
                    "detail": (
                        "Une leçon vidéo doit être visionnée à 90% pour être "
                        "considérée comme terminée. Utilisez l'endpoint "
                        "/progress/ à la place."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        lp, _ = LessonProgress.objects.get_or_create(
            enrollment=enrollment, lesson=lesson
        )
        lp.mark_completed()  # completed=True, progress_percent=100

        summary = _recompute_course_progress(enrollment, course)

        return Response({
            "ok": True,
            "lesson_id": lesson.id,
            "progress": {
                "percent": 100,
                "progress_percent": 100,
                "completed": True,
                "is_completed": True,
                "last_position_seconds": int(lp.last_position_sec or 0),
                "last_position_sec": int(lp.last_position_sec or 0),
            },
            "course_progress": {
                "course_id": course.id,
                "progress_percent": summary["progress_percent"],
                "completed_lessons": summary["completed_lessons"],
                "total_lessons": summary["total_lessons"],
                "status": summary["status"],
                "completed_at": summary["completed_at"],
            },
        })


# --------------------------------------------
# /api/learner/courses/<id>/set-current/
# --------------------------------------------
class LearnerSetCurrentLessonView(LearnerBaseAPIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, course_id: int):
        course = get_object_or_404(Course, id=course_id)
        enrollment = _get_enrollment(request.user, course)
        if not enrollment:
            return Response({"detail": "Inscription requise."}, status=status.HTTP_403_FORBIDDEN)

        lesson_id = request.data.get("lesson_id")
        if not lesson_id:
            return Response({"detail": "lesson_id requis."}, status=status.HTTP_400_BAD_REQUEST)

        lesson = get_object_or_404(Lesson, id=int(lesson_id), section__course=course)

        if hasattr(enrollment, "current_lesson"):
            enrollment.current_lesson = lesson
            fields = ["current_lesson"]
            if hasattr(enrollment, "updated_at"):
                fields.append("updated_at")
            enrollment.save(update_fields=fields)

        return Response({"ok": True, "current_lesson_id": lesson.id})


# --------------------------------------------
# /api/learner/player/<id>/
# legacy compatible
# --------------------------------------------
class LearnerCoursePlayerDataView(LearnerBaseAPIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, course_id: int):
        course = get_object_or_404(Course, id=course_id)
        enrollment = _get_enrollment(request.user, course)
        if not enrollment:
            return Response({"detail": "Inscription requise."}, status=status.HTTP_403_FORBIDDEN)

        ensure_lesson_progress(enrollment, course)

        sections = CourseSection.objects.filter(course=course).prefetch_related("lessons").order_by("order")
        lessons_qs = Lesson.objects.filter(section__course=course).select_related("section").order_by("section__order",
                                                                                                      "order")

        lesson_ids = list(lessons_qs.values_list("id", flat=True))
        prog = {
            p.lesson_id: p
            for p in LessonProgress.objects.filter(enrollment=enrollment, lesson_id__in=lesson_ids)
        }

        current_lesson = None
        for lesson in lessons_qs:
            p = prog.get(lesson.id)
            if p and not p.completed:
                current_lesson = lesson
                break
        if current_lesson is None:
            current_lesson = lessons_qs.first()

        # R19.6 — préchargement des quiz de section + tentatives réussies user
        try:
            from assessments.models import Quiz as _Quiz, Attempt as _Attempt
            from django.db.models import Count as _Count
            section_ids = list(sections.values_list("id", flat=True))
            quizzes_by_section = {
                q.section_id: q
                for q in _Quiz.objects.filter(
                    course=course,
                    section_id__in=section_ids,
                    is_active=True,
                ).annotate(_qcount=_Count("questions"))
            }
            # Meilleure tentative par quiz pour le user courant
            best_attempts = {}
            if quizzes_by_section:
                for a in (
                    _Attempt.objects
                    .filter(
                        user=request.user,
                        quiz_id__in=[q.id for q in quizzes_by_section.values()],
                        submitted_at__isnull=False,
                    )
                    .order_by("quiz_id", "-score_percent")
                ):
                    if a.quiz_id not in best_attempts:
                        best_attempts[a.quiz_id] = a
        except Exception:
            quizzes_by_section = {}
            best_attempts = {}

        payload_sections = []
        for s in sections:
            s_lessons = []
            for lesson in s.lessons.all().order_by("order"):
                p = prog.get(lesson.id)
                s_lessons.append({
                    "id": lesson.id,
                    "title": lesson.title,
                    "lesson_type": lesson.lesson_type,
                    "type": lesson.lesson_type,
                    "duration_sec": lesson.duration_sec,
                    "duration_seconds": lesson.duration_sec,
                    "is_preview": bool(lesson.is_preview),
                    "progress_percent": int((p.progress_percent if p else 0) or 0),
                    "percent": int((p.progress_percent if p else 0) or 0),
                    "completed": bool(p.completed) if p else False,
                    "is_completed": bool(p.completed) if p else False,
                })

            # R19.6 — payload quiz de la section (ou null si aucun)
            quiz_payload = None
            q = quizzes_by_section.get(s.id)
            if q:
                total_attempts = _Attempt.objects.filter(
                    user=request.user, quiz=q, submitted_at__isnull=False,
                ).count()
                best = best_attempts.get(q.id)
                quiz_payload = {
                    "id": q.id,
                    "title": q.title,
                    "passing_score": q.passing_score,
                    "max_attempts": q.max_attempts,
                    "questions_count": getattr(q, "_qcount", 0),
                    "attempts_count": total_attempts,
                    "attempts_remaining": max(0, q.max_attempts - total_attempts),
                    "best_score": int(best.score_percent) if best else 0,
                    "passed": bool(best.passed) if best else False,
                }

            payload_sections.append({
                "id": s.id,
                "title": s.title,
                "order": s.order,
                "lessons": s_lessons,
                "quiz": quiz_payload,  # R19.6
            })

        return Response({
            "course": {"id": course.id, "title": course.title},
            "current_lesson_id": current_lesson.id if current_lesson else None,
            "sections": payload_sections
        })


# --------------------------------------------
# /api/learner/media/<uuid>/signed/
# --------------------------------------------
class LearnerMediaSignedGetView(LearnerBaseAPIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, asset_id):
        asset = get_object_or_404(MediaAsset, id=asset_id)

        lesson = Lesson.objects.filter(media_asset=asset).select_related("section__course").first()
        if not lesson:
            return Response({"detail": "Asset non attaché à une leçon."}, status=status.HTTP_404_NOT_FOUND)

        course = lesson.section.course
        if not policies.can_view_course(request.user, course):
            return Response({"detail": "Cours non disponible."}, status=status.HTTP_403_FORBIDDEN)
        enrollment = _get_enrollment(request.user, course)
        if not enrollment and not lesson.is_preview:
            return Response({"detail": "Inscription requise."}, status=status.HTTP_403_FORBIDDEN)
        if not enrollment and lesson.is_preview and getattr(course, "company_only", False):
            return Response({"detail": "Inscription requise."}, status=status.HTTP_403_FORBIDDEN)

        bucket = getattr(settings, "MINIO_BUCKET", None)
        if not bucket:
            return Response({"detail": "MINIO_BUCKET non configuré."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        client = s3_public_client()

        url = client.generate_presigned_url(
            ClientMethod="get_object",
            Params={"Bucket": bucket, "Key": asset.effective_object_key},
            ExpiresIn=SIGNED_READ_TTL_SECONDS,
        )
        return Response({"url": url})
