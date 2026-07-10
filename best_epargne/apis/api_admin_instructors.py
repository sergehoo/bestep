"""
best_epargne/apis/api_admin_instructors.py — R30.1

Endpoint admin pour lister et superviser les formateurs plateforme.

    GET /api/admin/instructors/[?q=X&verified=true&page=1]

Réservé ``is_platform_admin``. Enrichit chaque instructeur avec :
    - nb cours publiés
    - nb apprenants distincts inscrits à ses cours
    - note moyenne pondérée par les avis reçus
    - payout_percent (commission versée)
    - statut de validation (is_verified)
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db.models import Avg, Count, Q, Sum, F, DecimalField
from django.db.models.functions import Coalesce
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView


User = get_user_model()


class _InstructorSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    email = serializers.EmailField()
    full_name = serializers.CharField()
    phone = serializers.CharField(allow_blank=True)
    avatar_url = serializers.CharField(allow_null=True)
    date_joined = serializers.DateTimeField()
    last_login = serializers.DateTimeField(allow_null=True)
    is_active = serializers.BooleanField()

    # Profile
    headline = serializers.CharField(allow_blank=True)
    bio = serializers.CharField(allow_blank=True)
    is_verified = serializers.BooleanField()
    payout_percent = serializers.DecimalField(max_digits=5, decimal_places=2)

    # Stats agrégées
    published_courses = serializers.IntegerField()
    total_courses = serializers.IntegerField()
    total_enrollments = serializers.IntegerField()
    avg_rating = serializers.FloatField(allow_null=True)
    rating_count = serializers.IntegerField()


class _Pagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100


class AdminInstructorsListView(APIView):
    """Liste paginée + filtres des formateurs plateforme."""

    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Admin — formateurs plateforme")
    def get(self, request):
        if not getattr(request.user, "is_platform_admin", False):
            return Response(
                {"detail": "Réservé aux administrateurs plateforme."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Base : users qui ont un InstructorProfile
        qs = (
            User.objects.filter(instructor_profile__isnull=False)
            .select_related("instructor_profile")
            .annotate(
                # Total cours créés
                total_courses=Count("instructor_courses", distinct=True),
                # Cours publiés uniquement
                published_courses=Count(
                    "instructor_courses",
                    filter=Q(instructor_courses__status="PUBLISHED"),
                    distinct=True,
                ),
                # Total inscriptions sur les cours de l'instructeur
                total_enrollments=Count(
                    "instructor_courses__enrollments",
                    distinct=True,
                ),
                # Note moyenne pondérée sur les cours publiés
                avg_rating=Coalesce(
                    Avg(
                        "instructor_courses__reviews__rating",
                        filter=Q(instructor_courses__status="PUBLISHED"),
                    ),
                    None,
                ),
                # Nombre d'avis reçus
                rating_count=Count(
                    "instructor_courses__reviews",
                    filter=Q(instructor_courses__status="PUBLISHED"),
                    distinct=True,
                ),
            )
            .order_by("-date_joined")
        )

        # Filtres
        q = request.query_params.get("q")
        if q:
            qs = qs.filter(
                Q(email__icontains=q)
                | Q(full_name__icontains=q)
                | Q(instructor_profile__headline__icontains=q)
            )

        verified = request.query_params.get("verified")
        if verified is not None and verified.lower() in ("true", "false", "1", "0"):
            is_verified = verified.lower() in ("true", "1")
            qs = qs.filter(instructor_profile__is_verified=is_verified)

        active = request.query_params.get("active")
        if active is not None and active.lower() in ("true", "false", "1", "0"):
            is_active = active.lower() in ("true", "1")
            qs = qs.filter(is_active=is_active)

        paginator = _Pagination()
        page = paginator.paginate_queryset(qs, request, view=self)

        # Sérialisation manuelle pour joindre les annotations + profile
        results = []
        for u in page:
            profile = getattr(u, "instructor_profile", None)
            avatar_url = None
            try:
                if u.avatar and hasattr(u.avatar, "url"):
                    avatar_url = request.build_absolute_uri(u.avatar.url)
            except Exception:
                avatar_url = None
            results.append(
                {
                    "id": u.id,
                    "email": u.email,
                    "full_name": getattr(u, "full_name", "") or "",
                    "phone": getattr(u, "phone", "") or "",
                    "avatar_url": avatar_url,
                    "date_joined": u.date_joined,
                    "last_login": u.last_login,
                    "is_active": u.is_active,
                    "headline": getattr(profile, "headline", "") if profile else "",
                    "bio": getattr(profile, "bio", "") if profile else "",
                    "is_verified": bool(getattr(profile, "is_verified", False)),
                    "payout_percent": getattr(profile, "payout_percent", 0),
                    "published_courses": u.published_courses or 0,
                    "total_courses": u.total_courses or 0,
                    "total_enrollments": u.total_enrollments or 0,
                    "avg_rating": float(u.avg_rating) if u.avg_rating else None,
                    "rating_count": u.rating_count or 0,
                }
            )

        # Stats globales (utiles pour le header)
        aggregated = {
            "total": qs.count(),
            "verified": qs.filter(instructor_profile__is_verified=True).count(),
            "active": qs.filter(is_active=True).count(),
        }

        ser = _InstructorSerializer(results, many=True)
        response = paginator.get_paginated_response(ser.data)
        response.data["aggregated"] = aggregated
        return response
