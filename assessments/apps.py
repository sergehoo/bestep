from django.apps import AppConfig


class AssessmentsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "assessments"

    def ready(self):  # pragma: no cover
        # Importer les signaux au démarrage de l'app.
        from . import signals  # noqa: F401

