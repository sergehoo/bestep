"""
catalog/lifecycle.py — P1.1 : Service applicatif des transitions de statut Course.

Source de vérité unique pour publier / dépublier / archiver / restaurer un
cours. Toutes les vues (API DRF, admin Django, vues template instructor)
doivent passer par ces helpers : ils centralisent les validations, les
permissions, les effets de bord (timestamps) et l'audit log.

Transitions légales :

  ┌─────────┐  publish      ┌──────────┐  unpublish     ┌─────────┐
  │  DRAFT  │ ─────────────▶│PUBLISHED │ ──────────────▶│  DRAFT  │
  └────┬────┘               └────┬─────┘                └────┬────┘
       │ submit                  │ archive                   │ archive
       ▼                         ▼                           ▼
  ┌─────────┐  publish      ┌──────────┐                ┌─────────┐
  │ REVIEW  │ ─────────────▶│PUBLISHED │                │ARCHIVED │
  └─────────┘               └──────────┘                └────┬────┘
                                  │ archive                  │ restore
                                  ▼                          ▼
                            ┌──────────┐                ┌─────────┐
                            │ ARCHIVED │                │  DRAFT  │
                            └──────────┘                └─────────┘

Règles :
- Seuls l'instructor du cours, un OWNER/ADMIN de Course.company, ou un admin
  plateforme peuvent transitionner. (cf. ``_check_permissions``)
- Publier exige : titre, instructor, ≥ 1 section, ≥ 1 leçon par section.
- ARCHIVED → on bloque l'inscription/achat mais on conserve les inscriptions
  existantes (préserve les données utilisateur).
- Toute transition crée un ``CourseLifecycleEvent`` en audit log.
- Tout est atomique (``transaction.atomic``) — pas de demi-transitions.

Utilisation :

    from catalog.lifecycle import publish_course, unpublish_course
    publish_course(course, actor=request.user)           # peut raise
    unpublish_course(course, actor=request.user, note="…")
"""
from __future__ import annotations

from typing import Optional

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.db.models import Count
from django.utils import timezone

from catalog.models import Course, CourseLifecycleEvent


# ─────────────────────────────────────────────────────────────────────
# Permissions
# ─────────────────────────────────────────────────────────────────────

def _is_platform_admin(user) -> bool:
    if not user or not user.is_authenticated:
        return False
    try:
        from core.permissions import is_platform_admin
        return bool(is_platform_admin(user))
    except Exception:
        return bool(getattr(user, "is_staff", False) or getattr(user, "is_superuser", False))


def _is_org_admin_of(user, organization_id: Optional[int]) -> bool:
    """OWNER/ADMIN actif de l'organisation propriétaire du cours."""
    if not user or not user.is_authenticated or not organization_id:
        return False
    try:
        from organizations.models import OrganizationMembership
        return OrganizationMembership.objects.filter(
            user=user,
            organization_id=organization_id,
            is_active=True,
            role__in=(
                OrganizationMembership.Role.OWNER,
                OrganizationMembership.Role.ADMIN,
            ),
        ).exists()
    except Exception:
        return False


def _check_permissions(course: Course, actor) -> None:
    """Lève ``PermissionDenied`` si ``actor`` n'a pas le droit de transitionner ``course``."""
    if not actor or not getattr(actor, "is_authenticated", False):
        raise PermissionDenied("Authentification requise.")
    if _is_platform_admin(actor):
        return
    if course.instructor_id == getattr(actor, "id", None):
        return
    if _is_org_admin_of(actor, course.company_id):
        return
    raise PermissionDenied(
        "Vous n'avez pas le droit de modifier le cycle de vie de ce cours."
    )


# ─────────────────────────────────────────────────────────────────────
# Validation métier pour la publication
# ─────────────────────────────────────────────────────────────────────

def _validate_publishable(course: Course) -> None:
    """
    Vérifie qu'un cours peut légitimement être publié.

    Critères stricts (raise ValidationError sinon) :
      - title non vide
      - instructor renseigné
      - au moins 1 section
      - chaque section a au moins 1 leçon
    """
    errors: list[str] = []

    if not (course.title or "").strip():
        errors.append("Le titre du cours est obligatoire.")
    if not course.instructor_id:
        errors.append("Un formateur doit être assigné au cours.")

    # Section + leçons (lazy import pour éviter cycle).
    from catalog.models import CourseSection, Lesson

    sections = list(
        CourseSection.objects.filter(course=course).order_by("order").only("id", "title")
    )
    if not sections:
        errors.append("Le cours doit contenir au moins une section.")
    else:
        section_ids = [s.id for s in sections]
        lesson_counts = dict(
            Lesson.objects.filter(section_id__in=section_ids)
            .values("section_id")
            .annotate(c=Count("id"))
            .values_list("section_id", "c")
        )
        empty = [s for s in sections if lesson_counts.get(s.id, 0) == 0]
        if empty:
            titles = ", ".join(s.title or f"section #{s.id}" for s in empty[:3])
            errors.append(
                f"Certaines sections n'ont aucune leçon ({titles}"
                + ("…" if len(empty) > 3 else "")
                + ")."
            )

    if errors:
        raise ValidationError(errors)


# ─────────────────────────────────────────────────────────────────────
# Audit log
# ─────────────────────────────────────────────────────────────────────

def _log_event(
    course: Course,
    actor,
    action: str,
    from_status: str,
    to_status: str,
    note: str = "",
) -> CourseLifecycleEvent:
    return CourseLifecycleEvent.objects.create(
        course=course,
        course_title_snapshot=(course.title or "")[:200],
        course_id_snapshot=course.pk,
        actor=actor if actor and actor.is_authenticated else None,
        action=action,
        from_status=from_status or "",
        to_status=to_status or "",
        note=(note or "")[:500],
    )


# ─────────────────────────────────────────────────────────────────────
# Transitions publiques
# ─────────────────────────────────────────────────────────────────────

@transaction.atomic
def publish_course(course: Course, *, actor, note: str = "") -> Course:
    """
    Publie un cours (DRAFT/REVIEW → PUBLISHED).

    - Refuse si déjà PUBLISHED (idempotent silencieux).
    - Refuse si ARCHIVED (passez par ``restore_course`` d'abord).
    - Valide les champs requis pour la publication (cf. _validate_publishable).
    - Renseigne ``published_at`` la première fois (le model.save le fait déjà).
    """
    _check_permissions(course, actor)

    if course.status == Course.Status.PUBLISHED:
        return course  # idempotent

    if course.status == Course.Status.ARCHIVED:
        raise ValidationError(
            "Un cours archivé doit d'abord être restauré avant publication."
        )

    _validate_publishable(course)

    # Lock pour éviter une publication concurrente.
    course = Course.objects.select_for_update().get(pk=course.pk)
    from_status = course.status
    course.status = Course.Status.PUBLISHED
    if course.published_at is None:
        course.published_at = timezone.now()
    course.archived_at = None  # safety
    course.save(update_fields=["status", "published_at", "archived_at", "updated_at"])

    _log_event(
        course,
        actor,
        CourseLifecycleEvent.Action.PUBLISHED,
        from_status=from_status,
        to_status=Course.Status.PUBLISHED,
        note=note,
    )
    return course


@transaction.atomic
def unpublish_course(course: Course, *, actor, note: str = "") -> Course:
    """
    Dépublie un cours (PUBLISHED → DRAFT).

    - Refuse si pas PUBLISHED.
    - Préserve ``published_at`` pour traçabilité (utile pour le SEO et le
      reporting "déjà publié une fois"). Une republication ne le remettra
      pas à zéro non plus.
    """
    _check_permissions(course, actor)

    if course.status != Course.Status.PUBLISHED:
        raise ValidationError(
            "Seul un cours publié peut être dépublié."
        )

    course = Course.objects.select_for_update().get(pk=course.pk)
    from_status = course.status
    course.status = Course.Status.DRAFT
    course.save(update_fields=["status", "updated_at"])

    _log_event(
        course,
        actor,
        CourseLifecycleEvent.Action.UNPUBLISHED,
        from_status=from_status,
        to_status=Course.Status.DRAFT,
        note=note,
    )
    return course


@transaction.atomic
def archive_course(course: Course, *, actor, note: str = "") -> Course:
    """
    Archive un cours (any → ARCHIVED).

    - Idempotent silencieux si déjà ARCHIVED.
    - Renseigne ``archived_at``.
    - Les inscriptions existantes restent intactes (préserve les données
      utilisateur). Le bloc d'inscription neuve est géré ailleurs via la
      visibilité publique (``get_visible_courses_qs`` ne retourne pas
      les ARCHIVED).
    """
    _check_permissions(course, actor)

    if course.status == Course.Status.ARCHIVED:
        return course

    course = Course.objects.select_for_update().get(pk=course.pk)
    from_status = course.status
    course.status = Course.Status.ARCHIVED
    course.archived_at = timezone.now()
    course.save(update_fields=["status", "archived_at", "updated_at"])

    _log_event(
        course,
        actor,
        CourseLifecycleEvent.Action.ARCHIVED,
        from_status=from_status,
        to_status=Course.Status.ARCHIVED,
        note=note,
    )
    return course


@transaction.atomic
def restore_course(course: Course, *, actor, note: str = "") -> Course:
    """
    Restaure un cours archivé (ARCHIVED → DRAFT).

    - Refuse si pas ARCHIVED.
    - Remet ``archived_at`` à NULL.
    - Le cours repasse en DRAFT (jamais directement PUBLISHED) — l'utilisateur
      republie explicitement après vérification du contenu.
    """
    _check_permissions(course, actor)

    if course.status != Course.Status.ARCHIVED:
        raise ValidationError(
            "Seul un cours archivé peut être restauré."
        )

    course = Course.objects.select_for_update().get(pk=course.pk)
    from_status = course.status
    course.status = Course.Status.DRAFT
    course.archived_at = None
    course.save(update_fields=["status", "archived_at", "updated_at"])

    _log_event(
        course,
        actor,
        CourseLifecycleEvent.Action.RESTORED,
        from_status=from_status,
        to_status=Course.Status.DRAFT,
        note=note,
    )
    return course


# ─────────────────────────────────────────────────────────────────────
# Suppression (hard delete) — protégée
# ─────────────────────────────────────────────────────────────────────

def can_delete_course(course: Course) -> tuple[bool, str]:
    """
    Vérifie si un cours peut être supprimé sans casser de données utilisateur.

    Retourne ``(True, "")`` si OK, sinon ``(False, raison)``.
    Règles :
      - On REFUSE la suppression dès qu'il y a une Enrollment existante
        (même CANCELED — on garde la trace pour l'utilisateur).
      - On REFUSE la suppression s'il y a des Payment encaissés.
      - Pour les autres cas, l'archivage est l'opération recommandée
        (soft-delete fonctionnel).
    """
    from enrollments.models import Enrollment
    if Enrollment.objects.filter(course=course).exists():
        return False, (
            "Suppression refusée : ce cours a des inscriptions. "
            "Archivez-le plutôt pour préserver les données utilisateur."
        )
    try:
        from catalog.models import Payment
        if Payment.objects.filter(course=course).exists():
            return False, (
                "Suppression refusée : ce cours a des paiements enregistrés. "
                "Archivez-le pour préserver l'historique comptable."
            )
    except Exception:
        pass
    return True, ""


@transaction.atomic
def delete_course(course: Course, *, actor, note: str = "") -> None:
    """
    Suppression hard d'un cours, refusée si données utilisateur attachées.

    Préfère ``archive_course`` dans 99% des cas.
    """
    _check_permissions(course, actor)
    ok, reason = can_delete_course(course)
    if not ok:
        raise ValidationError(reason)

    # On log AVANT delete pour préserver l'historique.
    _log_event(
        course,
        actor,
        CourseLifecycleEvent.Action.DELETED,
        from_status=course.status,
        to_status="",
        note=note or "Hard delete (aucune inscription / paiement).",
    )
    course.delete()


# ─────────────────────────────────────────────────────────────────────
# Helpers exposés
# ─────────────────────────────────────────────────────────────────────

def backfill_archived_at() -> int:
    """
    Renseigne ``archived_at = updated_at`` pour les cours ARCHIVED legacy
    sans timestamp. À lancer une fois après la migration 0011.

    Retourne le nombre de cours mis à jour.
    """
    from django.db.models import F
    qs = Course.objects.filter(
        status=Course.Status.ARCHIVED,
        archived_at__isnull=True,
    )
    updated = qs.update(archived_at=F("updated_at"))
    return updated


__all__ = [
    "publish_course",
    "unpublish_course",
    "archive_course",
    "restore_course",
    "delete_course",
    "can_delete_course",
    "backfill_archived_at",
]
