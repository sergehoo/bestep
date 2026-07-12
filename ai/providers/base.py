"""ai.providers.base — interfaces communes.

Le contrat est volontairement minimal pour la Phase 1 : chat en
streaming (générateur de chunks) + une méthode ``chat_sync`` de
convenance. Les phases suivantes ajouteront ``generate_image``,
``embed``, etc. sur la même hiérarchie.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterator, List, Optional


@dataclass
class ChatMessage:
    role: str  # user | assistant | system | tool
    content: str
    name: Optional[str] = None


@dataclass
class ChatChunk:
    """Un morceau de réponse en streaming."""

    delta: str = ""
    done: bool = False
    # Métadonnées finales (uniquement quand done=True) — tokens, modèle utilisé.
    model_used: str = ""
    input_tokens: int = 0
    output_tokens: int = 0


@dataclass
class ChatResult:
    """Résultat d'un chat non-streamé (agrégation des chunks)."""

    content: str = ""
    model_used: str = ""
    input_tokens: int = 0
    output_tokens: int = 0
    latency_ms: int = 0
    finish_reason: str = "stop"
    extras: dict = field(default_factory=dict)


class AbstractAIProvider:
    """Interface commune. Chaque driver l'implémente."""

    kind: str = "abstract"

    def __init__(
        self,
        *,
        name: str,
        base_url: str = "",
        api_key: str = "",
        timeout: int = 60,
    ) -> None:
        self.name = name
        self.base_url = base_url
        self.api_key = api_key
        self.timeout = timeout

    # ── Chat streamé ─────────────────────────────────────────
    def stream_chat(
        self,
        *,
        model: str,
        messages: List[ChatMessage],
        temperature: float = 0.3,
        max_tokens: Optional[int] = None,
    ) -> Iterator[ChatChunk]:
        raise NotImplementedError

    # ── Chat non streamé (fallback) ──────────────────────────
    def chat(
        self,
        *,
        model: str,
        messages: List[ChatMessage],
        temperature: float = 0.3,
        max_tokens: Optional[int] = None,
    ) -> ChatResult:
        """Agrège le stream en un ChatResult."""
        agg = ChatResult()
        for chunk in self.stream_chat(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        ):
            agg.content += chunk.delta
            if chunk.done:
                agg.model_used = chunk.model_used or model
                agg.input_tokens = chunk.input_tokens
                agg.output_tokens = chunk.output_tokens
        return agg
