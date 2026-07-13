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
                total_courses=Count("courses_created", distinct=True),
                # Cours publiés uniquement
                published_courses=Count(
                    "courses_created",
                    filter=Q(courses_created__status="PUBLISHED"),
                    distinct=True,
                ),
                # Total inscriptions sur les cours de l'instructeur
                total_enrollments=Count(
                    "courses_created__enrollments",
                    distinct=True,
                ),
                # Note moyenne pondérée sur les cours publiés
                avg_rating=Coalesce(
                    Avg(
                        "courses_created__reviews__rating",
                        filter=Q(courses_created__status="PUBLISHED"),
                    ),
                    None,
                ),
                # Nombre d'avis reçus
                rating_count=Count(
                    "courses_created__reviews",
                    filter=Q(courses_created__status="PUBLISHED"),
                    distinct=True,
                ),
            )
            # Note : le User custom utilise ``created_at`` (pas ``date_joined``).
            .order_by("-created_at")
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
                    # User custom : ``created_at`` (pas ``date_joined``).
                    # On garde le nom API ``date_joined`` pour compat.
                    "date_joined": u.created_at,
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


# ─────────────────────────────────────────────────────────────
# Approve / Reject formateur (SECURITE-06)
# ─────────────────────────────────────────────────────────────


def _forbidden_admin():
    return Response(
        {
            "detail": "Réservé aux administrateurs plateforme.",
            "code": "ROLE_FORBIDDEN",
        },
        status=status.HTTP_403_FORBIDDEN,
    )


def _send_status_email(user, approved: bool, reason: str = "") -> None:
    """SECURITE-06 — Envoi HTML + texte via EmailMultiAlternatives."""
    from django.conf import settings
    from django.core.mail import EmailMultiAlternatives
    from django.template.loader import render_to_string

    subject = (
        "Votre compte formateur est validé — Best-Épargne"
        if approved else "Votre demande de compte formateur — Best-Épargne"
    )
    frontend_base = (
        getattr(settings, "FRONTEND_BASE_URL", "") or ""
    ).rstrip("/")
    ctx = {
        "user": user,
        "user_name": user.full_name,
        "reason": reason,
        "frontend_base": frontend_base,
    }
    tpl_name = "instructor_approved" if approved else "instructor_rejected"
    text_body = render_to_string(f"emails/security/{tpl_name}.txt", ctx)
    html_body = render_to_string(f"emails/security/{tpl_name}.html", ctx)
    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "no-reply@best-epargne.local")
    try:
        msg = EmailMultiAlternatives(subject, text_body, from_email, [user.email])
        msg.attach_alternative(html_body, "text/html")
        msg.send(fail_silently=True)
    except Exception:
        pass


class AdminInstructorHistoryView(APIView):
    """GET /api/admin/instructors/history/ — 50 dernières décisions.

    Traçabilité des approbations et rejets formateur (SECURITE-06).
    Lit ``AIAuditLog`` avec ``kind`` dans {INSTRUCTOR_APPROVED,
    INSTRUCTOR_REJECTED, EMAIL_FORCE_VERIFIED}. Chaque entrée renvoie
    la cible (target_user_id + target_email), l'admin auteur, la date
    et la raison éventuelle.
    """
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Admin — Historique des décisions formateur")
    def get(self, request):
        if not getattr(request.user, "is_platform_admin", False):
            return _forbidden_admin()
        try:
            from ai.models import AIAuditLog
        except Exception:
            return Response({"events": []})
        qs = AIAuditLog.objects.filter(
            kind__in=[
                "INSTRUCTOR_APPROVED",
                "INSTRUCTOR_REJECTED",
                "EMAIL_FORCE_VERIFIED",
            ],
        ).select_related("user").order_by("-created_at")[:50]
        events = []
        for row in qs:
            payload = row.payload or {}
            events.append({
                "id": row.id,
                "kind": row.kind,
                "created_at": row.created_at.isoformat(),
                "admin": {
                    "id": row.user_id,
                    "email": row.user.email if row.user else None,
                },
                "target": {
                    "user_id": payload.get("target_user_id"),
                    "email": payload.get("target_email"),
                },
                "reason": payload.get("reason") or "",
            })
        return Response({"events": events, "total": len(events)})


class AdminInstructorPendingCountView(APIView):
    """GET /api/admin/instructors/pending-count/ — Compte des formateurs
    en attente de validation. Utilisé pour un badge dans la nav admin.
    """
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Admin — Compteur formateurs en attente")
    def get(self, request):
        if not getattr(request.user, "is_platform_admin", False):
            return _forbidden_admin()
        count = User.objects.filter(
            instructor_profile__isnull=False,
            instructor_profile__is_verified=False,
            is_active=True,
        ).count()
        return Response({"pending_count": count})


class AdminInstructorApproveView(APIView):
    """POST /api/admin/instructors/<pk>/approve/ — Marque le formateur validé.

    Effet :
        - InstructorProfile.is_verified = True
        - email de confirmation (best-effort)
        - AIAuditLog (si dispo) pour traçabilité
    """
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Admin — Approuver un formateur")
    def post(self, request, pk: int):
        if not getattr(request.user, "is_platform_admin", False):
            return _forbidden_admin()
        try:
            user = User.objects.select_related("instructor_profile").get(pk=pk)
        except User.DoesNotExist:
            return Response(
                {"detail": "Formateur introuvable.", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )
        profile = getattr(user, "instructor_profile", None)
        if profile is None:
            return Response(
                {
                    "detail": "Cet utilisateur n'a pas de profil formateur.",
                    "code": "NOT_INSTRUCTOR",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if profile.is_verified:
            return Response(
                {"detail": "Formateur déjà validé.", "code": "ALREADY_APPROVED"},
                status=status.HTTP_200_OK,
            )
        profile.is_verified = True
        profile.save(update_fields=["is_verified"])
        _send_status_email(user, approved=True)
        # Journalisation best-effort — pas de dépendance dure au module IA.
        try:
            from ai.models import AIAuditLog
            AIAuditLog.objects.create(
                user=request.user,
                kind="INSTRUCTOR_APPROVED",
                payload={"target_user_id": user.id, "target_email": user.email},
            )
        except Exception:
            pass
        return Response(
            {
                "detail": "Formateur approuvé.",
                "user_id": user.id,
                "is_verified": True,
            },
            status=status.HTTP_200_OK,
        )


class AdminInstructorRejectView(APIView):
    """POST /api/admin/instructors/<pk>/reject/ — Refuse (soft) un formateur.

    N'efface pas le profil. Marque simplement ``is_verified=False`` et
    envoie un e-mail explicatif. Une raison optionnelle est acceptée.
    """
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Admin — Refuser un formateur")
    def post(self, request, pk: int):
        if not getattr(request.user, "is_platform_admin", False):
            return _forbidden_admin()
        try:
            user = User.objects.select_related("instructor_profile").get(pk=pk)
        except User.DoesNotExist:
            return Response(
                {"detail": "Formateur introuvable.", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )
        profile = getattr(user, "instructor_profile", None)
        if profile is None:
            return Response(
                {
                    "detail": "Cet utilisateur n'a pas de profil formateur.",
                    "code": "NOT_INSTRUCTOR",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        reason = (request.data.get("reason") or "").strip()[:500]
        profile.is_verified = False
        profile.save(update_fields=["is_verified"])
        _send_status_email(user, approved=False, reason=reason)
        try:
            from ai.models import AIAuditLog
            AIAuditLog.objects.create(
                user=request.user,
                kind="INSTRUCTOR_REJECTED",
                payload={
                    "target_user_id": user.id,
                    "target_email": user.email,
                    "reason": reason,
                },
            )
        except Exception:
            pass
        return Response(
            {
                "detail": "Formateur refusé.",
                "user_id": user.id,
                "is_verified": False,
                "reason": reason,
            },
            status=status.HTTP_200_OK,
        )
