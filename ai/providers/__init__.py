"""ai.providers — abstraction fournisseurs IA.

Le routeur (``get_provider_for``) sélectionne le driver adapté au
purpose demandé et à la config active. En dev sans clé, il retombe
sur le driver "stub" qui produit une réponse synthétique déterministe.
"""
from .base import AbstractAIProvider, ChatMessage, ChatChunk, ChatResult  # noqa: F401
from .router import get_provider_for_purpose  # noqa: F401
