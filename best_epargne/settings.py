"""
DEPRECATED — ne pas utiliser.

La configuration réelle vit dans le package ``best_epargne/settings/``
(base.py, dev.py, prod.py) et est sélectionnée explicitement via
``DJANGO_SETTINGS_MODULE``.

Python donne la priorité au package (dossier avec ``__init__.py``) sur le
module portant le même nom. Ce fichier n'est donc jamais exécuté en temps
normal. Il est conservé uniquement pour signaler explicitement la dépréciation.
"""

raise ImportError(
    "best_epargne.settings (fichier) est déprécié. Utilisez "
    "DJANGO_SETTINGS_MODULE='best_epargne.settings.dev' ou "
    "'best_epargne.settings.prod'."
)
