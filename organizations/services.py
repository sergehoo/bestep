from __future__ import annotations

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.utils import timezone

from catalog.models import Course
from compte.models import InstructorProfile, LearnerProfile, LearnerKYC
from organizations.models import OrganizationInvitation, OrganizationMembership

User = get_user_model()


class OrganizationPermissionService:
    @staticmethod
    def can_manage_organization(user, organization) -> bool:
        if not user or not user.is_authenticated or not user.is_active:
            return False

        if getattr(user, "is_platform_admin", False):
            return True

        return OrganizationMembership.objects.filter(
            user=user,
            organization=organization,
            is_active=True,
            role__in=[
                OrganizationMembership.Role.OWNER,
                OrganizationMembership.Role.ADMIN,
            ],
        ).exists()


class OrganizationMemberManagementService:
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
            invitation, _ = OrganizationInvitation.objects.update_or_create(
                organization=organization,
                email=email,
                role=role,
                defaults={
                    "invited_by": actor,
                    "expires_at": timezone.now() + timedelta(days=7),
                    "accepted_at": None,
                },
            )

        return {
            "user": user,
            "membership": membership,
            "invitation": invitation,
        }

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
        """Met à jour un membership et/ou les champs profil de l'utilisateur.

        Garde-fous :
        - actor doit être OWNER/ADMIN de l'organisation (ou platform admin) ;
        - on n'autorise pas à dégrader le DERNIER OWNER (sinon l'org devient
          orpheline) ;
        - on ne peut pas modifier le rôle d'un user qui a son rôle figé.
        """
        if not OrganizationPermissionService.can_manage_organization(actor, organization):
            raise PermissionDenied("Vous n'êtes pas autorisé à gérer cette organisation.")

        if membership.organization_id != organization.id:
            raise ValidationError("Ce membre n'appartient pas à cette organisation.")

        # Garde-fou anti-orphelin : ne pas perdre le dernier OWNER actif.
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
                    "Impossible de retirer le dernier propriétaire de "
                    "l'organisation. Promouvez d'abord un autre membre."
                )

        # Idem si on désactive le dernier OWNER actif.
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
                raise ValidationError(
                    "Impossible de désactiver le dernier propriétaire actif."
                )

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

        # Profil utilisateur (champs partagés).
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

        # Profils latéraux : on s'assure qu'ils existent si le rôle l'exige.
        if membership.role == OrganizationMembership.Role.INSTRUCTOR:
            InstructorProfile.objects.get_or_create(user=user)
        elif membership.role == OrganizationMembership.Role.LEARNER:
            LearnerProfile.objects.get_or_create(user=user)

        return membership

    @staticmethod
    @transaction.atomic
    def deactivate_member(*, actor, organization, membership):
        """Désactive un membership (sans supprimer l'utilisateur).

        On ne supprime jamais un user — on coupe seulement son lien à
        l'organisation. Cela préserve les cours créés et l'historique.
        """
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
    def create_course_for_organization(
        *,
        actor,
        organization,
        form,
    ):
        if not OrganizationPermissionService.can_manage_organization(actor, organization):
            raise PermissionDenied("Vous n'êtes pas autorisé à créer un cours pour cette organisation.")

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