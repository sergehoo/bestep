"""core AppConfig — pour permettre la découverte des templatetags."""
from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core"
    label = "core"
    verbose_name = "Core (transverse)"
