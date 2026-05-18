"""
reviews/models.py — CORRECTIF P1.D (audit REV-03).

Ajoute la validation rating au niveau MODÈLE (validators Django + CheckConstraint
PostgreSQL), pour fermer la porte de derrière (admin Django, shell, fixtures).
"""
from __future__ import annotations

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from catalog.models import Course


class CourseReview(models.Model):
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="reviews")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="course_reviews",
    )

    rating = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)],
    )
    comment = models.TextField(blank=True, max_length=2000)

    is_public = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["course", "user"], name="uniq_review_per_user_course"),
            # Garde-fou DB pour rating ∈ [1..5] (REV-03).
            models.CheckConstraint(
                check=models.Q(rating__gte=1) & models.Q(rating__lte=5),
                name="reviews_rating_1_5",
            ),
        ]
        indexes = [
            # Performance : la summary filtre toujours (course_id, is_public).
            models.Index(fields=["course", "is_public"]),
            models.Index(fields=["created_at"]),
        ]
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.course_id} - {self.user_id} ({self.rating})"
