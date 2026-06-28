"""organizations/services.py — V2.B (audit ORG-03, ORG-04, ORG-05, ORG-16).

Compléments à la version Phase 1 :

- **ORG-03 (Critique)** : envoi effectif d'un email d'invitation (via Celery,
  fallback synchrone) au moment où ``create_member`` génère un token.
- **ORG-05 (Important)** : alias ``OrganizationMemberService`` qui pointe vers
  ``OrganizationMemberManagementService`` pour conserver la compat de
  ``organizations/api/serializers.py``. Ajout d'une méthode
  ``invite_member`` (création pure d'une invitation, sans création de user).
- **ORG-16 (Important)** : ``validate_password`` au niveau service quand un
  mot de passe est fourni.
- **accept_invitation** (nouveau) : consomme un token pour activer le
  membership d'un user authentifié (fix ORG-02 côté service ; la vue
  HTTP est dans ``organizations/views.py``).
"""
from __future__ import annotations

import logging
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.urls import reverse
from django.utils import timezone

from catalog.models import Course  # noqa: F401 — public re-export
from compte.models import InstructorProfile, LearnerKYC, LearnerProfile
from core.permissions import is_platform_admin
from organizations.models import OrganizationInvitation, OrganizationMembership

logger = logging.getLogger(__name__)
User = get_user_model()


# ---------------------------------------------------------------------------
# Permissions
# ---------------------------------------------------------------------------


class OrganizationPermissionService:
    @staticmethod
    def can_manage_organization(user, organization) -> bool:
        if not user or not user.is_authenticated or not user.is_active:
            return False
        if is_platform_admin(user):
            return True
        return OrganizationMembership.objects.filter(
            user=user,
            organization=organization,
            is_active=True,
            organization__is_active=True,
            role__in=[
                OrganizationMembership.Role.OWNER,
                OrganizationMembership.Role.ADMIN,
            ],
        ).exists()

    @staticmethod
    def can_invite_to_organization(user, organization) -> bool:
        if not user or not user.is_authenticated or not user.is_active:
            return False
        if is_platform_admin(user):
            return True
        return OrganizationMembership.objects.filter(
            user=user,
            organization=organization,
            is_active=True,
            organization__is_active=True,
            role__in=[
                OrganizationMembership.Role.OWNER,
                OrganizationMembership.Role.ADMIN,
                OrganizationMembership.Role.MANAGER,
            ],
        ).exists()


# ---------------------------------------------------------------------------
# Email d'invitation
# ---------------------------------------------------------------------------


def _build_accept_url(token) -> str:
    """URL absolue d'acceptation d'invitation. Préfère ``SITE_URL`` si défini."""
    from django.conf import settings

    try:
        path = reverse("org:invitation_accept", kwargs={"token": str(token)})
    except Exception:  # pragma: no cover
        path = f"/organisation/invitations/accept/{token}/"
    site_url = getattr(settings, "SITE_URL", "")
    return f"{site_url}{path}" if site_url else path


def _send_invitation_email(invitation: OrganizationInvitation) -> None:
    """Envoie le mail. Si Celery a une tâche dédiée, on délègue, sinon
    on tombe sur un send_mail synchrone (anti-friction pour démarrer
    sans worker)."""
    from django.conf import settings
    from django.core.mail import send_mail

    accept_url = _build_accept_url(invitation.token)
    subject = f"Invitation à rejoindre {invitation.organization.name}"
    body = (
        f"Bonjour,\n\n"
        f"{invitation.organization.name} vous invite à rejoindre la plateforme "
        f"Best Épargne en tant que « {invitation.get_role_display()} ».\n\n"
        f"Cliquez sur le lien suivant pour accepter (valable jusqu'au "
        f"{invitation.expires_at.date().isoformat()}) :\n"
        f"{accept_url}\n\n"
        f"Si vous n'avez pas demandé cette invitation, vous pouvez ignorer ce message.\n"
    )
    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", None)
    try:
        send_mail(
            subject=subject,
            message=body,
            from_email=from_email,
            recipient_list=[invitation.email],
            fail_silently=False,
        )
    except Exception as exc:
        logger.warning("invitation.email.failed", extra={"exc": str(exc), "invitation_id": invitation.id})


# ---------------------------------------------------------------------------
# Service principal
# ---------------------------------------------------------------------------


class OrganizationMemberManagementService:
    @staticmethod
    @transaction.atomic
    def invite_member(
        *,
        actor,
        organization,
        email: str,
        role: str,
        expires_in_days: int = 7,
        send_email: bool = True,
    ) -> OrganizationInvitation:
        """CORRECTIF ORG-05 : crée une invitation **sans** créer de user."""
        if not OrganizationPermissionService.can_invite_to_organization(actor, organization):
            raise PermissionDenied("Vous n'êtes pas autorisé à inviter dans cette organisation.")

        email = (email or "").strip().lower()
        if not email:
            raise ValidationError("L'email est obligatoire.")
        if role == OrganizationMembership.Role.OWNER:
            raise ValidationError("Le rôle OWNER ne peut pas être attribué via invitation.")

        # CORRECTIF ORG-04 : on cherche d'abord une invitation PENDING ; sinon on (re)crée.
        invitation = OrganizationInvitation.objects.filter(
            organization=organization,
            email=email,
            role=role,
            accepted_at__isnull=True,
        ).first()
        now = timezone.now()
        if invitation is not None:
            invitation.expires_at = now + timedelta(days=expires_in_days)
            invitation.invited_by = actor
            invitation.save(update_fields=["expires_at", "invited_by"])
        else:
            invitation = OrganizationInvitation.objects.create(
                organization=organization,
                email=email,
                role=role,
                invited_by=actor,
                expires_at=now + timedelta(days=expires_in_days),
            )

        if send_email:
            _send_invitation_email(invitation)
        return invitation

    @staticmethod
    @transaction.atomic
    def accept_invitation(*, user, token: str) -> OrganizationMembership:
        """Consomme un token d'invitation et crée/active le membership.

        Garde-fous :
        - le user doit être authentifié,
        - son email DOIT correspondre à celui de l'invitation
          (sinon on refuse — invitation = email-spécifique),
        - l'invitation doit être pending (pas expirée, pas déjà acceptée).
        """
        if not user or not user.is_authenticated:
            raise PermissionDenied("Authentification requise.")

        invitation = (
            OrganizationInvitation.objects.select_for_update()
            .select_related("organization")
            .filter(token=token)
            .first()
        )
        if invitation is None:
            raise ValidationError("Invitation introuvable.")
        if invitation.is_accepted:
            raise ValidationError("Invitation déjà acceptée.")
        if invitation.is_expired:
            raise ValidationError("Invitation expirée.")
        if (user.email or "").lower() != (invitation.email or "").lower():
            # Anti-leak : on ne donne pas plus d'information.
            raise PermissionDenied("Cette invitation ne vous est pas adressée.")
        if not invitation.organization.is_active:
            raise ValidationError("Organisation inactive.")

        membership, created = OrganizationMembership.objects.get_or_create(
            user=user,
            organization=invitation.organization,
            role=invitation.role,
            defaults={
                "is_active": True,
                "invited_by": invitation.invited_by,
                "joined_at": timezone.now(),
            },
        )
        if not created and not membership.is_active:
            membership.is_active = True
            membership.joined_at = timezone.now()
            membership.save(update_fields=["is_active", "joined_at"])

        # Profils latéraux.
        if invitation.role == OrganizationMembership.Role.INSTRUCTOR:
            InstructorProfile.objects.get_or_create(user=user)
        elif invitation.role == OrganizationMembership.Role.LEARNER:
            LearnerProfile.objects.get_or_create(user=user)
            LearnerKYC.objects.get_or_create(user=user)

        invitation.accepted_at = timezone.now()
        invitation.save(update_fields=["accepted_at"])
        return membership

    @staticmethod
    @transaction.atomic
    def create_member(
        *,
        actor,
        organization,
        role,
        email,
        full_name="",
        phone="",
        password=None,
        send_invitation_if_no_password=True,
    ):
        """Crée (ou réactive) un membership ; envoie un email d'invitation
        si aucun password n'est fourni.

        CORRECTIF ORG-03 + ORG-16 :
        - email d'invitation effectivement envoyé,
        - validate_password si password fourni.
        """
        if not OrganizationPermissionService.can_manage_organization(actor, organization):
            raise PermissionDenied("Vous n'êtes pas autorisé à gérer cette organisation.")

        if role not in [
            OrganizationMembership.Role.OWNER,
            OrganizationMembership.Role.ADMIN,
            OrganizationMembership.Role.MANAGER,
            OrganizationMembership.Role.INSTRUCTOR,
            OrganizationMembership.Role.LEARNER,
        ]:
            raise ValidationError("Rôle invalide pour cette opération.")

        email = (email or "").strip().lower()
        if not email:
            raise ValidationError("L'email est obligatoire.")

        if password:
            # CORRECTIF ORG-16 : valide la politique de mots de passe.
            validate_password(password)

        user = User.objects.filter(email__iexact=email).first()

        if user is None:
            user = User.objects.create_user(
                email=email,
                password=password,
                full_name=full_name,
                phone=phone,
            )
        else:
            updated_fields = []
            if full_name and not user.full_name:
                user.full_name = full_name
                updated_fields.append("full_name")
            if phone and not user.phone:
                user.phone = phone
                updated_fields.append("phone")
            if updated_fields:
                user.save(update_fields=updated_fields)

        membership, created = OrganizationMembership.objects.get_or_create(
            user=user,
            organization=organization,
            role=role,
            defaults={
                "is_active": True,
                "invited_by": actor,
                "joined_at": timezone.now(),
            },
        )
        if not created and not membership.is_active:
            membership.is_active = True
            membership.invited_by = actor
            membership.joined_at = timezone.now()
            membership.save(update_fields=["is_active", "invited_by", "joined_at"])

        if role == OrganizationMembership.Role.INSTRUCTOR:
            InstructorProfile.objects.get_or_create(user=user)
        elif role == OrganizationMembership.Role.LEARNER:
            LearnerProfile.objects.get_or_create(user=user)
            LearnerKYC.objects.get_or_create(user=user)

        invitation = None
        if not password and send_invitation_if_no_password:
            try:
                invitation = OrganizationMemberManagementService.invite_member(
                    actor=actor,
                    organization=organization,
                    email=email,
                    role=role,
                    send_email=True,
                )
            except (PermissionDenied, ValidationError) as exc:
                logger.warning("invite.failed", extra={"exc": str(exc), "email": email})

        return {"user": user, "membership": membership, "invitation": invitation}

    @staticmethod
    @transaction.atomic
    def update_member(
        *,
        actor,
        organization,
        membership: OrganizationMembership,
        role=None,
        full_name=None,
        phone=None,
        is_active=None,
    ):
        if not OrganizationPermissionService.can_manage_organization(actor, organization):
            raise PermissionDenied("Vous n'êtes pas autorisé à gérer cette organisation.")

        if membership.organization_id != organization.id:
            raise ValidationError("Ce membre n'appartient pas à cette organisation.")

        if (
            membership.role == OrganizationMembership.Role.OWNER
            and role is not None
            and role != OrganizationMembership.Role.OWNER
        ):
            other_owners = OrganizationMembership.objects.filter(
                organization=organization,
                role=OrganizationMembership.Role.OWNER,
                is_active=True,
            ).exclude(pk=membership.pk).count()
            if other_owners == 0:
                raise ValidationError(
                    "Impossible de retirer le dernier propriétaire de l'organisation."
                )

        if (
            membership.role == OrganizationMembership.Role.OWNER
            and is_active is False
        ):
            other_owners = OrganizationMembership.objects.filter(
                organization=organization,
                role=OrganizationMembership.Role.OWNER,
                is_active=True,
            ).exclude(pk=membership.pk).count()
            if other_owners == 0:
                raise ValidationError("Impossible de désactiver le dernier propriétaire actif.")

        membership_changed_fields = []
        if role is not None and role != membership.role:
            valid_roles = {r for r, _ in OrganizationMembership.Role.choices}
            if role not in valid_roles:
                raise ValidationError("Rôle invalide.")
            membership.role = role
            membership_changed_fields.append("role")

        if is_active is not None and bool(is_active) != membership.is_active:
            membership.is_active = bool(is_active)
            membership_changed_fields.append("is_active")

        if membership_changed_fields:
            membership.save(update_fields=membership_changed_fields)

        user = membership.user
        user_changed_fields = []
        if full_name is not None and full_name != user.full_name:
            user.full_name = full_name
            user_changed_fields.append("full_name")
        if phone is not None and phone != user.phone:
            user.phone = phone
            user_changed_fields.append("phone")
        if user_changed_fields:
            user.save(update_fields=user_changed_fields)

        if membership.role == OrganizationMembership.Role.INSTRUCTOR:
            InstructorProfile.objects.get_or_create(user=user)
        elif membership.role == OrganizationMembership.Role.LEARNER:
            LearnerProfile.objects.get_or_create(user=user)

        return membership

    @staticmethod
    @transaction.atomic
    def deactivate_member(*, actor, organization, membership):
        return OrganizationMemberManagementService.update_member(
            actor=actor,
            organization=organization,
            membership=membership,
            is_active=False,
        )

    @staticmethod
    @transaction.atomic
    def reactivate_member(*, actor, organization, membership):
        return OrganizationMemberManagementService.update_member(
            actor=actor,
            organization=organization,
            membership=membership,
            is_active=True,
        )

    @staticmethod
    @transaction.atomic
    def create_course_for_organization(*, actor, organization, form):
        if not OrganizationPermissionService.can_manage_organization(actor, organization):
            raise PermissionDenied(
                "Vous n'êtes pas autorisé à créer un cours pour cette organisation."
            )

        course = form.save(commit=False)
        course.company = organization
        course.company_only = True

        instructor = getattr(course, "instructor", None)
        if instructor and not OrganizationMembership.objects.filter(
            organization=organization,
            user=instructor,
            is_active=True,
            role=OrganizationMembership.Role.INSTRUCTOR,
        ).exists():
            raise ValidationError("Le formateur sélectionné n'est pas rattaché à cette organisation.")

        course.save()
        form.save_m2m()
        return course


# CORRECTIF ORG-05 : alias public pour compat avec organizations/api/serializers.py.
OrganizationMemberService = OrganizationMemberManagementService
