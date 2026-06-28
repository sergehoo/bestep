from django.apps import AppConfig


class AccountsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'compte'

    def ready(self):
        # P3.1 — Connecte le signal post_save User → UserPreferences.
        # Import local pour éviter les imports circulaires au boot Django.
        from compte import signals  # noqa: F401
