"""Interfaces communes de la recherche web."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List


@dataclass
class WebSearchResult:
    title: str
    url: str
    snippet: str
    domain: str
    score: float = 0.0
    date: str = ""
    source_kind: str = "web"  # web | official | academic | regulator
    extras: dict = field(default_factory=dict)


class AbstractWebSearchProvider:
    kind: str = "abstract"

    def __init__(self, *, name: str, api_key: str = "", base_url: str = ""):
        self.name = name
        self.api_key = api_key
        self.base_url = base_url

    def search(self, query: str, *, limit: int = 5) -> List[WebSearchResult]:
        raise NotImplementedError
