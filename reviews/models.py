from __future__ import annotations

from django.db import models

# Create your models here.
from django.db import models
from django.utils import timezone
from django.conf import settings


class Review(models.Model):
    course = models.ForeignKey("catalog.Course", on_delete=models.CASCADE, related_name="reviews")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reviews")
    rating = models.PositiveIntegerField(default=5)  # 1..5
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        unique_together = ("course", "user")
