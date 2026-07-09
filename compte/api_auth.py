"""
compte/api_auth.py — R1 : Endpoints API auth JWT pour le SPA React.

Endpoints exposés (routes définies dans ``compte/urls_api.py``) :

    POST /api/auth/register/         — Inscription
    POST /api/auth/login/            — Login → { access, refresh, user }
    POST /api/auth/refresh/          — Renouvellement access token
    POST /api/auth/logout/           — Blacklist du refresh token
    GET  /api/auth/me/               — Profil connecté (user + preferences)
    PATCH /api/auth/me/              — Mise à jour profil (full_name, phone)
    POST /api/auth/password/change/  — Changement mot de passe (auth requise)
    POST /api/auth/password/reset/   — Demande de reset (email envoyé)
    POST /api/auth/password/reset/confirm/  — Confirmation du reset

Contrat de réponse cohérent :

    {
      "access": "<jwt>",
      "refresh": "<jwt>",
      "user": {
        "id": 42,
        "email": "user@example.com",
        "full_name": "Alice Dupont",
        "phone": "",
        "avatar_url": "https://.../avatars/xxx.jpg" | null,
        "roles": ["learner", "instructor"],
        "is_platform_admin": false,
        "preferences": { "theme": "system", "language": "fr", ... }
      }
    }

Sécurité :
- Throttling anti-brute-force via `throttle_scope` (settings.py L181-183)
- Rotation des refresh tokens + blacklist (voir SIMPLE_JWT settings)
- Passwords via `set_password` (Argon2, cf. AUTH_PASSWORD_HASHERS)
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from drf_spectacular.utils import OpenApiExample, extend_schema
from rest_framework import serializers, status
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

User = get_user_model()


# ─────────────────────────────────────────────────────────────────────
# Serializers
# ─────────────────────────────────────────────────────────────────────

class UserPreferencesSerializer(serializers.Serializer):
    """UserPreferences (P3.1) exposé à l'API — read-only sur /me/."""
    theme = serializers.CharField(read_only=True)
    language = serializers.CharField(read_only=True)
    notifications_email = serializers.BooleanField(read_only=True)
    notifications_marketing = serializers.BooleanField(read_only=True)
    notifications_course_reminders = serializers.BooleanField(read_only=True)
    public_profile = serializers.BooleanField(read_only=True)


class UserAPISerializer(serializers.ModelSerializer):
    """
    Représentation de l'utilisateur exposée à l'API React.

    Champs read-only : id, email (non modifiable via /me/), roles,
    is_platform_admin, avatar_url, preferences, dates.
    Champs writable : full_name, phone (via PATCH /me/).
    """

    avatar_url = serializers.SerializerMethodField()
    roles = serializers.SerializerMethodField()
    is_platform_admin = serializers.BooleanField(read_only=True)
    preferences = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "full_name",
            "phone",
            "avatar_url",
            "roles",
            "is_platform_admin",
            "preferences",
            "created_at",
            "last_login",
        ]
        read_only_fields = [
            "id", "email", "avatar_url", "roles",
            "is_platform_admin", "preferences", "created_at", "last_login",
        ]

    def get_avatar_url(self, obj):
        try:
            return obj.avatar.url if obj.avatar else None
        except Exception:
            return None

    def get_roles(self, obj) -> list[str]:
        roles = []
        if obj.is_platform_admin:
            roles.append("platform_admin")
        if getattr(obj, "is_instructor", False):
            roles.append("instructor")
        if getattr(obj, "is_org_admin", False):
            roles.append("org_admin")
        # Tout user authentifié est implicitement learner.
        roles.append("learner")
        return roles

    def get_preferences(self, obj):
        from compte.models import UserPreferences
        prefs = UserPreferences.get_or_create_for(obj)
        return UserPreferencesSerializer(prefs).data


class RegisterSerializer(serializers.Serializer):
    """
    Inscription : email + password + full_name (phone optionnel).

    Validations :
    - Email unique (via User.objects.create_user)
    - Password strong (Argon2 + AUTH_PASSWORD_VALIDATORS)
    - full_name >= 2 caractères
    """
    email = serializers.EmailField(required=True)
    password = serializers.CharField(
        required=True, min_length=8, write_only=True, style={"input_type": "password"}
    )
    full_name = serializers.CharField(required=True, min_length=2, max_length=160)
    phone = serializers.CharField(required=False, allow_blank=True, max_length=30)

    def validate_email(self, value):
        value = value.strip().lower()
        if User.objects.filter(email=value).exists():
            raise DRFValidationError("Un compte existe déjà avec cet email.")
        return value

    def validate_password(self, value):
        try:
            validate_password(value)
        except DjangoValidationError as e:
            raise DRFValidationError(list(e.messages))
        return value

    def create(self, validated_data):
        return User.objects.create_user(
            email=validated_data["email"],
            password=validated_data["password"],
            full_name=validated_data["full_name"],
            phone=validated_data.get("phone", ""),
        )


class TokenObtainWithClaimsSerializer(TokenObtainPairSerializer):
    """
    Login : renvoie access + refresh + user (via UserAPISerializer).

    Étend le comportement standard de simplejwt en :
    1. Ajoutant des claims custom au token (email, roles) → utile côté
       React pour ne pas re-fetch /me/ à chaque page.
    2. Renvoyant l'objet ``user`` complet dans la réponse pour hydration
       immédiate du store Zustand.
    """

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        # Claims légers embarqués dans le JWT (non chiffré, éviter les
        # infos sensibles).
        token["email"] = user.email
        token["is_platform_admin"] = user.is_platform_admin
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data["user"] = UserAPISerializer(self.user).data
        return data


class PasswordChangeSerializer(serializers.Serializer):
    current_password = serializers.CharField(
        required=True, write_only=True, style={"input_type": "password"}
    )
    new_password = serializers.CharField(
        required=True, min_length=8, write_only=True, style={"input_type": "password"}
    )

    def validate_new_password(self, value):
        try:
            validate_password(value, user=self.context.get("request").user)
        except DjangoValidationError as e:
            raise DRFValidationError(list(e.messages))
        return value


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField(required=True)
    token = serializers.CharField(required=True)
    new_password = serializers.CharField(
        required=True, min_length=8, write_only=True
    )


# ─────────────────────────────────────────────────────────────────────
# Views
# ─────────────────────────────────────────────────────────────────────

class RegisterView(APIView):
    """POST /api/auth/register/ — Inscription publique."""
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "signup"

    @extend_schema(
        request=RegisterSerializer,
        responses={201: UserAPISerializer},
        summary="Inscription",
        description="Crée un compte + connecte immédiatement (renvoie tokens + user).",
        examples=[
            OpenApiExample(
                "Inscription réussie",
                value={
                    "email": "alice@example.com",
                    "password": "MotDePasseSolide123!",
                    "full_name": "Alice Dupont",
                    "phone": "+225 07 12 34 56 78",
                },
                request_only=True,
            ),
        ],
    )
    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        # Token pair immédiat pour connexion auto post-signup.
        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "user": UserAPISerializer(user).data,
            },
            status=status.HTTP_201_CREATED,
        )


class LoginView(TokenObtainPairView):
    """POST /api/auth/login/ — Login classique email+password → tokens + user."""
    serializer_class = TokenObtainWithClaimsSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    @extend_schema(
        summary="Login",
        description="Retourne access (15min) + refresh (7j) + user complet.",
        examples=[
            OpenApiExample(
                "Login réussi",
                value={"email": "alice@example.com", "password": "MotDePasse123!"},
                request_only=True,
            ),
        ],
    )
    def post(self, request, *args, **kwargs):
        return super().post(request, *args, **kwargs)


class RefreshView(TokenRefreshView):
    """POST /api/auth/refresh/ — Renouvelle l'access token via refresh."""
    @extend_schema(
        summary="Refresh JWT",
        description="Envoie un refresh token, reçoit un nouvel access token (+ nouveau refresh via rotation).",
    )
    def post(self, request, *args, **kwargs):
        return super().post(request, *args, **kwargs)


class LogoutView(APIView):
    """POST /api/auth/logout/ — Blacklist du refresh token."""
    permission_classes = [IsAuthenticated]

    @extend_schema(
        summary="Logout",
        description="Blacklist le refresh token fourni. Les access tokens actifs restent valides jusqu'à expiration (15min max).",
        request={"application/json": {"type": "object", "properties": {"refresh": {"type": "string"}}}},
    )
    def post(self, request):
        refresh_str = request.data.get("refresh")
        if not refresh_str:
            return Response(
                {"detail": "Refresh token requis."}, status=status.HTTP_400_BAD_REQUEST
            )
        try:
            token = RefreshToken(refresh_str)
            token.blacklist()
        except Exception as e:
            return Response(
                {"detail": f"Token invalide : {e}"}, status=status.HTTP_400_BAD_REQUEST
            )
        return Response(status=status.HTTP_205_RESET_CONTENT)


class MeView(APIView):
    """GET/PATCH /api/auth/me/ — Profil de l'utilisateur connecté."""
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=UserAPISerializer, summary="Profil connecté")
    def get(self, request):
        return Response(UserAPISerializer(request.user).data)

    @extend_schema(
        request=UserAPISerializer,
        responses=UserAPISerializer,
        summary="Mise à jour profil",
        description="Champs modifiables : full_name, phone. L'email et les rôles ne sont PAS modifiables ici.",
    )
    def patch(self, request):
        serializer = UserAPISerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class PasswordChangeView(APIView):
    """POST /api/auth/password/change/ — Changement de mot de passe."""
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "reset_password"

    @extend_schema(request=PasswordChangeSerializer, summary="Changer mot de passe")
    def post(self, request):
        serializer = PasswordChangeSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        user = request.user
        if not user.check_password(serializer.validated_data["current_password"]):
            return Response(
                {"current_password": ["Mot de passe actuel incorrect."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password"])
        return Response({"detail": "Mot de passe modifié."})


class PasswordResetRequestView(APIView):
    """POST /api/auth/password/reset/ — Demande de reset par email."""
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "reset_password"

    @extend_schema(request=PasswordResetRequestSerializer, summary="Demande reset mot de passe")
    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"].strip().lower()

        # Génération token via django.contrib.auth.tokens
        try:
            user = User.objects.get(email=email, is_active=True)
        except User.DoesNotExist:
            # Enumeration-safe : on renvoie toujours 200 même si l'email
            # n'existe pas (empêche de savoir quels emails sont enregistrés).
            return Response(
                {"detail": "Si cet email existe, un lien de reset a été envoyé."},
                status=status.HTTP_200_OK,
            )

        from django.contrib.auth.tokens import default_token_generator
        from django.utils.encoding import force_bytes
        from django.utils.http import urlsafe_base64_encode

        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        reset_url = f"{request.scheme}://{request.get_host()}/reset-password?uid={uid}&token={token}"

        # Envoi email (via Celery si dispo, sinon sync).
        try:
            from django.core.mail import send_mail
            send_mail(
                subject="Réinitialisation de votre mot de passe — Best Épargne",
                message=(
                    f"Bonjour,\n\n"
                    f"Pour réinitialiser votre mot de passe, cliquez sur le lien suivant :\n"
                    f"{reset_url}\n\n"
                    f"Ce lien est valable 24h. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.\n\n"
                    f"L'équipe Best Épargne."
                ),
                from_email=None,  # utilise DEFAULT_FROM_EMAIL
                recipient_list=[email],
                fail_silently=True,
            )
        except Exception:
            pass  # ne bloque pas la réponse

        return Response(
            {"detail": "Si cet email existe, un lien de reset a été envoyé."},
            status=status.HTTP_200_OK,
        )


class PasswordResetConfirmView(APIView):
    """POST /api/auth/password/reset/confirm/ — Confirme le reset avec token."""
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "reset_password"

    @extend_schema(request=PasswordResetConfirmSerializer, summary="Confirmer reset mot de passe")
    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        from django.contrib.auth.tokens import default_token_generator
        from django.utils.encoding import force_str
        from django.utils.http import urlsafe_base64_decode

        try:
            uid = force_str(urlsafe_base64_decode(serializer.validated_data["uid"]))
            user = User.objects.get(pk=uid)
        except (User.DoesNotExist, ValueError, TypeError):
            return Response(
                {"detail": "Lien invalide."}, status=status.HTTP_400_BAD_REQUEST
            )

        if not default_token_generator.check_token(user, serializer.validated_data["token"]):
            return Response(
                {"detail": "Lien expiré ou invalide."}, status=status.HTTP_400_BAD_REQUEST
            )

        new_pwd = serializer.validated_data["new_password"]
        try:
            validate_password(new_pwd, user=user)
        except DjangoValidationError as e:
            return Response(
                {"new_password": list(e.messages)}, status=status.HTTP_400_BAD_REQUEST
            )

        user.set_password(new_pwd)
        user.save(update_fields=["password"])
        return Response({"detail": "Mot de passe réinitialisé avec succès."})
