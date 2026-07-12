"""ai.providers.router — sélection du driver et du modèle pour un purpose.

Règles :
1. Prend le ``AIModel`` par défaut actif du purpose.
2. Si absent → prend le premier actif du purpose.
3. Si toujours absent → tombe sur le stub-dev seed.
4. Le driver est instancié selon ``AIProvider.kind``.

Fallback env :
    - Si un provider a ``kind=anthropic`` mais ``api_key`` vide, on tente
      de lire ``ANTHROPIC_API_KEY`` depuis l'environnement.
    - Idem pour OpenAI-compatible avec ``OPENAI_API_KEY`` /
      ``OPENAI_BASE_URL``.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional

from ..models import AIModel, AIProvider
from .anthropic_compat import AnthropicProvider
from .base import AbstractAIProvider
from .openai_compat import OpenAICompatProvider
from .stub import StubProvider


@dataclass
class ResolvedModel:
    provider: AbstractAIProvider
    provider_kind: str
    model_name: str
    max_tokens: int
    temperature: float
    purpose: str


def _driver_for(provider: AIProvider) -> AbstractAIProvider:
    api_key = provider.api_key or ""
    base_url = provider.base_url or ""

    # Fallback env → clé.
    if not api_key:
        if provider.kind == AIProvider.Kind.ANTHROPIC:
            api_key = os.environ.get("ANTHROPIC_API_KEY", "")
        elif provider.kind == AIProvider.Kind.OPENAI:
            api_key = os.environ.get("OPENAI_API_KEY", "")
    if not base_url and provider.kind == AIProvider.Kind.OPENAI:
        base_url = os.environ.get("OPENAI_BASE_URL", "")

    kwargs = {
        "name": provider.name,
        "base_url": base_url,
        "api_key": api_key,
        "timeout": provider.timeout_seconds or 60,
    }
    if provider.kind == AIProvider.Kind.OPENAI:
        return OpenAICompatProvider(**kwargs)
    if provider.kind == AIProvider.Kind.ANTHROPIC:
        return AnthropicProvider(**kwargs)
    return StubProvider(**kwargs)


def _find_model(purpose: str) -> Optional[AIModel]:
    qs = (
        AIModel.objects.select_related("provider")
        .filter(purpose=purpose, is_active=True, provider__is_active=True)
        .order_by("-is_default", "provider__priority", "id")
    )
    return qs.first()


def get_provider_for_purpose(purpose: str) -> ResolvedModel:
    model = _find_model(purpose)
    if model is None:
        # Ultime fallback : le stub seed a un default pour chaque purpose,
        # mais on garde une résilience si la table est totalement vide.
        stub_provider = AIProvider(
            name="fallback-stub", kind=AIProvider.Kind.STUB,
        )
        return ResolvedModel(
            provider=StubProvider(name="fallback-stub"),
            provider_kind="stub",
            model_name=f"stub-{purpose}",
            max_tokens=2048,
            temperature=0.3,
            purpose=purpose,
        )

    return ResolvedModel(
        provider=_driver_for(model.provider),
        provider_kind=model.provider.kind,
        model_name=model.model_name,
        max_tokens=model.max_tokens or 2048,
        temperature=float(model.temperature),
        purpose=purpose,
    )
