"""
DEPRECATED — ne pas utiliser.

La configuration réelle vit dans le package ``best_epargne/settings/``
(base.py, dev.py, prod.py) et est sélectionnée via ``DJANGO_SETTINGS_MODULE``
ou via ``best_epargne/settings/__init__.py`` qui lit la variable
``DJANGO_ENV``.

Python donne la priorité au package (dossier avec ``__init__.py``) sur le
module portant le même nom. Ce fichier n'est donc jamais exécuté en temps
normal. Il est conservé uniquement pour signaler explicitement la dépréciation.
"""

raise ImportError(
    "best_epargne.settings (fichier) est déprécié. Utilisez "
    "DJANGO_SETTINGS_MODULE='best_epargne.settings.dev' ou "
    "'best_epargne.settings.prod'."
)
