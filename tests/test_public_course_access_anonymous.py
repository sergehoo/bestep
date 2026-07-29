"""F3 — Accès public à la fiche cours sans authentification.

Vérifie que :

1. GET /api/public/courses/               → 200 en anonyme (catalogue)
2. GET /api/public/courses/<slug>/        → 200 en anonyme (fiche)
3. GET /api/learner/enrollments/          → 401 en anonyme (protégé, OK)
4. Le contrat (200 vs 401) est stable même après le rerun (pas de session
   Django parasite qui viendrait déclencher CSRF).

Historique : un visiteur anonyme se voyait rediriger vers /login au clic
sur une formation parce que le front appelait /api/learner/enrollments/
et l'intercepteur axios interprétait le 401 comme "session expirée".
Le fix côté back est de garantir que la fiche cours reste publique et
que l'endpoint learner reste bien 401 (non 403) sans effet de bord.
"""

from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from catalog.models import Course, CourseSection, Lesson
from compte.models import InstructorProfile

User = get_user_model()


@pytest.fixture
def instructor(db):
    user = User.objects.create_user(
        email="pub-visitor-instructor@example.com",
        password="StrongPa$$word12",
        is_email_verified=True,
    )
    InstructorProfile.objects.create(user=user)
    return user


@pytest.fixture
def published_course(instructor):
    course = Course.objects.create(
        title="Cours public visitable",
        subtitle="Description publique",
        instructor=instructor,
        status=Course.Status.PUBLISHED,
    )
    section = CourseSection.objects.create(course=course, title="Chapitre 1", order=1)
    Lesson.objects.create(
        section=section,
        title="Leçon 1 — aperçu",
        order=1,
        is_preview=True,
    )
    Lesson.objects.create(
        section=section,
        title="Leçon 2 — verrouillée",
        order=2,
        is_preview=False,
    )
    return course


@pytest.fixture
def anon_client():
    """Client DRF strictement anonyme (aucune session, aucun header auth)."""
    return APIClient()


def test_public_course_list_accessible_to_anonymous(anon_client, published_course):
    response = anon_client.get("/api/public/courses/")
    assert response.status_code == 200, response.content
    # Le cours publié doit être renvoyé dans la liste (envelope paginé ou
    # tableau direct, on gère les deux).
    payload = response.json()
    items = payload.get("results", payload) if isinstance(payload, dict) else payload
    slugs = [item.get("slug") for item in items]
    assert published_course.slug in slugs, f"slug {published_course.slug} absent de {slugs!r}"


def test_public_course_detail_accessible_to_anonymous(anon_client, published_course):
    response = anon_client.get(f"/api/public/courses/{published_course.slug}/")
    assert response.status_code == 200, response.content
    data = response.json()
    assert data["slug"] == published_course.slug
    # La fiche doit exposer les infos descriptives publiques.
    assert "title" in data
    assert "sections" in data
    # Vérifie qu'on obtient bien le programme complet (chapitres + leçons)
    # mais que les contenus verrouillés ne fuitent PAS de vidéo/quiz.
    assert len(data["sections"]) >= 1
    section = data["sections"][0]
    assert len(section["lessons"]) == 2
    preview_lesson = next(l for l in section["lessons"] if l["is_preview"])
    locked_lesson = next(l for l in section["lessons"] if not l["is_preview"])
    # Les métadonnées (titre, durée, is_preview) sont publiques…
    assert preview_lesson["title"]
    assert locked_lesson["title"]
    # …mais aucun contenu vidéo brut d'une leçon verrouillée ne doit
    # être renvoyé en clair au visiteur (contenu = le champ HTML long
    # de la leçon, qui n'est jamais dans la fiche publique).
    assert "content" not in locked_lesson
    assert "video_url" not in locked_lesson


def test_learner_enrollments_requires_auth(anon_client):
    """Régression F3 : ce endpoint DOIT renvoyer 401 pour un anonyme.

    Côté front, useLearnerEnrollments est désactivé quand l'utilisateur
    n'est pas connecté (voir hooks/player.ts), mais on garde le contrat
    back-end explicite : anonyme → 401, sans redirection ni CSRF.
    """
    response = anon_client.get("/api/learner/enrollments/")
    assert response.status_code == 401, response.content


def test_public_course_detail_stable_across_reruns(anon_client, published_course):
    """Régression : deux GETs anonymes consécutifs doivent tous deux
    renvoyer 200. Un état de session résiduel après le premier appel ne
    doit pas modifier la réponse du deuxième.
    """
    r1 = anon_client.get(f"/api/public/courses/{published_course.slug}/")
    r2 = anon_client.get(f"/api/public/courses/{published_course.slug}/")
    assert r1.status_code == 200 and r2.status_code == 200
    assert r1.json()["slug"] == r2.json()["slug"] == published_course.slug
