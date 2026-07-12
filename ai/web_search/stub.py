"""Provider de recherche web stub (dev/tests).

Produit 3 résultats synthétiques cohérents avec la query, pointant sur
des domaines "sûrs" (institutionnels + universités + régulateurs
sénégalais). Aucune requête réseau n'est faite.
"""
from __future__ import annotations

from typing import List
from urllib.parse import quote

from .base import AbstractWebSearchProvider, WebSearchResult


_SAFE_SOURCES = [
    {
        "domain": "www.oecd.org",
        "title_prefix": "OCDE — Publications sur",
        "kind": "official",
    },
    {
        "domain": "www.bceao.int",
        "title_prefix": "BCEAO — Note pédagogique sur",
        "kind": "regulator",
    },
    {
        "domain": "openstax.org",
        "title_prefix": "OpenStax — Manuel libre sur",
        "kind": "academic",
    },
]


class StubWebSearchProvider(AbstractWebSearchProvider):
    kind = "stub"

    def search(self, query: str, *, limit: int = 5) -> List[WebSearchResult]:
        q = (query or "").strip()
        if not q:
            return []
        limit = min(max(limit, 1), 5)
        base_score = 0.7
        results: List[WebSearchResult] = []
        for i, src in enumerate(_SAFE_SOURCES[:limit]):
            results.append(
                WebSearchResult(
                    title=f"{src['title_prefix']} {q[:60]}",
                    url=f"https://{src['domain']}/search?q={quote(q)}",
                    snippet=(
                        f"Ressource pédagogique de référence sur « {q} ». "
                        "Source institutionnelle (mode dev — pas de fetch réel)."
                    ),
                    domain=src["domain"],
                    score=max(0.1, base_score - i * 0.15),
                    date="",
                    source_kind=src["kind"],
                    extras={"provider": "stub"},
                )
            )
        return results
