"""best_epargne/apis/views_package/public.py — Placeholder délibéré.

Le sous-module `Public` prévu à l'origine (P4.5) a été remplacé par le
module dédié ``best_epargne.apis.api_public`` (namespace complet
``/api/public/*``) qui offre une meilleure séparation : un fichier
unique, sans dépendance circulaire, avec ses propres serializers et
querysets réutilisables (``catalog.services.get_visible_courses_qs``,
``catalog.querysets.for_public_listing`` / ``for_course_detail``).

Ce fichier reste présent pour éviter les imports cassés d'anciens
modules qui auraient référencé ``views_package.public``. Aucune vue
n'y est plus définie — se reporter à ``api_public.py``.
"""
from __future__ import annotations
