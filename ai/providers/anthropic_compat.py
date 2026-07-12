"""ai.providers.anthropic_compat — driver Anthropic Messages API (Best-AI).

Streaming SSE natif de l'API Anthropic :

    - Événement ``message_start``          → contient ``usage.input_tokens``
    - Événement ``content_block_delta``    → incrément textuel (delta.text)
    - Événement ``message_delta``          → mise à jour ``usage.output_tokens``
    - Événement ``message_stop``           → fin de stream

Doc : https://docs.claude.com/en/api/messages-streaming

On extrait les vrais compteurs de tokens quand l'API les fournit, et
on retombe sur une estimation locale sinon. Le driver est utilisable
tel quel dès qu'une clé ``ANTHROPIC_API_KEY`` valide est configurée.
"""
from __future__ import annotations

import json
from typing import Iterator, List, Optional
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError

from .base import AbstractAIProvider, ChatChunk, ChatMessage


class AnthropicProvider(AbstractAIProvider):
    """Driver Anthropic Claude — compatible Messages API v1.

    Modèles supportés (à titre indicatif, la liste exacte évolue côté
    Anthropic — voir la doc officielle) :
        - claude-opus-4-6
        - claude-sonnet-4-6
        - claude-haiku-4-5-20251001
        - claude-3-5-sonnet-latest (legacy)

    Le ``model`` est passé tel quel dans le body — la sélection se fait
    via l'``AIModel`` configuré côté admin.
    """

    kind = "anthropic"

    DEFAULT_BASE_URL = "https://api.anthropic.com/v1"
    API_VERSION = "2023-06-01"

    def _url(self) -> str:
        base = (self.base_url or self.DEFAULT_BASE_URL).rstrip("/")
        return f"{base}/messages"

    def _headers(self) -> dict:
        if not self.api_key:
            raise RuntimeError(
                f"Anthropic provider {self.name}: aucune clé API configurée. "
                "Renseignez ANTHROPIC_API_KEY ou configurez le champ api_key "
                "dans /admin/ai."
            )
        return {
            "Content-Type": "application/json",
            "x-api-key": self.api_key,
            "anthropic-version": self.API_VERSION,
            "Accept": "text/event-stream",
            "User-Agent": "Best-Epargne/Best-AI (Anthropic driver)",
        }

    def stream_chat(
        self,
        *,
        model: str,
        messages: List[ChatMessage],
        temperature: float = 0.3,
        max_tokens: Optional[int] = None,
    ) -> Iterator[ChatChunk]:
        # 1. Anthropic distingue "system" du reste : on extrait.
        system_prompt = "\n\n".join(
            m.content for m in messages if m.role == "system" and m.content
        )
        turns = [
            {"role": m.role, "content": m.content}
            for m in messages
            if m.role in ("user", "assistant") and m.content
        ]
        # Anthropic exige au moins un tour utilisateur.
        if not turns:
            turns = [{"role": "user", "content": "Bonjour."}]
        # Il faut aussi que le PREMIER tour soit un ``user``.
        if turns[0]["role"] != "user":
            turns = [{"role": "user", "content": "…"}] + turns

        body: dict = {
            "model": model,
            "stream": True,
            "max_tokens": int(max_tokens or 1024),
            "temperature": float(temperature),
            "messages": turns,
        }
        if system_prompt:
            body["system"] = system_prompt

        data = json.dumps(body).encode("utf-8")

        try:
            req = urlrequest.Request(
                self._url(),
                data=data,
                method="POST",
                headers=self._headers(),
            )
        except RuntimeError:
            raise

        input_tokens = 0
        output_tokens = 0
        input_tokens_est = sum(max(1, len(m.content) // 4) for m in messages)
        model_used_ret = model

        try:
            with urlrequest.urlopen(req, timeout=self.timeout) as resp:
                for raw in resp:
                    line = raw.decode("utf-8", errors="ignore").rstrip("\n").rstrip("\r")
                    if not line or not line.startswith("data:"):
                        continue
                    payload = line[5:].strip()
                    if not payload:
                        continue
                    try:
                        obj = json.loads(payload)
                    except json.JSONDecodeError:
                        continue
                    kind = obj.get("type")
                    if kind == "message_start":
                        # Fournit input_tokens et parfois le model exact utilisé
                        msg = obj.get("message") or {}
                        usage = msg.get("usage") or {}
                        if isinstance(usage.get("input_tokens"), int):
                            input_tokens = int(usage["input_tokens"])
                        if msg.get("model"):
                            model_used_ret = str(msg["model"])
                    elif kind == "content_block_delta":
                        delta = obj.get("delta") or {}
                        # Anthropic peut retourner text_delta ou input_json_delta.
                        piece = delta.get("text") or ""
                        if piece:
                            yield ChatChunk(delta=piece)
                    elif kind == "message_delta":
                        usage = (obj.get("usage") or {})
                        if isinstance(usage.get("output_tokens"), int):
                            output_tokens = int(usage["output_tokens"])
                    elif kind == "message_stop":
                        break
                    elif kind == "error":
                        err_obj = (obj.get("error") or {})
                        raise RuntimeError(
                            f"Anthropic error: {err_obj.get('type')} — "
                            f"{err_obj.get('message', '?')}"
                        )
        except HTTPError as exc:
            # Message d'erreur plus lisible avec le body si dispo.
            try:
                body_txt = exc.read().decode("utf-8", errors="ignore")[:500]
            except Exception:
                body_txt = ""
            raise RuntimeError(
                f"Anthropic HTTP {exc.code}: {exc.reason}. {body_txt}"
            ) from exc
        except (URLError, TimeoutError) as exc:
            raise RuntimeError(
                f"Anthropic provider {self.name} network error: {exc}"
            ) from exc

        # Fallback estimation si l'API n'a pas fourni de compteurs.
        if not input_tokens:
            input_tokens = input_tokens_est

        yield ChatChunk(
            delta="",
            done=True,
            model_used=model_used_ret,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
        )
