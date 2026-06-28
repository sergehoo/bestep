"""
core/constants.py — P4.1 : Constantes métier centralisées.

Source de vérité unique pour les statuts, ensembles de rôles, et autres
constantes transverses référencées par plusieurs apps. Évite les drifts
quand un statut change (ex : ajout d'un PENDING_REFUND sur Order).

Convention : on RE-EXPORTE les TextChoices définis sur les modèles
plutôt que de les redéfinir. Si un modèle ajoute/retire un état, la
constante centralisée bouge automatiquement. Pas de duplication.

Ensembles dérivés (ex : ``COURSE_ACTIVE_STATUSES``) qui sont utilisés
dans plusieurs services (visibility, filtering, lifecycle) sont
explicitement nommés ici plutôt que d'être inline avec des
``filter(status__in=[...])`` magiques.

Usage :

    from core.constants import (
        CourseStatus,
        COURSE_VISIBLE_TO_PUBLIC,
        OrgRole,
        ORG_ADMIN_ROLES,
    )

    qs = Course.objects.filter(status__in=COURSE_VISIBLE_TO_PUBLIC)
"""
from __future__ import annotations

# ─────────────────────────────────────────────────────────────────────
# Course statuses (re-export depuis catalog.models.Course.Status)
# ─────────────────────────────────────────────────────────────────────

def _course_status_class():
    """Import paresseux pour éviter les cycles."""
    from catalog.models import Course
    return Course.Status


class CourseStatus:
    """
    Façade vers ``Course.Status`` exposable sans import lourd.

    Attributs accessibles : DRAFT, REVIEW, PUBLISHED, ARCHIVED + ``choices``.

    Utilisation :

        from core.constants import CourseStatus
        course.status = CourseStatus.PUBLISHED
        Course.objects.filter(status=CourseStatus.PUBLISHED)
    """
    # Chaînes brutes pour les comparaisons et filter() — on évite le runtime
    # import de Course pour ne PAS provoquer Django apps not ready au boot.
    DRAFT = "DRAFT"
    REVIEW = "REVIEW"
    PUBLISHED = "PUBLISHED"
    ARCHIVED = "ARCHIVED"

    @classmethod
    def choices(cls):
        return _course_status_class().choices

    @classmethod
    def values(cls):
        return [cls.DRAFT, cls.REVIEW, cls.PUBLISHED, cls.ARCHIVED]


#: Statuts visibles sur la landing publique / catalogue public.
COURSE_VISIBLE_TO_PUBLIC = frozenset({CourseStatus.PUBLISHED})

#: Statuts qui acceptent encore l'inscription (utile pour bloquer
#: les inscriptions sur ARCHIVED).
COURSE_ENROLLABLE_STATUSES = frozenset({CourseStatus.PUBLISHED})

#: Statuts qui sont des "brouillons" / pré-publication (utile pour
#: lister les cours en cours d'élaboration côté instructor).
COURSE_DRAFT_STATUSES = frozenset({CourseStatus.DRAFT, CourseStatus.REVIEW})

#: Tous les statuts non-supprimés (ARCHIVED = soft-delete logique).
COURSE_NON_ARCHIVED_STATUSES = frozenset(
    {CourseStatus.DRAFT, CourseStatus.REVIEW, CourseStatus.PUBLISHED}
)


# ─────────────────────────────────────────────────────────────────────
# Enrollment statuses
# ─────────────────────────────────────────────────────────────────────

class EnrollmentStatus:
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"
    CANCELED = "CANCELED"

    @classmethod
    def choices(cls):
        from enrollments.models import Enrollment
        return Enrollment.Status.choices

    @classmethod
    def values(cls):
        return [cls.ACTIVE, cls.COMPLETED, cls.CANCELED]


#: Inscriptions actives ou complétées (utiles pour le décompte
#: "courses suivis", filtrage non-CANCELED).
ENROLLMENT_NOT_CANCELED = frozenset({EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED})


# ─────────────────────────────────────────────────────────────────────
# Payment / Order / Transaction statuses
# ─────────────────────────────────────────────────────────────────────

class PaymentStatus:
    PENDING = "PENDING"
    PAID = "PAID"
    FAILED = "FAILED"
    CANCELED = "CANCELED"
    REFUNDED = "REFUNDED"

    @classmethod
    def values(cls):
        return [cls.PENDING, cls.PAID, cls.FAILED, cls.CANCELED, cls.REFUNDED]


PAYMENT_SUCCESSFUL = frozenset({PaymentStatus.PAID})
PAYMENT_TERMINAL = frozenset({
    PaymentStatus.PAID,
    PaymentStatus.FAILED,
    PaymentStatus.CANCELED,
    PaymentStatus.REFUNDED,
})


class OrderStatus:
    DRAFT = "DRAFT"
    PENDING = "PENDING"
    PAID = "PAID"
    FAILED = "FAILED"
    CANCELED = "CANCELED"
    REFUND_PENDING = "REFUND_PENDING"
    REFUND_FAILED = "REFUND_FAILED"
    REFUNDED = "REFUNDED"


ORDER_OPEN = frozenset({OrderStatus.DRAFT, OrderStatus.PENDING})
ORDER_PAID = frozenset({OrderStatus.PAID})
ORDER_REFUND_FLOW = frozenset({
    OrderStatus.REFUND_PENDING,
    OrderStatus.REFUND_FAILED,
    OrderStatus.REFUNDED,
})


# ─────────────────────────────────────────────────────────────────────
# Organization roles
# ─────────────────────────────────────────────────────────────────────

class OrgRole:
    OWNER = "OWNER"
    ADMIN = "ADMIN"
    MANAGER = "MANAGER"
    INSTRUCTOR = "INSTRUCTOR"
    LEARNER = "LEARNER"


#: Rôles qui peuvent administrer une org (settings, membres, suppression).
ORG_ADMIN_ROLES = frozenset({OrgRole.OWNER, OrgRole.ADMIN})

#: Rôles qui peuvent inviter / gérer le contenu pédagogique d'une org.
ORG_MANAGER_ROLES = frozenset({OrgRole.OWNER, OrgRole.ADMIN, OrgRole.MANAGER})

#: Rôles qui ont accès "instructor" dans une org (création de cours,
#: médiathèque).
ORG_TEACHING_ROLES = frozenset({
    OrgRole.OWNER, OrgRole.ADMIN, OrgRole.MANAGER, OrgRole.INSTRUCTOR
})

#: Tous les rôles avec un siège payant (pour le décompte license seats).
ORG_BILLABLE_ROLES = frozenset({
    OrgRole.INSTRUCTOR, OrgRole.LEARNER
})


# ─────────────────────────────────────────────────────────────────────
# Platform roles
# ─────────────────────────────────────────────────────────────────────

class PlatformRole:
    USER = "USER"
    PLATFORM_ADMIN = "PLATFORM_ADMIN"


# ─────────────────────────────────────────────────────────────────────
# Workspace identifiers (pour le multi-rôle UI)
# ─────────────────────────────────────────────────────────────────────

class Workspace:
    LEARNER = "learner"
    INSTRUCTOR = "instructor"
    ORG = "org"
    PLATFORM_ADMIN = "platform_admin"


WORKSPACE_VALUES = frozenset({
    Workspace.LEARNER,
    Workspace.INSTRUCTOR,
    Workspace.ORG,
    Workspace.PLATFORM_ADMIN,
})


# ─────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────

def is_valid_course_status(value: str) -> bool:
    """Test un statut de cours arbitraire (ex : depuis ``request.GET``)."""
    return value in CourseStatus.values()


def is_valid_org_role(value: str) -> bool:
    return value in {
        OrgRole.OWNER, OrgRole.ADMIN, OrgRole.MANAGER,
        OrgRole.INSTRUCTOR, OrgRole.LEARNER,
    }


__all__ = [
    # Course
    "CourseStatus",
    "COURSE_VISIBLE_TO_PUBLIC",
    "COURSE_ENROLLABLE_STATUSES",
    "COURSE_DRAFT_STATUSES",
    "COURSE_NON_ARCHIVED_STATUSES",
    # Enrollment
    "EnrollmentStatus",
    "ENROLLMENT_NOT_CANCELED",
    # Payment / Order
    "PaymentStatus",
    "PAYMENT_SUCCESSFUL",
    "PAYMENT_TERMINAL",
    "OrderStatus",
    "ORDER_OPEN",
    "ORDER_PAID",
    "ORDER_REFUND_FLOW",
    # Roles
    "OrgRole",
    "ORG_ADMIN_ROLES",
    "ORG_MANAGER_ROLES",
    "ORG_TEACHING_ROLES",
    "ORG_BILLABLE_ROLES",
    "PlatformRole",
    # Workspace
    "Workspace",
    "WORKSPACE_VALUES",
    # Helpers
    "is_valid_course_status",
    "is_valid_org_role",
]
