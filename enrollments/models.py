from __future__ import annotations

from django.db import models

# Create your models here.
from django.db import models
from django.utils import timezone
from django.conf import settings


class Enrollment(models.Model):
    class Source(models.TextChoices):
        B2C = "B2C", "Achat direct"
        COMPANY = "COMPANY", "Entreprise"

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Actif"
        COMPLETED = "COMPLETED", "Terminé"
        CANCELED = "CANCELED", "Annulé"
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="enrollments")
    course = models.ForeignKey("catalog.Course", on_delete=models.CASCADE, related_name="enrollments")
    source = models.CharField(max_length=10, choices=Source.choices, default=Source.B2C)

    company = models.ForeignKey("organizations.Company", on_delete=models.SET_NULL, null=True, blank=True,
                                related_name="enrollments")
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.ACTIVE)
    current_lesson = models.ForeignKey("catalog.Lesson", on_delete=models.SET_NULL, null=True, blank=True,
                                       related_name="current_for_enrollments")

    enrolled_at = models.DateTimeField(default=timezone.now)
    completed_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("user", "course")


class LessonProgress(models.Model):
    enrollment = models.ForeignKey("enrollments.Enrollment", on_delete=models.CASCADE, related_name="lesson_progress")
    lesson = models.ForeignKey("catalog.Lesson", on_delete=models.CASCADE, related_name="progress_entries")

    # progress_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    progress_percent = models.PositiveSmallIntegerField(default=0)  # ✅ plus de null

    last_position_sec = models.PositiveIntegerField(default=0)
    completed = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    def mark_completed(self):
        self.completed = True
        self.progress_percent = 100
        self.save(update_fields=["completed", "progress_percent", "updated_at"])

    class Meta:
        unique_together = ("enrollment", "lesson")
