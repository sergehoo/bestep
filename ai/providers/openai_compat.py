"""ai.providers.openai_compat — driver OpenAI Chat Completions.

Compatible avec tous les fournisseurs qui exposent le protocole
``/v1/chat/completions`` avec streaming SSE :
    - OpenAI (openai.com)
    - Azure OpenAI (avec base_url adapté)
    - Ollama (base_url=http://ollama:11434/v1)
    - DeepSeek, Mistral, Together, Groq…

Implémentation minimale sans dépendance externe : requête HTTP via
``urllib`` en streaming ligne par ligne. Suffisant pour la Phase 1.
"""
from __future__ import annotations

import json
import time
from typing import Iterator, List, Optional
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError

from .base import AbstractAIProvider, ChatChunk, ChatMessage


class OpenAICompatProvider(AbstractAIProvider):
    kind = "openai"

    DEFAULT_BASE_URL = "https://api.openai.com/v1"

    def _url(self) -> str:
        base = (self.base_url or self.DEFAULT_BASE_URL).rstrip("/")
        return f"{base}/chat/completions"

    def stream_chat(
        self,
        *,
        model: str,
        messages: List[ChatMessage],
        temperature: float = 0.3,
        max_tokens: Optional[int] = None,
    ) -> Iterator[ChatChunk]:
        body = {
            "model": model,
            "stream": True,
            "temperature": float(temperature),
            "messages": [
                {"role": m.role, "content": m.content}
                for m in messages
                if m.role in ("system", "user", "assistant", "tool")
            ],
        }
        if max_tokens:
            body["max_tokens"] = int(max_tokens)

        data = json.dumps(body).encode("utf-8")
        req = urlrequest.Request(
            self._url(),
            data=data,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}" if self.api_key else "",
                "Accept": "text/event-stream",
            },
        )

        input_tokens_est = sum(max(1, len(m.content) // 4) for m in messages)
        output_tokens_est = 0
        start = time.time()

        try:
            with urlrequest.urlopen(req, timeout=self.timeout) as resp:
                for raw in resp:
                    line = raw.decode("utf-8", errors="ignore").strip()
                    if not line or not line.startswith("data:"):
                        continue
                    payload = line[5:].strip()
                    if payload == "[DONE]":
                        break
                    try:
                        obj = json.loads(payload)
                    except json.JSONDecodeError:
                        continue
                    choices = obj.get("choices") or []
                    if not choices:
                        continue
                    delta = choices[0].get("delta") or {}
                    piece = delta.get("content") or ""
                    if piece:
                        output_tokens_est += max(1, len(piece) // 4)
                        yield ChatChunk(delta=piece)
        except (HTTPError, URLError, TimeoutError) as exc:
            # Signale l'échec au routeur qui pourra fallback.
            raise RuntimeError(
                f"OpenAI-compat provider {self.name} error: {exc}"
            ) from exc

        yield ChatChunk(
            delta="",
            done=True,
            model_used=model,
            input_tokens=input_tokens_est,
            output_tokens=output_tokens_est,
        )
        _ = start  # évite un lint "unused"
