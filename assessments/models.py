from __future__ import annotations

from django.db import models

# Create your models here.
from django.db import models
from django.utils import timezone
from django.conf import settings


class Quiz(models.Model):
    title = models.CharField(max_length=200)
    course = models.ForeignKey("catalog.Course", on_delete=models.CASCADE, related_name="quizzes")
    lesson = models.OneToOneField("catalog.Lesson", on_delete=models.SET_NULL, null=True, blank=True,
                                  related_name="quiz")

    passing_score = models.PositiveIntegerField(default=70)  # %
    max_attempts = models.PositiveIntegerField(default=3)

    def __str__(self):
        return self.title


class Question(models.Model):
    quiz = models.ForeignKey("assessments.Quiz", on_delete=models.CASCADE, related_name="questions")
    prompt = models.TextField()
    order = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ["order"]


class Choice(models.Model):
    question = models.ForeignKey("assessments.Question", on_delete=models.CASCADE, related_name="choices")
    text = models.CharField(max_length=500)
    is_correct = models.BooleanField(default=False)


class Attempt(models.Model):
    quiz = models.ForeignKey("assessments.Quiz", on_delete=models.CASCADE, related_name="attempts")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="quiz_attempts")

    started_at = models.DateTimeField(default=timezone.now)
    submitted_at = models.DateTimeField(null=True, blank=True)

    score_percent = models.PositiveIntegerField(default=0)
    passed = models.BooleanField(default=False)


class AttemptAnswer(models.Model):
    attempt = models.ForeignKey("assessments.Attempt", on_delete=models.CASCADE, related_name="answers")
    question = models.ForeignKey("assessments.Question", on_delete=models.CASCADE)
    selected_choice = models.ForeignKey("assessments.Choice", on_delete=models.SET_NULL, null=True, blank=True)
