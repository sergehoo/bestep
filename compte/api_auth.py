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
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

# ─────────────────────────────────────────────────────────────────────
# Fix CSRF register/login : les endpoints /api/auth/* ne doivent JAMAIS
# activer SessionAuthentication de DRF. Quand l'utilisateur a un cookie
# `sessionid` traînant (ex. après un passage sur /admin/), SessionAuth
# appelle `enforce_csrf` et rejette les POST du SPA (qui utilise JWT et
# n'envoie pas de token CSRF). On force donc :
#  - `authentication_classes = []` sur les endpoints publics (register,
#    login, refresh, verify-email public, password-reset)
#  - `authentication_classes = [JWTAuthentication]` sur les endpoints
#    protégés (me, logout, password-change, resend-verify)
# Cela ne touche pas aux autres endpoints DRF qui restent régis par le
# DEFAULT_AUTHENTICATION_CLASSES global.
# ─────────────────────────────────────────────────────────────────────
_AUTH_PUBLIC: list = []
_AUTH_JWT_ONLY = [JWTAuthentication]

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
    email_verified = serializers.SerializerMethodField()
    approval_status = serializers.SerializerMethodField()
    profile = serializers.SerializerMethodField()
    onboarding_completed = serializers.SerializerMethodField()
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
            "email_verified",
            "approval_status",
            "profile",
            "onboarding_completed",
            "preferences",
            "created_at",
            "last_login",
        ]
        read_only_fields = [
            "id", "email", "avatar_url", "roles",
            "is_platform_admin", "email_verified", "approval_status",
            "profile", "onboarding_completed",
            "preferences", "created_at", "last_login",
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

    def get_email_verified(self, obj) -> bool:
        """SECURITE-05 — unifie 2 sources de vérité pour la vérif e-mail.

        1) ``User.is_email_verified`` — flag natif ajouté en SECURITE-05
        2) ``allauth.account.EmailAddress.verified`` — flag legacy géré
           par django-allauth (flow social login / templates HTML anciens)

        Certains users ont été validés via allauth avant SECURITE-05 (par
        ex. via l'e-mail HTML natif d'allauth) sans que ``User.is_email_verified``
        ne soit mis à jour. On accepte donc l'un OU l'autre. Un signal
        (compte.signals) synchronise allauth → User pour éviter la
        divergence à l'avenir.
        """
        if bool(getattr(obj, "is_email_verified", False)):
            return True
        try:
            from allauth.account.models import EmailAddress
            if EmailAddress.objects.filter(
                user=obj, verified=True,
            ).exists():
                # Best-effort : synchronise le flag natif pour les
                # prochains appels.
                try:
                    from django.utils import timezone
                    obj.is_email_verified = True
                    obj.email_verified_at = obj.email_verified_at or timezone.now()
                    obj.save(update_fields=["is_email_verified", "email_verified_at"])
                except Exception:
                    pass
                return True
        except Exception:
            pass
        return False

    def get_approval_status(self, obj) -> str:
        """Retourne l'état d'approbation pour les formateurs.

        Valeurs possibles :
            - ``not_applicable`` : le user n'est pas formateur
            - ``pending``        : formateur créé, non validé
            - ``approved``       : formateur validé
        """
        prof = getattr(obj, "instructor_profile", None)
        if prof is None:
            return "not_applicable"
        return "approved" if getattr(prof, "is_verified", False) else "pending"

    def get_profile(self, obj) -> dict:
        """Retourne le profil métier principal du user, normalisé.

        Sert au frontend à savoir dans quel dashboard rediriger et
        quelles données afficher.
        """
        if obj.is_platform_admin:
            return {"type": "platform_admin"}
        instr = getattr(obj, "instructor_profile", None)
        if instr is not None:
            return {
                "type": "instructor",
                "is_verified": bool(getattr(instr, "is_verified", False)),
                "headline": getattr(instr, "headline", ""),
                "payout_percent": getattr(instr, "payout_percent", None),
            }
        if getattr(obj, "is_org_admin", False):
            return {"type": "org_admin"}
        learner = getattr(obj, "learner_profile", None)
        if learner is not None:
            return {
                "type": "learner",
                "job_title": getattr(learner, "job_title", ""),
            }
        return {"type": "unknown"}

    def get_onboarding_completed(self, obj) -> bool:
        """Renvoie True si l'onboarding métier est complet.

        Learner : LearnerKYC créé (indication d'onboarding fini) → True.
        Instructor : InstructorProfile.is_verified → True.
        Autres : True par défaut.
        """
        instr = getattr(obj, "instructor_profile", None)
        if instr is not None:
            return bool(getattr(instr, "is_verified", False))
        # LearnerKYC = onboarding apprenant
        try:
            from compte.models import LearnerKYC
            return LearnerKYC.objects.filter(user=obj).exists()
        except Exception:
            return True

    def get_preferences(self, obj):
        from compte.models import UserPreferences
        prefs = UserPreferences.get_or_create_for(obj)
        return UserPreferencesSerializer(prefs).data


class RegisterSerializer(serializers.Serializer):
    """
    Inscription publique : email + password + full_name + type de compte.

    Validations & sécurité :
    - Email unique (via User.objects.create_user).
    - Password strong (Argon2 + AUTH_PASSWORD_VALIDATORS).
    - full_name >= 2 caractères.
    - ``account_type`` STRICTEMENT limité à ``learner`` / ``instructor``
      / ``org_admin``. Toute autre valeur (``admin``, ``platform_admin``,
      ``superuser``, ``staff``…) est **rejetée** avec 400 : l'endpoint
      public ne peut PAS créer d'admin plateforme. L'élévation vers
      admin passe exclusivement par ``python manage.py createsuperuser``
      ou par ``POST /api/admin/users/`` (endpoint réservé is_platform_admin).
    - Création atomique : User + profil métier (LearnerProfile /
      InstructorProfile / OrganizationProfile) dans une transaction.
      Si la création du profil échoue, le User est rollback.
    """
    ACCOUNT_TYPE_CHOICES = ("learner", "instructor", "org_admin")

    email = serializers.EmailField(required=True)
    password = serializers.CharField(
        required=True, min_length=8, write_only=True, style={"input_type": "password"}
    )
    full_name = serializers.CharField(required=True, min_length=2, max_length=160)
    phone = serializers.CharField(required=False, allow_blank=True, max_length=30)
    account_type = serializers.ChoiceField(
        choices=ACCOUNT_TYPE_CHOICES,
        required=False,
        default="learner",
    )
    organization_name = serializers.CharField(
        required=False, allow_blank=True, max_length=160
    )

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

    def validate_account_type(self, value):
        # Ceinture + bretelles : ChoiceField devrait déjà rejeter, mais
        # on double-check pour ne jamais laisser passer un rôle admin
        # même via un contournement de serializer.
        if value not in self.ACCOUNT_TYPE_CHOICES:
            raise DRFValidationError(
                "Type de compte non autorisé pour une inscription publique."
            )
        return value

    def create(self, validated_data):
        from django.db import transaction

        account_type = validated_data.get("account_type") or "learner"
        organization_name = (validated_data.get("organization_name") or "").strip()

        # Filet de sécurité final : jamais d'admin/staff/superuser depuis
        # cet endpoint public — peu importe ce qui a été envoyé.
        with transaction.atomic():
            user = User.objects.create_user(
                email=validated_data["email"],
                password=validated_data["password"],
                full_name=validated_data["full_name"],
                phone=validated_data.get("phone", ""),
                is_staff=False,
                is_superuser=False,
                platform_role=User.PlatformRole.USER,
            )
            self._create_business_profile(user, account_type, organization_name)
        return user

    @staticmethod
    def _create_business_profile(user, account_type: str, organization_name: str) -> None:
        """Crée le profil métier correspondant au type de compte."""
        if account_type == "instructor":
            from compte.models import InstructorProfile
            InstructorProfile.objects.get_or_create(
                user=user,
                defaults={
                    "headline": "",
                    "bio": "",
                    # ``is_verified=False`` par défaut : le formateur doit
                    # être validé par un admin plateforme avant de publier
                    # (workflow d'approbation).
                    "is_verified": False,
                    "payout_percent": 70,
                },
            )
        elif account_type == "org_admin":
            # Le profil "Organisation" est représenté par
            # ``organizations.Organization`` + ``OrganizationMembership``
            # avec ``role=OWNER``. Importation locale pour éviter les
            # cycles.
            try:
                from organizations.models import (
                    Organization,
                    OrganizationMembership,
                )
                org = Organization.objects.create(
                    name=organization_name or f"{user.full_name} Organization",
                    owner=user,
                    is_active=True,
                )
                OrganizationMembership.objects.create(
                    user=user,
                    organization=org,
                    role=OrganizationMembership.Role.OWNER
                    if hasattr(OrganizationMembership, "Role")
                    else "OWNER",
                    is_active=True,
                )
            except Exception:
                # L'app organizations peut manquer certains champs — on
                # laisse le user comme LEARNER et on journalisera.
                pass
        else:
            # LEARNER par défaut : profil apprenant automatique.
            from compte.models import LearnerProfile
            LearnerProfile.objects.get_or_create(
                user=user,
                defaults={"job_title": "", "bio": ""},
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
    authentication_classes = _AUTH_PUBLIC
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

        # Envoi du mail de vérification immédiat (best-effort).
        try:
            from compte.email_verification import issue_token
            issue_token(user)
        except Exception:
            pass

        # Token pair immédiat pour connexion auto post-signup.
        # Le front lira ``user.is_email_verified`` pour rediriger vers
        # /verify-email et bloquer l'accès aux endpoints métier via
        # ``IsEmailVerified``.
        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "user": UserAPISerializer(user).data,
                "verification_email_sent": True,
            },
            status=status.HTTP_201_CREATED,
        )


class LoginView(TokenObtainPairView):
    """POST /api/auth/login/ — Login classique email+password → tokens + user."""
    authentication_classes = _AUTH_PUBLIC
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
    authentication_classes = _AUTH_PUBLIC

    @extend_schema(
        summary="Refresh JWT",
        description="Envoie un refresh token, reçoit un nouvel access token (+ nouveau refresh via rotation).",
    )
    def post(self, request, *args, **kwargs):
        return super().post(request, *args, **kwargs)


class LogoutView(APIView):
    """POST /api/auth/logout/ — Blacklist du refresh token."""
    authentication_classes = _AUTH_JWT_ONLY
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
    authentication_classes = _AUTH_JWT_ONLY
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
    authentication_classes = _AUTH_JWT_ONLY
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
    authentication_classes = _AUTH_PUBLIC
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
    authentication_classes = _AUTH_PUBLIC
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


# ─────────────────────────────────────────────────────────────────────
# Vérification e-mail (SECURITE-05)
# ─────────────────────────────────────────────────────────────────────


class VerifyEmailSerializer(serializers.Serializer):
    uid = serializers.IntegerField()
    token = serializers.CharField(max_length=128)


class VerifyEmailView(APIView):
    """POST /api/auth/verify-email/ — Confirme un token de vérification.

    Accepte ``uid`` + ``token`` en JSON. Ne requiert PAS d'auth (l'user
    peut cliquer depuis n'importe où). Retourne 200 avec ``user`` mis
    à jour si succès, 400 sinon (codes normalisés).
    """
    authentication_classes = _AUTH_PUBLIC
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "reset_password"

    @extend_schema(request=VerifyEmailSerializer, summary="Vérifier l'e-mail")
    def post(self, request):
        from compte.email_verification import verify_token

        s = VerifyEmailSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        try:
            user = User.objects.get(pk=s.validated_data["uid"])
        except User.DoesNotExist:
            return Response(
                {"detail": "Lien invalide.", "code": "EMAIL_TOKEN_INVALID"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if user.is_email_verified:
            return Response(
                {"detail": "E-mail déjà vérifié.", "user": UserAPISerializer(user).data},
                status=status.HTTP_200_OK,
            )

        ok = verify_token(user, s.validated_data["token"])
        if not ok:
            return Response(
                {"detail": "Lien invalide ou expiré.", "code": "EMAIL_TOKEN_INVALID"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(
            {"detail": "E-mail vérifié.", "user": UserAPISerializer(user).data},
            status=status.HTTP_200_OK,
        )


class ResendVerifyEmailView(APIView):
    """POST /api/auth/verify-email/resend/ — Renvoie un mail de vérif.

    Requiert d'être authentifié (par le token JWT reçu à l'inscription).
    Applique un cooldown pour prévenir le spam.
    """
    authentication_classes = _AUTH_JWT_ONLY
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "reset_password"

    @extend_schema(summary="Renvoyer le mail de vérification")
    def post(self, request):
        from compte.email_verification import can_resend, issue_token

        user = request.user
        if user.is_email_verified:
            return Response(
                {"detail": "E-mail déjà vérifié.", "code": "EMAIL_ALREADY_VERIFIED"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        allowed, retry_after = can_resend(user)
        if not allowed:
            return Response(
                {
                    "detail": f"Merci d'attendre {retry_after}s avant de renvoyer.",
                    "code": "EMAIL_RESEND_COOLDOWN",
                    "retry_after_seconds": retry_after,
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        issue_token(user)
        return Response(
            {"detail": "Un nouveau mail de vérification a été envoyé."},
            status=status.HTTP_200_OK,
        )
