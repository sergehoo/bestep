from __future__ import annotations
from collections import Counter
from typing import Dict, List, Tuple

from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.shortcuts import render, redirect, get_object_or_404
from django.urls import reverse
from django.utils import timezone

from compte.models import LearnerKYC
from .models import Quiz, Attempt, AttemptAnswer, Choice
from catalog.models import Course
from .recommendations import recommend_courses
from .services import build_profile, smart_advice

QUESTION_TOPICS: Dict[int, str] = {
    # question_id: "budget",
    # 12: "budget",
    # 13: "epargne",
    # 14: "investissement",
    # 15: "credit",
}


TOPIC_KEYWORDS: Dict[str, List[str]] = {
    "budget": ["budget", "dépenses", "revenu", "gestion", "planifier"],
    "epargne": ["épargne", "économiser", "côté", "fonds", "urgence"],
    "investissement": ["investir", "placement", "rendement", "actions", "obligations"],
    "credit": ["crédit", "dette", "intérêt", "emprunt", "mensualité"],
    "macro": ["inflation", "taux", "banque centrale", "croissance"],
}


def score_to_level(score_percent: int) -> str:
    if score_percent < 40:
        return "Débutant"
    if score_percent < 70:
        return "Intermédiaire"
    return "Avancé"


def advice_for(level: str, top_topics: List[str]) -> str:
    if level == "Débutant":
        return (
            "Commence par consolider les bases. "
            f"Priorité : {', '.join(top_topics) if top_topics else 'les fondamentaux'}."
        )
    if level == "Intermédiaire":
        return (
            "Tu as de bonnes bases. "
            f"Pour progresser vite, approfondis : {', '.join(top_topics) if top_topics else 'des cas pratiques'}."
        )
    return (
        "Excellent niveau ! "
        f"Tu peux te concentrer sur : {', '.join(top_topics) if top_topics else 'des projets avancés'}."
    )

def pick_courses_for_topics(topics, limit=4):
    from catalog.models import Course

    qs = Course.objects.all()
    matched = []

    for topic in topics:
        sub = qs.filter(title__icontains=topic)
        for c in sub:
            if c.id not in matched:
                matched.append(c.id)
            if len(matched) >= limit:
                break

    if len(matched) < limit:
        extra = qs.order_by("-id").values_list("id", flat=True)
        for cid in extra:
            if cid not in matched:
                matched.append(cid)
            if len(matched) >= limit:
                break

    courses = list(Course.objects.filter(id__in=matched))
    by_id = {c.id: c for c in courses}
    return [by_id[i] for i in matched if i in by_id][:limit]

def analyze_attempt(answers: List[AttemptAnswer], score_percent: int) -> Tuple[str, List[str], str]:
    level = score_to_level(score_percent)

    counter = Counter()
    for a in answers:
        if not a.question.topic:
            continue
        if a.selected_choice and a.selected_choice.is_correct:
            counter[a.question.topic] += 2
        else:
            counter[a.question.topic] += 1

    top_topics = [t for t, _ in counter.most_common(3)]
    advice = advice_for(level, top_topics)

    return level, top_topics, advice

@login_required
def onboarding_quiz(request):
    user = request.user

    # ✅ superadmin/staff ignore
    if user.is_superuser or user.is_staff or getattr(user, "role", None) == "SUPERADMIN":
        return redirect(reverse("home"))

    if getattr(user, "role", None) != "LEARNER":
        return redirect(reverse("home"))

    quiz = Quiz.objects.filter(is_onboarding=True, is_active=True).order_by("id").first()
    if not quiz:
        return render(request, "assessments/onboarding_quiz_missing.html", status=503)

    done = Attempt.objects.filter(user=user, quiz=quiz, submitted_at__isnull=False).order_by("-submitted_at").first()
    if done:
        return redirect(reverse("assessments:onboarding_result", kwargs={"attempt_id": done.id}))

    questions = quiz.questions.prefetch_related("choices").all()

    if request.method == "POST":
        selected_map = {}
        for q in questions:
            cid = request.POST.get(f"answer_{q.id}")
            if cid:
                try:
                    selected_map[q.id] = int(cid)
                except ValueError:
                    pass

        if len(selected_map) != questions.count():
            return render(request, "assessments/onboarding_quiz.html", {
                "quiz": quiz,
                "questions": questions,
                "blocked": False,
                "error": "Merci de répondre à toutes les questions.",
            })

        with transaction.atomic():
            attempt = Attempt.objects.create(quiz=quiz, user=user, started_at=timezone.now())

            selected_choices = {
                c.id: c for c in Choice.objects.select_related("question")
                .filter(id__in=list(selected_map.values()), question__quiz=quiz)
            }

            correct = 0
            answers_bulk = []
            for q in questions:
                cid = selected_map[q.id]
                choice = selected_choices.get(cid)

                if choice is None or choice.question_id != q.id:
                    transaction.set_rollback(True)
                    return render(request, "assessments/onboarding_quiz.html", {
                        "quiz": quiz,
                        "questions": questions,
                        "blocked": False,
                        "error": "Réponse invalide détectée. Merci de réessayer.",
                    })

                if choice.is_correct:
                    correct += 1

                answers_bulk.append(AttemptAnswer(attempt=attempt, question=q, selected_choice=choice))

            AttemptAnswer.objects.bulk_create(answers_bulk)

            total = questions.count() or 1
            score_percent = round((correct / total) * 100)

            attempt.score_percent = score_percent
            attempt.passed = score_percent >= quiz.passing_score
            attempt.submitted_at = timezone.now()
            attempt.save(update_fields=["score_percent", "passed", "submitted_at"])

            # ✅ Construire profil + sauvegarder dans LearnerKYC
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

    return render(request, "assessments/onboarding_quiz.html", {
        "quiz": quiz,
        "questions": questions,
        "blocked": False,
    })


@login_required
def onboarding_result(request, attempt_id: int):
    user = request.user

    if user.is_superuser or user.is_staff or getattr(user, "role", None) == "SUPERADMIN":
        return redirect(reverse("home"))

    attempt = get_object_or_404(
        Attempt.objects.select_related("quiz").filter(id=attempt_id, user=user, quiz__is_onboarding=True)
    )

    answers = list(
        AttemptAnswer.objects.select_related("question", "selected_choice")
        .filter(attempt=attempt)
        .order_by("question__order", "id")
    )

    # Profil depuis DB (kyc) si dispo, sinon recalcul
    kyc = getattr(user, "kyc", None)
    profile = (getattr(kyc, "onboarding_profile", None) or {}) if kyc else {}
    if not profile:
        from .services import build_profile
        profile = build_profile(answers, attempt.score_percent)

    advice = smart_advice(profile)
    courses = recommend_courses(profile, limit=4)

    congrats = (
        "Bravo pour ton implication 🎉 ! "
        "Ce test nous permet de personnaliser ton parcours pour que tu progresses plus vite."
    )

    return render(request, "assessments/onboarding_result.html", {
        "attempt": attempt,
        "profile": profile,
        "advice": advice,
        "courses": courses,
        "congrats": congrats,
    })