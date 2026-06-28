"""Tests V_FIN.A — Quiz is_final + clean() (ASS-16, CERT-05)."""
from __future__ import annotations

import pytest


@pytest.mark.django_db
def test_quiz_onboarding_with_course_raises(alice):
    """ASS-16 : un quiz d'onboarding ne peut pas être rattaché à un cours."""
    from django.core.exceptions import ValidationError

    from assessments.models import Quiz
    from catalog.models import Course

    course = Course.objects.create(
        title="c", slug="c", status=Course.Status.PUBLISHED, instructor=alice,
    )
    quiz = Quiz(title="Bad onboarding", is_onboarding=True, course=course)
    with pytest.raises(ValidationError):
        quiz.full_clean()


@pytest.mark.django_db
def test_quiz_is_final_unique_per_course(alice):
    """CERT-05 : un seul Quiz is_final=True par cours (UniqueConstraint partielle)."""
    from django.db.utils import IntegrityError

    from assessments.models import Quiz
    from catalog.models import Course

    course = Course.objects.create(
        title="d", slug="d", status=Course.Status.PUBLISHED, instructor=alice,
    )
    Quiz.objects.create(title="Final 1", course=course, is_final=True, passing_score=70)
    with pytest.raises(IntegrityError):
        Quiz.objects.create(title="Final 2", course=course, is_final=True, passing_score=70)


@pytest.mark.django_db
def test_quiz_is_final_requires_course(alice):
    """clean() : is_final=True sans course doit lever ValidationError."""
    from django.core.exceptions import ValidationError

    from assessments.models import Quiz

    quiz = Quiz(title="Orphan final", is_final=True)
    with pytest.raises(ValidationError):
        quiz.full_clean()


@pytest.mark.django_db
def test_attempt_answer_snapshot_preserves_text(alice):
    """ASS-11 : snapshot du choix au moment de la réponse, persiste si Choice supprimé."""
    from assessments.models import Attempt, AttemptAnswer, Choice, Question, Quiz
    from catalog.models import Course

    course = Course.objects.create(title="e", slug="e", status=Course.Status.PUBLISHED, instructor=alice)
    quiz = Quiz.objects.create(title="Q", course=course)
    q = Question.objects.create(quiz=quiz, prompt="Question 1", order=1)
    c = Choice.objects.create(question=q, text="Bonne réponse texte", is_correct=True)
    attempt = Attempt.objects.create(quiz=quiz, user=alice)
    ans = AttemptAnswer.objects.create(attempt=attempt, question=q, selected_choice=c)
    assert ans.selected_text_snapshot == "Bonne réponse texte"

    # Suppression du Choice : le snapshot survit.
    c.delete()
    ans.refresh_from_db()
    assert ans.selected_text_snapshot == "Bonne réponse texte"
    assert ans.selected_choice_id is None
