"""Régression : le contenu de leçon doit être assaini à l'ÉCRITURE.

Contexte (QA du 2026-08-06, branche chore/audit-remediation-2026-05).

Un premier correctif XSS avait ajouté ``validate_content`` à
``best_epargne.apis.serializers.LessonSerializer``. Il ne servait à rien sur
le chemin réel : ``InstructorLessonCreateView`` et
``InstructorLessonUpdateView`` sont des ``APIView`` qui écrivent directement
en base depuis ``request.data``. ``LessonSerializer`` n'y est utilisé que
pour **formater la réponse**, jamais pour valider l'entrée.

Résultat : la charge arrivait brute en base par le chemin d'écriture
principal du formateur, alors que les tests de serializer passaient au vert.

La leçon générale : un hook ``validate_*`` ne protège que les vues qui font
réellement passer la donnée par le serializer. Ces tests tapent donc sur les
**endpoints**, pas sur le serializer.

Lancer : `pytest tests/test_lesson_content_sanitization.py -v`
"""
from __future__ import annotations

import json

import pytest
from rest_framework.test import APIClient

from catalog.models import Category, Course, CourseSection, Lesson
from compte.models import InstructorProfile, User

CHARGE = (
    "<p>Leçon <strong>légitime</strong>.</p>"
    "<img src=x onerror=alert(1)>"
    "<script>alert(2)</script>"
    "<a href=\"javascript:alert(3)\">clic</a>"
)


@pytest.fixture
def formateur(db):
    u = User.objects.create_user(
        email="regression.lesson@example.com",
        password="Sans-Importance-Ici-1",
        full_name="Regression Formateur",
    )
    # IsEmailVerified garde tous les endpoints formateur (code
    # EMAIL_NOT_VERIFIED). Sans ça la fixture reçoit un 403 et le test
    # passerait à côté de ce qu'il veut vérifier.
    u.is_email_verified = True
    u.save(update_fields=["is_email_verified"])
    InstructorProfile.objects.get_or_create(user=u, defaults={"is_verified": True})
    return u


@pytest.fixture
def section(db, formateur):
    cat = Category.objects.first()
    course = Course.objects.create(
        title="Cours régression contenu",
        instructor=formateur,
        category=cat,
        status="DRAFT",
    )
    return CourseSection.objects.create(course=course, title="Section", order=1)


@pytest.fixture
def client_formateur(formateur):
    c = APIClient()
    c.force_authenticate(user=formateur)
    return c


def _assert_inerte(html: str) -> None:
    assert "<script" not in html.lower(), f"balise script persistée : {html!r}"
    assert "onerror" not in html.lower(), f"handler onerror persisté : {html!r}"
    assert "javascript:" not in html.lower().replace(" ", ""), (
        f"URI javascript: persistée : {html!r}"
    )
    assert "<strong>" in html, (
        f"la mise en forme légitime a été détruite : {html!r}"
    )


@pytest.mark.django_db
def test_creation_assainit_le_contenu(client_formateur, section):
    """Le chemin qui écrivait brut : APIView.post -> Lesson.objects.create."""
    url = (
        f"/api/instructor/courses/{section.course_id}"
        f"/sections/{section.id}/lessons/create/"
    )
    r = client_formateur.post(
        url,
        data=json.dumps(
            {"title": "L1", "lesson_type": "ARTICLE", "content": CHARGE, "duration_sec": 60}
        ),
        content_type="application/json",
    )
    assert r.status_code == 201, r.content

    # On vérifie la BASE, pas la réponse : c'est ce qui sera resservi ensuite.
    en_base = Lesson.objects.get(pk=r.json()["id"]).content
    _assert_inerte(en_base)


@pytest.mark.django_db
def test_mise_a_jour_assainit_le_contenu(client_formateur, section):
    """La boucle setattr assignait `content` brut, comme la création."""
    lesson = Lesson.objects.create(
        section=section, title="L2", lesson_type="ARTICLE", order=1, content="<p>sain</p>"
    )
    url = (
        f"/api/instructor/courses/{section.course_id}"
        f"/sections/{section.id}/lessons/{lesson.id}/update/"
    )
    r = client_formateur.post(
        url, data=json.dumps({"content": CHARGE}), content_type="application/json"
    )
    assert r.status_code == 200, r.content

    lesson.refresh_from_db()
    _assert_inerte(lesson.content)


@pytest.mark.django_db
def test_contenu_vide_ne_casse_pas(client_formateur, section):
    """`sanitize_rich_html(None)` doit rendre "" et non planter : l'ancien
    code utilisait `or ""`, le nouveau passe la valeur telle quelle."""
    url = (
        f"/api/instructor/courses/{section.course_id}"
        f"/sections/{section.id}/lessons/create/"
    )
    r = client_formateur.post(
        url,
        data=json.dumps({"title": "L3", "lesson_type": "VIDEO", "duration_sec": 10}),
        content_type="application/json",
    )
    assert r.status_code == 201, r.content
    assert Lesson.objects.get(pk=r.json()["id"]).content == ""
