"""notifications AppConfig — V_FIN.B."""
from django.apps import AppConfig


class NotificationsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "notifications"
    label = "notifications_app"  # évite collision avec django-notifications-hq.
    verbose_name = "Notifications (transverse)"

    def ready(self):
        from . import signals  # noqa: F401
