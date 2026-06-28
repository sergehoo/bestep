"""
tests/test_p6_workflows_e2e.py — Workflows end-to-end (P6.1).

Tests d'intégration qui couvrent les **parcours business critiques** :

1. Workflow Instructor : crée → édite → publie → cours visible → dépublie
2. Workflow Learner : voit catalogue → s'inscrit → suit → marque complete
3. Workflow Lifecycle : publication / dépublication / archivage / restauration
   avec vérification des Enrollments préservés
4. Workflow Permissions : seul l'instructor / admin peut transitionner

Ces tests valident les contrats entre les phases :
  - P1 (cycle de vie cours)
  - P3 (permissions)
  - P4 (perf / aggregates)

Approche : pas de Client HTTP (lourd), tests directs sur les services
applicatifs (``catalog.lifecycle``, ``catalog.services``). Les endpoints
HTTP sont couverts par les smoke tests de prod (``deploy/smoke_prod.sh``).
"""
from __future__ import annotations

import pytest
from django.core.exceptions import PermissionDenied, ValidationError

from catalog.lifecycle import (
    archive_course,
    publish_course,
    restore_course,
    unpublish_course,
)
from catalog.models import Course, CourseLifecycleEvent, CourseSection, Lesson
from catalog.services import get_visible_courses_qs


# ─────────────────────────────────────────────────────────────────────
# Fixtures partagées
# ─────────────────────────────────────────────────────────────────────

@pytest.fixture
def instructor(make_user):
    return make_user(email="instructor.e2e@example.com")


@pytest.fixture
def learner(make_user):
    return make_user(email="learner.e2e@example.com")


@pytest.fixture
def admin(make_user):
    from compte.models import User
    return make_user(
        email="admin.e2e@example.com",
        is_superuser=True,
        is_staff=True,
        platform_role=User.PlatformRole.PLATFORM_ADMIN,
    )


@pytest.fixture
def publishable_course(instructor, db):
    """Cours DRAFT complet, prêt à être publié."""
    course = Course.objects.create(
        title="Investir en bourse — guide complet",
        subtitle="De zéro à investisseur en 12 leçons",
        instructor=instructor,
        status=Course.Status.DRAFT,
    )
    for i in range(2):
        section = CourseSection.objects.create(
            course=course, title=f"Module {i + 1}", order=i + 1
        )
        for j in range(3):
            Lesson.objects.create(
                section=section,
                title=f"Leçon {i + 1}.{j + 1}",
                order=j + 1,
                lesson_type="TEXT",
                content=f"<p>Contenu leçon {i + 1}.{j + 1}</p>",
            )
    return course


# ─────────────────────────────────────────────────────────────────────
# Workflow 1 : Instructor crée → publie → visible publique
# ─────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_instructor_creates_and_publishes_course(instructor, publishable_course):
    """Le cours apparaît dans le catalogue public dès la publication."""
    # 1. État initial : DRAFT, invisible publiquement
    assert publishable_course.status == Course.Status.DRAFT
    public_qs = get_visible_courses_qs(None, public_only=True)
    assert not public_qs.filter(pk=publishable_course.pk).exists()

    # 2. Publish
    publish_course(publishable_course, actor=instructor)
    publishable_course.refresh_from_db()
    assert publishable_course.status == Course.Status.PUBLISHED
    assert publishable_course.published_at is not None

    # 3. Visible publiquement
    public_qs = get_visible_courses_qs(None, public_only=True)
    assert public_qs.filter(pk=publishable_course.pk).exists(), (
        "Cours publié non visible dans le catalogue public !"
    )

    # 4. Audit log créé
    events = CourseLifecycleEvent.objects.filter(course=publishable_course)
    assert events.count() == 1
    assert events.first().action == "PUBLISHED"


@pytest.mark.django_db
def test_unpublish_removes_from_public_catalog(instructor, publishable_course):
    """Dépublier retire immédiatement du catalogue public."""
    publish_course(publishable_course, actor=instructor)
    assert get_visible_courses_qs(None, public_only=True).filter(
        pk=publishable_course.pk
    ).exists()

    unpublish_course(publishable_course, actor=instructor)
    publishable_course.refresh_from_db()
    assert publishable_course.status == Course.Status.DRAFT
    # Visibilité publique : doit disparaître immédiatement
    assert not get_visible_courses_qs(None, public_only=True).filter(
        pk=publishable_course.pk
    ).exists()
    # published_at préservé pour traçabilité
    assert publishable_course.published_at is not None


@pytest.mark.django_db
def test_republish_reactivates_visibility(instructor, publishable_course):
    """Republier après dépublication remet visible immédiatement."""
    publish_course(publishable_course, actor=instructor)
    unpublish_course(publishable_course, actor=instructor)
    publish_course(publishable_course, actor=instructor)
    publishable_course.refresh_from_db()
    assert publishable_course.status == Course.Status.PUBLISHED
    assert get_visible_courses_qs(None, public_only=True).filter(
        pk=publishable_course.pk
    ).exists()
    # 3 events dans l'audit log : 2 PUBLISHED + 1 UNPUBLISHED
    events = list(
        CourseLifecycleEvent.objects.filter(course=publishable_course)
        .order_by("created_at").values_list("action", flat=True)
    )
    assert events == ["PUBLISHED", "UNPUBLISHED", "PUBLISHED"]


# ─────────────────────────────────────────────────────────────────────
# Workflow 2 : Learner s'inscrit + suit le cours
# ─────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_learner_enrolls_after_publication(instructor, learner, publishable_course):
    """Un apprenant peut s'inscrire dès qu'un cours est publié."""
    from enrollments.models import Enrollment

    publish_course(publishable_course, actor=instructor)

    enrollment = Enrollment.objects.create(
        user=learner,
        course=publishable_course,
        status=Enrollment.Status.ACTIVE,
    )
    assert enrollment.user == learner
    assert enrollment.course == publishable_course
    assert enrollment.status == Enrollment.Status.ACTIVE


@pytest.mark.django_db
def test_archived_course_preserves_existing_enrollments(
    instructor, learner, publishable_course
):
    """Archiver un cours ne supprime pas les inscriptions existantes."""
    from enrollments.models import Enrollment

    publish_course(publishable_course, actor=instructor)
    enrollment = Enrollment.objects.create(
        user=learner,
        course=publishable_course,
        status=Enrollment.Status.ACTIVE,
    )

    # Archive le cours
    archive_course(publishable_course, actor=instructor)
    publishable_course.refresh_from_db()
    assert publishable_course.status == Course.Status.ARCHIVED
    assert publishable_course.archived_at is not None

    # L'enrollment doit toujours exister et être ACTIVE
    enrollment.refresh_from_db()
    assert enrollment.status == Enrollment.Status.ACTIVE
    assert Enrollment.objects.filter(
        user=learner, course=publishable_course
    ).exists()


# ─────────────────────────────────────────────────────────────────────
# Workflow 3 : Permissions par rôle
# ─────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_other_user_cannot_publish_someone_elses_course(
    learner, publishable_course
):
    """Un apprenant ne peut PAS publier un cours qui n'est pas le sien."""
    with pytest.raises(PermissionDenied):
        publish_course(publishable_course, actor=learner)


@pytest.mark.django_db
def test_admin_can_publish_any_course(admin, publishable_course):
    """Un admin plateforme peut publier n'importe quel cours."""
    publish_course(publishable_course, actor=admin)
    publishable_course.refresh_from_db()
    assert publishable_course.status == Course.Status.PUBLISHED


@pytest.mark.django_db
def test_anonymous_cannot_transition(publishable_course):
    """Un user anonyme ne peut PAS faire de transition."""
    from django.contrib.auth.models import AnonymousUser
    with pytest.raises(PermissionDenied):
        publish_course(publishable_course, actor=AnonymousUser())


# ─────────────────────────────────────────────────────────────────────
# Workflow 4 : Validations métier
# ─────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_cannot_publish_course_without_sections(instructor, db):
    """Un cours sans section ne peut PAS être publié."""
    course = Course.objects.create(
        title="Cours incomplet",
        instructor=instructor,
        status=Course.Status.DRAFT,
    )
    with pytest.raises(ValidationError):
        publish_course(course, actor=instructor)


@pytest.mark.django_db
def test_archive_restore_cycle_resets_to_draft(instructor, publishable_course):
    """Le cycle archive → restore remet le cours en DRAFT (jamais directement publié)."""
    publish_course(publishable_course, actor=instructor)
    archive_course(publishable_course, actor=instructor)
    restore_course(publishable_course, actor=instructor)
    publishable_course.refresh_from_db()
    assert publishable_course.status == Course.Status.DRAFT
    assert publishable_course.archived_at is None


# ─────────────────────────────────────────────────────────────────────
# Workflow 5 : Préférences utilisateur (P3)
# ─────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_user_signup_creates_preferences_automatically(make_user):
    """Le signal post_save User crée auto les UserPreferences."""
    from compte.models import UserPreferences

    user = make_user(email="signup.e2e@example.com")
    assert UserPreferences.objects.filter(user=user).exists()

    prefs = user.preferences
    assert prefs.theme == UserPreferences.Theme.SYSTEM
    assert prefs.language == UserPreferences.Language.FR
    assert prefs.notifications_email is True
    assert prefs.notifications_marketing is False


# ─────────────────────────────────────────────────────────────────────
# Workflow 6 : Idempotence
# ─────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_double_publish_is_idempotent(instructor, publishable_course):
    """Publier 2× le même cours ne crée qu'1 event d'audit (le second est silencieux)."""
    publish_course(publishable_course, actor=instructor)
    publish_course(publishable_course, actor=instructor)  # idempotent

    # 1 seul event PUBLISHED (le second appel return immédiat sans log).
    events = CourseLifecycleEvent.objects.filter(
        course=publishable_course, action="PUBLISHED"
    )
    assert events.count() == 1
