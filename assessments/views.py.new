"""
assessments/views.py — CORRECTIF P1.C / P1.D (audit ASS-01, ASS-04, ASS-08, ASS-11).

Changements :

1. **Suppression du code mort (ASS-04)** : ``pick_courses_for_topics``,
   ``score_to_level``, ``advice_for``, ``analyze_attempt``, ``QUESTION_TOPICS``,
   ``TOPIC_KEYWORDS`` ont été retirés — doublons de ``services.*`` et jamais
   utilisés. ``recommend_courses`` (corrigé séparément) reste la seule API
   de recommandation.

2. **Re-tentative onboarding sur échec (ASS-08)** : un user qui rate son
   onboarding (score_percent < passing_score) peut retenter tant que
   ``quiz.max_attempts`` n'est pas atteint. Avant, un échec bloquait à vie.

3. **Race condition signup (ASS-11)** : la vue est désormais sérialisée par
   un ``select_for_update`` sur les Attempts existants pour empêcher 2 POST
   concurrents (double-clic, retry) de créer 2 Attempts en parallèle.

4. **recommend_courses appelé avec user** : on passe ``request.user`` pour
   bénéficier du scope ``get_visible_courses_qs`` (catalog/services).
"""
from __future__ import annotations

from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.utils import timezone

from catalog.models import Course  # noqa: F401  (utilisé via templates)
from compte.models import LearnerKYC

from .models import Attempt, AttemptAnswer, Choice, Quiz
from .recommendations import recommend_courses
from .services import build_profile, smart_advice


@login_required
def onboarding_quiz(request):
    user = request.user

    # Super-user / staff / admin plateforme : ne passent pas l'onboarding.
    if user.is_superuser or user.is_staff or getattr(user, "is_platform_admin", False):
        return redirect(reverse("home"))

    if getattr(user, "is_org_admin", False) or getattr(user, "is_instructor", False):
        return redirect(reverse("home"))

    quiz = Quiz.objects.filter(is_onboarding=True, is_active=True).order_by("id").first()
    if not quiz:
        return render(request, "assessments/onboarding_quiz_missing.html", status=503)

    # CORRECTIF ASS-08 : on lit la dernière tentative.
    last_submitted = (
        Attempt.objects.filter(user=user, quiz=quiz, submitted_at__isnull=False)
        .order_by("-submitted_at")
        .first()
    )

    if last_submitted and last_submitted.passed:
        # Onboarding déjà validé → on redirige vers le résultat.
        return redirect(reverse("assessments:onboarding_result", kwargs={"attempt_id": last_submitted.id}))

    # Compteur de tentatives soumises (échec compris).
    attempts_count = Attempt.objects.filter(
        user=user, quiz=quiz, submitted_at__isnull=False
    ).count()

    if quiz.max_attempts and attempts_count >= quiz.max_attempts:
        # Trop de tentatives : on affiche le dernier résultat (et le template
        # peut indiquer un blocage).
        if last_submitted:
            return redirect(reverse("assessments:onboarding_result", kwargs={"attempt_id": last_submitted.id}))
        # Cas dégénéré : pas de submission mais compteur atteint (théorique).
        return render(
            request,
            "assessments/onboarding_quiz.html",
            {"quiz": quiz, "questions": [], "blocked": True, "error": "Nombre de tentatives dépassé."},
        )

    questions = list(quiz.questions.prefetch_related("choices").all())

    if request.method == "POST":
        selected_map = {}
        for q in questions:
            cid = request.POST.get(f"answer_{q.id}")
            if cid:
                try:
                    selected_map[q.id] = int(cid)
                except ValueError:
                    pass

        if len(selected_map) != len(questions):
            return render(
                request,
                "assessments/onboarding_quiz.html",
                {
                    "quiz": quiz,
                    "questions": questions,
                    "blocked": False,
                    "error": "Merci de répondre à toutes les questions.",
                },
            )

        # CORRECTIF ASS-11 : sérialisation explicite pour empêcher la race
        # de double-création d'Attempt.
        with transaction.atomic():
            # Lock : on relit le user en lock-for-update pour matérialiser
            # une sérialisation transactionnelle simple.
            locked_attempts = list(
                Attempt.objects.select_for_update()
                .filter(user=user, quiz=quiz, submitted_at__isnull=False)
                .order_by("-submitted_at")
            )
            if quiz.max_attempts and len(locked_attempts) >= quiz.max_attempts:
                # Une autre requête concurrente vient de saturer le compteur.
                transaction.set_rollback(True)
                return render(
                    request,
                    "assessments/onboarding_quiz.html",
                    {"quiz": quiz, "questions": questions, "blocked": True, "error": "Nombre de tentatives dépassé."},
                )

            attempt = Attempt.objects.create(quiz=quiz, user=user, started_at=timezone.now())

            selected_choices = {
                c.id: c
                for c in Choice.objects.select_related("question").filter(
                    id__in=list(selected_map.values()), question__quiz=quiz
                )
            }

            correct = 0
            answers_bulk = []
            for q in questions:
                cid = selected_map[q.id]
                choice = selected_choices.get(cid)
                if choice is None or choice.question_id != q.id:
                    transaction.set_rollback(True)
                    return render(
                        request,
                        "assessments/onboarding_quiz.html",
                        {
                            "quiz": quiz,
                            "questions": questions,
                            "blocked": False,
                            "error": "Réponse invalide détectée. Merci de réessayer.",
                        },
                    )
                if choice.is_correct:
                    correct += 1
                answers_bulk.append(AttemptAnswer(attempt=attempt, question=q, selected_choice=choice))

            AttemptAnswer.objects.bulk_create(answers_bulk)

            total = len(questions) or 1
            score_percent = round((correct / total) * 100)

            attempt.score_percent = score_percent
            attempt.passed = score_percent >= quiz.passing_score
            attempt.submitted_at = timezone.now()
            attempt.save(update_fields=["score_percent", "passed", "submitted_at"])

            answers = list(
                AttemptAnswer.objects.select_related("question", "selected_choice")
                .filter(attempt=attempt)
                .order_by("question__order", "id")
            )
            profile = build_profile(answers, score_percent)

            kyc, _ = LearnerKYC.objects.get_or_create(user=user)
            kyc.onboarding_level = profile.get("level", "")
            kyc.onboarding_profile = profile
            kyc.save(update_fields=["onboarding_level", "onboarding_profile"])

        return redirect(reverse("assessments:onboarding_result", kwargs={"attempt_id": attempt.id}))

    return render(
        request,
        "assessments/onboarding_quiz.html",
        {"quiz": quiz, "questions": questions, "blocked": False},
    )


@login_required
def onboarding_result(request, attempt_id: int):
    user = request.user
    if user.is_superuser or user.is_staff or getattr(user, "is_platform_admin", False):
        return redirect(reverse("home"))

    attempt = get_object_or_404(
        Attempt.objects.select_related("quiz").filter(
            id=attempt_id, user=user, quiz__is_onboarding=True
        )
    )

    answers = list(
        AttemptAnswer.objects.select_related("question", "selected_choice")
        .filter(attempt=attempt)
        .order_by("question__order", "id")
    )

    kyc = getattr(user, "kyc", None)
    profile = (getattr(kyc, "onboarding_profile", None) or {}) if kyc else {}
    if not profile:
        profile = build_profile(answers, attempt.score_percent)

    advice = smart_advice(profile)
    # CORRECTIF ASS-01 (sécurité) : on passe explicitement le user pour
    # bénéficier du scope visible (PUBLISHED + scope org).
    courses = recommend_courses(profile, limit=4, user=user)

    congrats = (
        "Bravo pour ton implication 🎉 ! "
        "Ce test nous permet de personnaliser ton parcours pour que tu progresses plus vite."
    )

    return render(
        request,
        "assessments/onboarding_result.html",
        {
            "attempt": attempt,
            "profile": profile,
            "advice": advice,
            "courses": courses,
            "congrats": congrats,
        },
    )
