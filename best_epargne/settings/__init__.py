"""Package de settings sans sélection implicite d'environnement.

Les points d'entrée ciblent explicitement ``best_epargne.settings.prod`` ou
``best_epargne.settings.dev``. Le chargement de ``.env`` est limité au module
de développement dans ``base.py`` ; la production dépend uniquement des
variables injectées par l'environnement d'exécution.
"""
from __future__ import annotations
