"""Recherche web haut niveau : allowlist/blocklist + journalisation.

- Récupère la config via ``PlatformSettings`` (Phase R46) si dispo.
- Applique la liste blanche/noire au résultat.
- Journalise chaque appel (AIWebSearch + AIAuditLog).
"""
from __future__ import annotations

from typing import List, Optional
from urllib.parse import urlparse

from ..models import AIAuditLog, AIWebSearch
from .base import WebSearchResult
from .stub import StubWebSearchProvider


DEFAULT_ALLOWLIST = [
    "wikipedia.org",
    "openstax.org",
    "oecd.org",
    "bceao.int",
    "worldbank.org",
    "imf.org",
    "un.org",
    "gouv.sn",
    "gouv.fr",
]

DEFAULT_BLOCKLIST: list[str] = []


def _load_lists_from_settings() -> tuple[list[str], list[str]]:
    """Lit les allow/block lists depuis PlatformSettings si l'app existe."""
    try:
        from core.models import PlatformSettings

        ps = PlatformSettings.load()
        data = ps.merged_data()
        web = (data or {}).get("web_search") or {}
        allow = web.get("allow_domains") or DEFAULT_ALLOWLIST
        block = web.get("block_domains") or DEFAULT_BLOCKLIST
        if isinstance(allow, list) and isinstance(block, list):
            return [str(x).lower() for x in allow], [str(x).lower() for x in block]
    except Exception:
        pass
    return DEFAULT_ALLOWLIST, DEFAULT_BLOCKLIST


def _domain_of(url: str) -> str:
    try:
        host = urlparse(url).netloc.lower()
        return host.split(":")[0]
    except Exception:
        return ""


def _filter(results: List[WebSearchResult]) -> List[WebSearchResult]:
    allow, block = _load_lists_from_settings()
    out: List[WebSearchResult] = []
    for r in results:
        dom = (r.domain or _domain_of(r.url)).lower()
        if any(dom.endswith(b) for b in block):
            continue
        if allow and not any(dom.endswith(a) for a in allow):
            continue
        out.append(r)
    return out


def _get_provider():
    # En Phase 5 : uniquement le stub. Phase 6 branchera Brave / Serper
    # / Tavily via ``AIProvider(kind="brave"|"tavily")``.
    return StubWebSearchProvider(name="stub")


def search_web(
    *,
    user,
    query: str,
    limit: int = 5,
    ip: Optional[str] = None,
) -> dict:
    """Point d'entrée. Retourne un dict prêt à sérialiser."""
    query = (query or "").strip()
    if not query:
        return {"query": "", "results": [], "provider": "stub"}

    provider = _get_provider()
    raw = provider.search(query, limit=limit)
    filtered = _filter(raw)

    payload_results = [
        {
            "title": r.title,
            "url": r.url,
            "snippet": r.snippet,
            "domain": r.domain,
            "score": r.score,
            "date": r.date,
            "source_kind": r.source_kind,
        }
        for r in filtered
    ]

    entry = AIWebSearch.objects.create(
        user=user if getattr(user, "is_authenticated", False) else None,
        query=query[:500],
        provider=provider.kind,
        results_count=len(payload_results),
        domains=[r["domain"] for r in payload_results],
        payload={"results": payload_results},
        ok=True,
        ip=ip,
    )
    AIAuditLog.objects.create(
        user=entry.user,
        kind=AIAuditLog.Kind.WEB_SEARCH,
        payload={
            "query": query[:200],
            "provider": provider.kind,
            "results_count": len(payload_results),
        },
        ip=ip,
    )
    return {
        "query": query,
        "provider": provider.kind,
        "results": payload_results,
        "filtered_out": len(raw) - len(filtered),
    }
