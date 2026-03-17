from __future__ import annotations

from django.db import models

# Create your models here.
from django.db import models
from django.db.models import UniqueConstraint
from django.utils import timezone
from django.conf import settings

from catalog.models import Course


class CourseReview(models.Model):
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="reviews")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="course_reviews")

    rating = models.PositiveSmallIntegerField()  # 1..5
    comment = models.TextField(blank=True)

    is_public = models.BooleanField(default=True)  # modération simple
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            UniqueConstraint(fields=["course", "user"], name="uniq_review_per_user_course")
        ]
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.course_id} - {self.user_id} ({self.rating})"