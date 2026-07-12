"""ai.providers.stub — driver dev/sans-clé.

Génère une réponse synthétique déterministe, chunk par chunk, avec
une petite latence artificielle pour valider le pipeline SSE
front↔back sans jamais appeler d'API externe.
"""
from __future__ import annotations

import re
import time
from typing import Iterator, List, Optional

from .base import AbstractAIProvider, ChatChunk, ChatMessage


def _summarize_context(messages: List[ChatMessage]) -> str:
    last_user = next((m for m in reversed(messages) if m.role == "user"), None)
    if not last_user:
        return "Bonjour, je suis prêt à vous aider."
    text = last_user.content.strip()
    # Réponse "utile" : reformule + propose des pistes concrètes.
    if not text:
        return "Décrivez brièvement votre besoin, je vous propose des pistes concrètes."
    return (
        f"J'ai bien pris en compte votre demande :\n\n"
        f"> {text[:280]}\n\n"
        "Voici quelques pistes concrètes :\n\n"
        "- Je peux vous **aider à explorer** ce sujet étape par étape.\n"
        "- Je peux **générer un plan** de formation ou un résumé structuré.\n"
        "- Je peux **rechercher** dans le catalogue Best-Épargne.\n\n"
        "*(Provider en mode dev — configurez un fournisseur réel dans "
        "l'admin IA pour des réponses complètes.)*"
    )


def _chunk_text(text: str, size: int = 24) -> List[str]:
    """Découpe naïvement en morceaux de ~size caractères en préservant les mots."""
    tokens = re.split(r"(\s+)", text)
    out: List[str] = []
    buf = ""
    for t in tokens:
        if len(buf) + len(t) > size and buf:
            out.append(buf)
            buf = t
        else:
            buf += t
    if buf:
        out.append(buf)
    return out


class StubProvider(AbstractAIProvider):
    kind = "stub"

    def stream_chat(
        self,
        *,
        model: str,
        messages: List[ChatMessage],
        temperature: float = 0.3,
        max_tokens: Optional[int] = None,
    ) -> Iterator[ChatChunk]:
        content = _summarize_context(messages)
        pieces = _chunk_text(content, size=28)
        input_tokens = sum(max(1, len(m.content) // 4) for m in messages)
        output_tokens = 0
        for piece in pieces:
            output_tokens += max(1, len(piece) // 4)
            time.sleep(0.03)  # micro-latence pour l'effet streaming
            yield ChatChunk(delta=piece)
        yield ChatChunk(
            delta="",
            done=True,
            model_used=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
        )
