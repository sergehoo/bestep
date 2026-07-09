"""
best_epargne/apis/api_public.py — R2.1 : Endpoints publics unifiés pour SPA.

Namespace ``/api/public/*`` cohérent (au lieu de l'ancien
``/landinghome/api/public/...`` éclaté sur plusieurs chemins).

Endpoints exposés :

    GET  /api/public/courses/                     Liste paginée + filtres
    GET  /api/public/courses/<slug>/              Détail + sections + leçons
    GET  /api/public/courses/<slug>/lessons/<id>/ Leçon si is_preview=True
    GET  /api/public/categories/                  Catégories avec cours publiés

Tous ces endpoints sont **AllowAny** (accessibles sans authentification)
mais ne renvoient que les cours ``status=PUBLISHED`` (source de vérité :
``get_visible_courses_qs(public_only=True)``).

Réutilise :
  - ``catalog.services.get_visible_courses_qs``
  - ``catalog.querysets.for_public_listing`` / ``for_course_detail``
"""
from __future__ import annotations

from django.db.models import Q
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from catalog.models import Category, Course, Lesson
from catalog.querysets import for_course_detail, for_public_listing
from catalog.services import get_visible_courses_qs


# ─────────────────────────────────────────────────────────────────────
# Serializers (dédiés au public, pas de fuite d'info interne)
# ─────────────────────────────────────────────────────────────────────

class PublicInstructorSerializer(serializers.Serializer):
    """Sous-set des infos formateur exposées publiquement.

    R10 : enrichi avec bio, job_title et stats (nombre de cours publiés,
    étudiants totaux, note moyenne). Ces stats sont calculées à la volée
    depuis les tables Course + Enrollment + Review ; les jeux de données
    étant petits (formateur ~ dizaines de cours max), pas de N+1
    dramatique. Cache 5 min recommandé côté vue si besoin.
    """
    id = serializers.IntegerField()
    full_name = serializers.CharField()
    avatar_url = serializers.SerializerMethodField()
    # R10
    bio = serializers.SerializerMethodField()
    job_title = serializers.SerializerMethodField()
    courses_count = serializers.SerializerMethodField()
    students_count = serializers.SerializerMethodField()
    avg_rating = serializers.SerializerMethodField()

    def get_avatar_url(self, obj):
        try:
            return obj.avatar.url if obj.avatar else None
        except Exception:
            return None

    def get_bio(self, obj):
        # InstructorProfile.bio si dispo, sinon empty (n'inclut pas les
        # bios "learner" par prudence).
        try:
            prof = getattr(obj, "instructor_profile", None)
            if prof and getattr(prof, "bio", None):
                return prof.bio
        except Exception:
            pass
        return ""

    def get_job_title(self, obj):
        try:
            prof = getattr(obj, "instructor_profile", None)
            if prof and getattr(prof, "job_title", None):
                return prof.job_title
        except Exception:
            pass
        return ""

    def get_courses_count(self, obj):
        try:
            from catalog.models import Course
            return Course.objects.filter(
                instructor=obj, status=Course.Status.PUBLISHED
            ).count()
        except Exception:
            return 0

    def get_students_count(self, obj):
        try:
            from enrollments.models import Enrollment
            return Enrollment.objects.filter(course__instructor=obj).count()
        except Exception:
            return 0

    def get_avg_rating(self, obj):
        try:
            from django.db.models import Avg
            from reviews.models import CourseReview
            r = CourseReview.objects.filter(
                course__instructor=obj, is_public=True
            ).aggregate(v=Avg("rating"))["v"]
            return round(float(r or 0), 2)
        except Exception:
            return 0.0


class PublicCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "slug"]


class PublicCourseListSerializer(serializers.ModelSerializer):
    """Cours en LISTE (allégé, pour catalogue)."""

    thumbnail_url = serializers.SerializerMethodField()
    category = PublicCategorySerializer(read_only=True)
    instructor = PublicInstructorSerializer(read_only=True)
    enrolled_count = serializers.IntegerField(read_only=True, default=0)
    rating_avg = serializers.DecimalField(
        max_digits=5, decimal_places=2, read_only=True, default=0
    )
    rating_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Course
        fields = [
            "id",
            "title",
            "slug",
            "subtitle",
            "thumbnail_url",
            "category",
            "instructor",
            "course_type",
            "pricing_type",
            "price",
            "currency",
            "published_at",
            "enrolled_count",
            "rating_avg",
            "rating_count",
            # R10
            "level",
            "language",
            "old_price",
            "promotion_until",
        ]

    def get_thumbnail_url(self, obj):
        try:
            return obj.thumbnail.url if obj.thumbnail else None
        except Exception:
            return None


class PublicLessonSerializer(serializers.ModelSerializer):
    """Leçon exposée publiquement (uniquement si is_preview=True)."""

    class Meta:
        model = Lesson
        fields = [
            "id",
            "title",
            "order",
            "lesson_type",
            "is_preview",
            "duration_sec",
        ]


class PublicCourseSectionSerializer(serializers.Serializer):
    """Section avec ses leçons (metadata + preview flags)."""
    id = serializers.IntegerField()
    title = serializers.CharField()
    order = serializers.IntegerField()
    lessons = PublicLessonSerializer(many=True, read_only=True)


class PublicCourseDetailSerializer(serializers.ModelSerializer):
    """Cours en DÉTAIL : structure complète + preview des leçons gratuites."""

    thumbnail_url = serializers.SerializerMethodField()
    preview_video_url = serializers.URLField(read_only=True)
    category = PublicCategorySerializer(read_only=True)
    instructor = PublicInstructorSerializer(read_only=True)
    enrolled_count = serializers.IntegerField(read_only=True, default=0)
    rating_avg = serializers.DecimalField(
        max_digits=5, decimal_places=2, read_only=True, default=0
    )
    rating_count = serializers.IntegerField(read_only=True, default=0)
    sections = serializers.SerializerMethodField()
    sections_count = serializers.IntegerField(read_only=True, default=0)
    lessons_count = serializers.IntegerField(read_only=True, default=0)
    total_duration_sec = serializers.SerializerMethodField()

    class Meta:
        model = Course
        fields = [
            "id",
            "title",
            "slug",
            "subtitle",
            "description",
            "thumbnail_url",
            "preview_video_url",
            "category",
            "instructor",
            "course_type",
            "pricing_type",
            "price",
            "currency",
            "published_at",
            "enrolled_count",
            "rating_avg",
            "rating_count",
            "sections",
            "sections_count",
            "lessons_count",
            "total_duration_sec",
            # R10
            "level",
            "language",
            "old_price",
            "promotion_until",
            "updated_at",
        ]

    def get_thumbnail_url(self, obj):
        try:
            return obj.thumbnail.url if obj.thumbnail else None
        except Exception:
            return None

    def get_sections(self, obj):
        sections = []
        for section in obj.sections.all():
            sections.append({
                "id": section.id,
                "title": section.title,
                "order": section.order,
                "lessons": PublicLessonSerializer(
                    section.lessons.all(), many=True
                ).data,
            })
        return sections

    def get_total_duration_sec(self, obj):
        total = 0
        for section in obj.sections.all():
            for lesson in section.lessons.all():
                total += lesson.duration_sec or 0
        return total


# ─────────────────────────────────────────────────────────────────────
# Pagination custom (12 par défaut, comme le catalogue Django)
# ─────────────────────────────────────────────────────────────────────

class PublicCoursePagination(PageNumberPagination):
    page_size = 12
    page_size_query_param = "page_size"
    max_page_size = 48


# ─────────────────────────────────────────────────────────────────────
# Views
# ─────────────────────────────────────────────────────────────────────

class PublicCourseListView(APIView):
    """
    GET /api/public/courses/ — Liste paginée des cours publiés.

    Query params :
      - q : recherche fulltext (title + subtitle)
      - category : slug de catégorie
      - course_type : CERTIFIANTE | PROFESSIONNELLE | ACADEMIQUE
      - pricing : FREE | PAID | HYBRID
      - sort : recent (défaut) | popular | price_asc | price_desc
      - page : numéro de page (défaut 1)
      - page_size : items par page (défaut 12, max 48)
    """
    permission_classes = [AllowAny]

    @extend_schema(
        summary="Liste publique des cours",
        parameters=[
            OpenApiParameter("q", str, description="Recherche fulltext"),
            OpenApiParameter("category", str, description="Slug de catégorie"),
            OpenApiParameter(
                "course_type", str,
                description="CERTIFIANTE | PROFESSIONNELLE | ACADEMIQUE",
            ),
            OpenApiParameter("pricing", str, description="FREE | PAID | HYBRID"),
            OpenApiParameter(
                "sort", str,
                description="recent (default) | popular | price_asc | price_desc",
            ),
        ],
        responses=PublicCourseListSerializer(many=True),
    )
    def get(self, request):
        q = (request.query_params.get("q") or "").strip()
        category_slug = (request.query_params.get("category") or "").strip()
        course_type = (request.query_params.get("course_type") or "").strip().upper()
        pricing = (request.query_params.get("pricing") or "").strip().upper()
        sort = (request.query_params.get("sort") or "recent").strip().lower()

        qs = get_visible_courses_qs(
            request.user,
            public_only=True,
            base_qs=for_public_listing(Course.objects.all()),
        )

        if q:
            qs = qs.filter(Q(title__icontains=q) | Q(subtitle__icontains=q))
        if category_slug:
            qs = qs.filter(category__slug=category_slug)
        if course_type in ("CERTIFIANTE", "PROFESSIONNELLE", "ACADEMIQUE"):
            qs = qs.filter(course_type=course_type)
        if pricing in ("FREE", "PAID", "HYBRID"):
            qs = qs.filter(pricing_type=pricing)

        # Sort
        if sort == "popular":
            qs = qs.order_by("-enrolled_count", "-published_at")
        elif sort == "price_asc":
            qs = qs.order_by("price", "-published_at")
        elif sort == "price_desc":
            qs = qs.order_by("-price", "-published_at")
        else:
            qs = qs.order_by("-published_at", "-id")

        paginator = PublicCoursePagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        serializer = PublicCourseListSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class PublicCourseDetailView(APIView):
    """
    GET /api/public/courses/<slug>/ — Détail d'un cours publié avec sections.

    Contrat :
      - 200 : détail complet (courses + sections + lessons preview)
      - 404 : cours non publié / inexistant / company_only
    """
    permission_classes = [AllowAny]

    @extend_schema(
        summary="Détail d'un cours public",
        responses={200: PublicCourseDetailSerializer, 404: None},
    )
    def get(self, request, slug: str):
        qs = for_course_detail(
            get_visible_courses_qs(request.user, public_only=True),
            user=request.user,
        )
        course = get_object_or_404(qs, slug=slug)
        return Response(PublicCourseDetailSerializer(course).data)


class PublicCategoryListView(APIView):
    """
    GET /api/public/categories/ — Catégories qui ont au moins 1 cours publié.

    Utile pour hydrater les filtres du catalogue React sans afficher les
    catégories vides.
    """
    permission_classes = [AllowAny]

    @extend_schema(summary="Catégories avec cours publiés")
    def get(self, request):
        # Sous-requête : catégories référencées par au moins 1 cours PUBLISHED
        # dans le scope visibility_public.
        public_qs = get_visible_courses_qs(request.user, public_only=True)
        categories = (
            Category.objects.filter(courses__in=public_qs.values("id"))
            .distinct()
            .order_by("name")
            .only("id", "name", "slug")
        )
        return Response(PublicCategorySerializer(categories, many=True).data)


class PublicCoursePreviewLessonView(APIView):
    """
    GET /api/public/courses/<slug>/lessons/<lesson_id>/preview/

    Retourne le contenu d'une leçon UNIQUEMENT si ``is_preview=True``.
    Sinon → 403. Utile pour le "essayez avant de payer" côté landing.
    """
    permission_classes = [AllowAny]

    @extend_schema(summary="Preview d'une leçon gratuite d'un cours public")
    def get(self, request, slug: str, lesson_id: int):
        course = get_object_or_404(
            get_visible_courses_qs(request.user, public_only=True),
            slug=slug,
        )
        try:
            lesson = Lesson.objects.select_related("section").get(
                pk=lesson_id, section__course=course
            )
        except Lesson.DoesNotExist:
            return Response(
                {"detail": "Leçon introuvable."}, status=status.HTTP_404_NOT_FOUND
            )
        if not lesson.is_preview:
            return Response(
                {"detail": "Cette leçon nécessite une inscription."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return Response({
            "id": lesson.id,
            "title": lesson.title,
            "lesson_type": lesson.lesson_type,
            "duration_sec": lesson.duration_sec,
            "content": lesson.content,
            "video_url": lesson.video_url,
        })


# ═════════════════════════════════════════════════════════════════════
# R4 — Reviews publics + related courses
# ═════════════════════════════════════════════════════════════════════


class PublicReviewSerializer(serializers.Serializer):
    """Avis exposé publiquement (auteur anonymisé sur first-name seulement)."""
    id = serializers.IntegerField()
    rating = serializers.IntegerField()
    comment = serializers.CharField()
    user_name = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField()

    def get_user_name(self, obj):
        u = obj.user
        full = (u.get_full_name() or "").strip() if hasattr(u, "get_full_name") else ""
        if full:
            return full
        email = getattr(u, "email", "") or ""
        return email.split("@")[0] if email else "Apprenant"


class PublicCourseReviewsView(APIView):
    """
    GET /api/public/courses/<slug>/reviews/
    Liste paginée des avis publics d'un cours PUBLISHED.

    Query params :
      - ordering : recent (défaut) | rating_high | rating_low
      - page, page_size (max 20)
    """
    permission_classes = [AllowAny]

    @extend_schema(
        summary="Avis publics d'un cours",
        parameters=[
            OpenApiParameter("ordering", str,
                             description="recent | rating_high | rating_low"),
        ],
    )
    def get(self, request, slug: str):
        # Vérifie que le cours est visible publiquement.
        course = get_object_or_404(
            get_visible_courses_qs(request.user, public_only=True),
            slug=slug,
        )
        try:
            from reviews.models import CourseReview
        except Exception:
            return Response({"count": 0, "results": [], "next": None, "previous": None})

        qs = (
            CourseReview.objects.filter(course=course, is_public=True)
            .select_related("user")
        )

        ordering = (request.query_params.get("ordering") or "recent").lower()
        if ordering == "rating_high":
            qs = qs.order_by("-rating", "-created_at")
        elif ordering == "rating_low":
            qs = qs.order_by("rating", "-created_at")
        else:
            qs = qs.order_by("-created_at")

        paginator = PageNumberPagination()
        paginator.page_size = 10
        paginator.page_size_query_param = "page_size"
        paginator.max_page_size = 20
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response(
            PublicReviewSerializer(page, many=True).data
        )


class PublicCourseReviewsSummaryView(APIView):
    """
    GET /api/public/courses/<slug>/reviews/summary/
    Agrégat des reviews : moyenne + total + distribution 1-5 étoiles.
    Utile pour la barre "4,7 / 5 (89 avis)" + la distribution graphique.
    """
    permission_classes = [AllowAny]

    @extend_schema(summary="Résumé statistique des avis d'un cours")
    def get(self, request, slug: str):
        from django.db.models import Avg, Count

        course = get_object_or_404(
            get_visible_courses_qs(request.user, public_only=True),
            slug=slug,
        )
        try:
            from reviews.models import CourseReview
        except Exception:
            return Response({
                "average": 0, "count": 0,
                "distribution": {"1": 0, "2": 0, "3": 0, "4": 0, "5": 0},
            })

        base = CourseReview.objects.filter(course=course, is_public=True)
        agg = base.aggregate(avg=Avg("rating"), count=Count("id"))
        dist_rows = base.values("rating").annotate(c=Count("id"))
        dist = {str(i): 0 for i in range(1, 6)}
        for row in dist_rows:
            dist[str(int(row["rating"]))] = int(row["c"])

        return Response({
            "average": round(float(agg["avg"] or 0), 2),
            "count": int(agg["count"] or 0),
            "distribution": dist,
        })


class PublicRelatedCoursesView(APIView):
    """
    GET /api/public/courses/<slug>/related/
    Cours "vous aimerez peut-être" : même catégorie, exclus le cours courant.
    Fallback : cours les plus populaires si pas de catégorie.
    """
    permission_classes = [AllowAny]

    @extend_schema(
        summary="Cours similaires (même catégorie)",
        responses=PublicCourseListSerializer(many=True),
    )
    def get(self, request, slug: str):
        course = get_object_or_404(
            get_visible_courses_qs(request.user, public_only=True),
            slug=slug,
        )
        qs = get_visible_courses_qs(
            request.user, public_only=True,
            base_qs=for_public_listing(Course.objects.all()),
        ).exclude(pk=course.pk)

        if course.category_id:
            qs = qs.filter(category_id=course.category_id)

        items = list(qs.order_by("-enrolled_count", "-published_at")[:6])
        # Fallback : cours populaires globaux si aucun de la même catégorie.
        if not items:
            items = list(
                get_visible_courses_qs(
                    request.user, public_only=True,
                    base_qs=for_public_listing(Course.objects.all()),
                )
                .exclude(pk=course.pk)
                .order_by("-enrolled_count", "-published_at")[:6]
            )
        return Response(PublicCourseListSerializer(items, many=True).data)
