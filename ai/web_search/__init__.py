"""ai.web_search — Recherche Internet contrôlée (Phase 5).

- Une abstraction ``AbstractWebSearchProvider`` avec un stub dev.
- Une couche de filtrage domaine (allowlist / blocklist depuis
  ``PlatformSettings`` ou config par défaut).
- Journalisation systématique dans ``AIWebSearch`` + ``AIAuditLog``.
- L'IA ne présente jamais un résultat comme une vérité certaine —
  la fonction ``format_citations`` renvoie une liste de sources
  clairement identifiées comme "web".
"""
from .base import AbstractWebSearchProvider, WebSearchResult  # noqa: F401
from .search import search_web, DEFAULT_ALLOWLIST, DEFAULT_BLOCKLIST  # noqa: F401
