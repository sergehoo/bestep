"""commerce AppConfig — CORRECTIF V2.D (branche les signals)."""
from django.apps import AppConfig


class CommerceConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "commerce"

    def ready(self):
        # CORRECTIF COM-09/COM-10 : branche les signals de sync licence.
        from . import signals  # noqa: F401
