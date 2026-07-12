"""
best_epargne/apis/api_admin.py — R7 + R47 : endpoints admin plateforme.

Endpoints exposés (tous restreints à ``is_platform_admin``) :

    GET    /api/admin/users/            Liste paginée + filtres
    POST   /api/admin/users/            Création utilisateur (R47)
    GET    /api/admin/users/<id>/       Détail user
    PATCH  /api/admin/users/<id>/       Update ciblé (is_active, platform_role, full_name, phone)
    POST   /api/admin/users/<id>/reset-password/  Génère un lien de reset
    GET    /api/admin/config/           Info runtime (branding, feature flags)

Design :
- Auth JWT + ``platform_admin_required`` bypass.
- Aucune donnée sensible sortie (hash password jamais serialisé).
- Update strict : whitelisté à un petit set de champs modifiables.
- Création : le rôle sélectionné crée automatiquement le profil relié
  (InstructorProfile / LearnerProfile). Mot de passe optionnel — si
  absent, un mot de passe temporaire est généré et renvoyé une seule
  fois dans la réponse (l'admin doit le communiquer via un canal sûr).
"""
from __future__ import annotations

import secrets
import string
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from compte.models import InstructorProfile, LearnerProfile
from core.decorators import platform_admin_required

User = get_user_model()


def _generate_temp_password(length: int = 14) -> str:
    """Génère un mot de passe temporaire cryptographiquement solide."""
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    while True:
        pw = "".join(secrets.choice(alphabet) for _ in range(length))
        # Politique minimale : au moins 1 minuscule + 1 majuscule + 1 chiffre.
        if (
            any(c.islower() for c in pw)
            and any(c.isupper() for c in pw)
            and any(c.isdigit() for c in pw)
        ):
            return pw


# ─────────────────────────────────────────────────────────────────────
# Serializers
# ─────────────────────────────────────────────────────────────────────


class AdminUserListSerializer(serializers.Serializer):
    """Version compacte pour la liste."""

    id = serializers.IntegerField()
    email = serializers.CharField()
    full_name = serializers.CharField()
    phone = serializers.CharField()
    is_active = serializers.BooleanField()
    platform_role = serializers.CharField()
    is_platform_admin = serializers.BooleanField()
    is_instructor = serializers.BooleanField()
    is_learner = serializers.BooleanField()
    has_organization = serializers.BooleanField()
    date_joined = serializers.SerializerMethodField()
    last_login = serializers.DateTimeField(allow_null=True)

    def get_date_joined(self, obj):
        return getattr(obj, "created_at", None) or getattr(obj, "date_joined", None)


class AdminUserDetailSerializer(AdminUserListSerializer):
    """Détail : ajoute stats + memberships."""

    memberships = serializers.SerializerMethodField()
    enrollments_count = serializers.IntegerField(read_only=True)
    courses_created_count = serializers.IntegerField(read_only=True)

    def get_memberships(self, obj):
        cache = getattr(obj, "_active_memberships_cache", None) or []
        return [
            {
                "organization_id": m["organization_id"],
                "role": m["role"],
            }
            for m in cache
        ]


class AdminUserUpdateSerializer(serializers.Serializer):
    """
    Champs modifiables via PATCH. Volontairement restrictif :
    - is_active : désactivation d'un compte
    - platform_role : promotion / rétrogradation admin plateforme
    - full_name / phone : correction admin (support)
    """

    is_active = serializers.BooleanField(required=False)
    platform_role = serializers.ChoiceField(
        choices=["USER", "PLATFORM_ADMIN"], required=False
    )
    full_name = serializers.CharField(required=False, allow_blank=True, max_length=160)
    phone = serializers.CharField(required=False, allow_blank=True, max_length=30)


class AdminUserCreateSerializer(serializers.Serializer):
    """
    Payload de création d'un utilisateur par un admin (R47).

    Le rôle sélectionné détermine les profils annexes créés :
      - ``LEARNER``     → LearnerProfile (auto)
      - ``INSTRUCTOR``  → InstructorProfile (auto, is_verified=True car
                          créé par un admin, payout par défaut)
      - ``ADMIN``       → platform_role=PLATFORM_ADMIN, is_staff=True
      - ``STAFF``       → is_staff=True (accès Django admin sans droit
                          plateforme)

    Le mot de passe est facultatif : si absent, on en génère un
    temporaire et on le renvoie **une seule fois** dans la réponse.
    """

    ROLE_CHOICES = ["LEARNER", "INSTRUCTOR", "ADMIN", "STAFF"]

    email = serializers.EmailField()
    full_name = serializers.CharField(max_length=160, allow_blank=True, required=False)
    phone = serializers.CharField(max_length=30, allow_blank=True, required=False)
    role = serializers.ChoiceField(choices=ROLE_CHOICES)
    password = serializers.CharField(
        min_length=8,
        max_length=128,
        required=False,
        allow_blank=True,
        write_only=True,
    )
    is_active = serializers.BooleanField(required=False, default=True)
    # Options instructor
    instructor_headline = serializers.CharField(
        max_length=160, required=False, allow_blank=True
    )
    instructor_bio = serializers.CharField(required=False, allow_blank=True)
    instructor_payout_percent = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False
    )
    # Options learner
    learner_job_title = serializers.CharField(
        max_length=120, required=False, allow_blank=True
    )

    def validate_email(self, value: str) -> str:
        email = value.strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError(
                "Un utilisateur avec cet email existe déjà."
            )
        return email


# ─────────────────────────────────────────────────────────────────────
# Views
# ─────────────────────────────────────────────────────────────────────


class AdminUserListView(APIView):
    """GET /api/admin/users/ — liste paginée avec filtres."""

    permission_classes = [IsAuthenticated]

    def dispatch(self, request, *args, **kwargs):
        return platform_admin_required(super().dispatch)(request, *args, **kwargs)

    @extend_schema(
        summary="Liste des utilisateurs (admin)",
        parameters=[
            OpenApiParameter("q", str, description="Email ou nom (icontains)"),
            OpenApiParameter("role", str, description="all | admin | instructor | learner"),
            OpenApiParameter("is_active", str, description="true | false"),
            OpenApiParameter("page", int),
            OpenApiParameter("page_size", int, description="max 100"),
        ],
    )
    def get(self, request):
        qs = User.objects.all()

        q = request.query_params.get("q")
        if q:
            qs = qs.filter(Q(email__icontains=q) | Q(full_name__icontains=q))

        is_active = request.query_params.get("is_active")
        if is_active in ("true", "false"):
            qs = qs.filter(is_active=(is_active == "true"))

        role = (request.query_params.get("role") or "").lower()
        if role == "admin":
            qs = qs.filter(platform_role="PLATFORM_ADMIN")
        elif role == "instructor":
            # Users qui ont un instructor_profile ou membership INSTRUCTOR
            qs = qs.filter(
                Q(instructor_profile__isnull=False)
                | Q(
                    organization_memberships__role="INSTRUCTOR",
                    organization_memberships__is_active=True,
                )
            ).distinct()
        elif role == "learner":
            qs = qs.filter(
                Q(learner_profile__isnull=False)
                | Q(
                    organization_memberships__role="LEARNER",
                    organization_memberships__is_active=True,
                )
            ).distinct()

        qs = qs.order_by("-created_at")

        paginator = PageNumberPagination()
        paginator.page_size = 20
        paginator.page_size_query_param = "page_size"
        paginator.max_page_size = 100
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response(
            AdminUserListSerializer(page, many=True).data
        )

    @extend_schema(
        summary="Créer un utilisateur (admin)",
        request=AdminUserCreateSerializer,
        responses=AdminUserDetailSerializer,
    )
    def post(self, request):
        """Créer un utilisateur avec son profil relié (R47).

        Le rôle sélectionné détermine :
          - LEARNER    → LearnerProfile
          - INSTRUCTOR → InstructorProfile (is_verified=True car créé
                          par un admin)
          - ADMIN      → platform_role=PLATFORM_ADMIN + is_staff=True
          - STAFF      → is_staff=True uniquement

        Si aucun mot de passe n'est fourni, un mot de passe temporaire
        est généré. Il est renvoyé UNE SEULE FOIS dans la réponse — à
        transmettre à l'utilisateur via un canal sûr.
        """
        s = AdminUserCreateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        data = s.validated_data

        role = data["role"]
        raw_password = (data.get("password") or "").strip()
        generated = False
        if not raw_password:
            raw_password = _generate_temp_password()
            generated = True

        # Champs User de base
        extra = {
            "full_name": (data.get("full_name") or "").strip(),
            "phone": (data.get("phone") or "").strip(),
            "is_active": bool(data.get("is_active", True)),
        }
        if role == "ADMIN":
            extra["platform_role"] = User.PlatformRole.PLATFORM_ADMIN
            extra["is_staff"] = True
        elif role == "STAFF":
            extra["platform_role"] = User.PlatformRole.USER
            extra["is_staff"] = True
        else:
            extra["platform_role"] = User.PlatformRole.USER
            extra["is_staff"] = False

        try:
            with transaction.atomic():
                user = User.objects.create_user(
                    email=data["email"],
                    password=raw_password,
                    **extra,
                )
                if role == "INSTRUCTOR":
                    InstructorProfile.objects.create(
                        user=user,
                        headline=(data.get("instructor_headline") or "").strip(),
                        bio=(data.get("instructor_bio") or "").strip(),
                        is_verified=True,
                        payout_percent=data.get(
                            "instructor_payout_percent"
                        ) or 70.00,
                    )
                elif role == "LEARNER":
                    LearnerProfile.objects.create(
                        user=user,
                        job_title=(data.get("learner_job_title") or "").strip(),
                    )
        except DjangoValidationError as exc:
            return Response(
                {"detail": "Validation échouée.", "errors": exc.message_dict
                    if hasattr(exc, "message_dict") else exc.messages},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Enrichissement pour la sérialisation détaillée
        user.enrollments_count = 0
        user.courses_created_count = 0

        payload = AdminUserDetailSerializer(user).data
        payload["created_role"] = role
        if generated:
            payload["temporary_password"] = raw_password
        return Response(payload, status=status.HTTP_201_CREATED)


class AdminUserDetailView(APIView):
    """GET/PATCH /api/admin/users/<id>/."""

    permission_classes = [IsAuthenticated]

    def dispatch(self, request, *args, **kwargs):
        return platform_admin_required(super().dispatch)(request, *args, **kwargs)

    def _get_user(self, user_id):
        try:
            u = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return None
        # Enrollments (safe : on tente le reverse-relation le plus courant)
        try:
            from enrollments.models import Enrollment
            u.enrollments_count = Enrollment.objects.filter(user=u).count()
        except Exception:
            u.enrollments_count = 0
        # Cours créés
        try:
            from catalog.models import Course
            u.courses_created_count = Course.objects.filter(instructor=u).count()
        except Exception:
            u.courses_created_count = 0
        return u

    @extend_schema(summary="Détail utilisateur (admin)")
    def get(self, request, user_id: int):
        u = self._get_user(user_id)
        if not u:
            return Response({"detail": "Introuvable."}, status=404)
        return Response(AdminUserDetailSerializer(u).data)

    @extend_schema(
        summary="Update partiel utilisateur (admin)",
        request=AdminUserUpdateSerializer,
        responses=AdminUserDetailSerializer,
    )
    def patch(self, request, user_id: int):
        u = self._get_user(user_id)
        if not u:
            return Response({"detail": "Introuvable."}, status=404)
        if u.id == request.user.id and (
            request.data.get("is_active") is False
            or request.data.get("platform_role") == "USER"
        ):
            return Response(
                {"detail": "Vous ne pouvez pas vous rétrograder ou désactiver vous-même."},
                status=400,
            )
        s = AdminUserUpdateSerializer(data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        for field, value in s.validated_data.items():
            setattr(u, field, value)
        u.save()
        return Response(AdminUserDetailSerializer(u).data)


class AdminUserResetPasswordView(APIView):
    """POST /api/admin/users/<id>/reset-password/ — génère un lien reset (support)."""

    permission_classes = [IsAuthenticated]

    def dispatch(self, request, *args, **kwargs):
        return platform_admin_required(super().dispatch)(request, *args, **kwargs)

    @extend_schema(summary="Envoie un email de reset password (admin support)")
    def post(self, request, user_id: int):
        try:
            u = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({"detail": "Introuvable."}, status=404)

        # Génère un token via le même mécanisme que /api/auth/password/reset/.
        try:
            from compte.api_auth import _issue_password_reset_token
            token = _issue_password_reset_token(u)
        except Exception:
            token = None

        return Response(
            {
                "detail": "Reset link généré.",
                "token": token,
                "expires_at": (timezone.now() + timedelta(hours=2)).isoformat()
                if token else None,
            },
            status=status.HTTP_200_OK,
        )


class AdminConfigView(APIView):
    """GET /api/admin/config/ — snapshot de la config runtime plateforme."""

    permission_classes = [IsAuthenticated]

    def dispatch(self, request, *args, **kwargs):
        return platform_admin_required(super().dispatch)(request, *args, **kwargs)

    @extend_schema(summary="Config plateforme (lecture seule)")
    def get(self, request):
        # JWT access lifetime en minutes (fallback 15)
        jwt_conf = getattr(settings, "SIMPLE_JWT", {}) or {}
        access_lt = jwt_conf.get("ACCESS_TOKEN_LIFETIME")
        access_lt_min = int(access_lt.total_seconds() // 60) if access_lt else 15

        return Response({
            "app": {
                "name": "Best Épargne",
                "environment": getattr(settings, "DJANGO_ENV", "unknown"),
                "debug": getattr(settings, "DEBUG", False),
                "timezone": getattr(settings, "TIME_ZONE", "UTC"),
                "language": getattr(settings, "LANGUAGE_CODE", "fr-fr"),
            },
            "features": {
                "jwt_enabled": True,
                "cors_enabled": bool(getattr(settings, "CORS_ALLOWED_ORIGINS", [])),
                "email_reset": True,
                "media_backend": getattr(
                    settings,
                    "DEFAULT_FILE_STORAGE",
                    "django.core.files.storage.FileSystemStorage",
                ),
            },
            "limits": {
                "jwt_access_lifetime_minutes": access_lt_min,
                "review_page_size_max": 20,
                "user_page_size_max": 100,
            },
            "counts": {
                "users_total": User.objects.count(),
                "users_active": User.objects.filter(is_active=True).count(),
                "users_admin": User.objects.filter(
                    platform_role="PLATFORM_ADMIN"
                ).count(),
            },
            "generated_at": timezone.now().isoformat(),
        })
