"""catalog AppConfig — V4.A : branche les signaux d'invalidation dashboards."""
from django.apps import AppConfig


class CatalogConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "catalog"

    def ready(self):
        # Branche les signaux d'invalidation cache dashboards.
        from . import signals  # noqa: F401
