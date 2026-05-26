"""enrollments AppConfig — branche les signals de recomputation progression."""
from django.apps import AppConfig


class EnrollmentsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "enrollments"

    def ready(self):
        # CORRECTIF ENROLL-05 : branche le signal de recomputation.
        from . import signals  # noqa: F401
