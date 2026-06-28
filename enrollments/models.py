from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils import timezone


class Enrollment(models.Model):
    class Source(models.TextChoices):
        B2C = "B2C", "Achat direct"
        COMPANY = "COMPANY", "Entreprise"

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Actif"
        COMPLETED = "COMPLETED", "Terminé"
        CANCELED = "CANCELED", "Annulé"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="enrollments"
    )
    course = models.ForeignKey(
        "catalog.Course", on_delete=models.CASCADE, related_name="enrollments"
    )
    source = models.CharField(max_length=10, choices=Source.choices, default=Source.B2C)

    company = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="enrollments",
    )
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.ACTIVE)
    current_lesson = models.ForeignKey(
        "catalog.Lesson",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="current_for_enrollments",
    )
    progress_percent = models.PositiveIntegerField(default=0)

    enrolled_at = models.DateTimeField(default=timezone.now)
    completed_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "course")
        indexes = [
            models.Index(
                fields=["course", "status"],
                name="enroll_course_status_idx",
            ),
            models.Index(
                fields=["user", "status"],
                name="enroll_user_status_idx",
            ),
            models.Index(
                fields=["company", "status"],
                name="enroll_company_status_idx",
            ),
            models.Index(fields=["enrolled_at"], name="enroll_enrolled_at_idx"),
        ]

    def __str__(self):
        return f"{self.user_id} — {self.course_id} ({self.status})"


class LessonProgress(models.Model):
    enrollment = models.ForeignKey(
        "enrollments.Enrollment", on_delete=models.CASCADE, related_name="lesson_progress"
    )
    lesson = models.ForeignKey(
        "catalog.Lesson", on_delete=models.CASCADE, related_name="progress_entries"
    )

    # progress_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    progress_percent = models.PositiveSmallIntegerField(default=0)  # ✅ plus de null

    last_position_sec = models.PositiveIntegerField(default=0)
    completed = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("enrollment", "lesson")
        indexes = [
            models.Index(
                fields=["enrollment", "completed"],
                name="lp_enroll_completed_idx",
            ),
        ]

    def __str__(self):
        return f"{self.enrollment_id} — {self.lesson_id} ({self.progress_percent}%)"

    def mark_completed(self):
        self.completed = True
        self.progress_percent = 100
        self.save(update_fields=["completed", "progress_percent", "updated_at"])
