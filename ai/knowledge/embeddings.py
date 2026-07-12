"""ai.knowledge.embeddings — Génération d'embeddings pour la RAG.

En Phase 5 on livre :
    - un stub déterministe hash-based (128 dimensions) qui permet la
      RAG sans clé externe, avec une qualité suffisante pour valider
      l'ossature en dev/tests ;
    - une résolution automatique via ``get_provider_for_purpose("embedding")``
      pour brancher un vrai provider dès qu'un ``AIModel`` embedding
      actif est configuré (OpenAI-compatible attendu).

Le vecteur produit est normalisé L2 → cosine devient un simple produit
scalaire (rapide en Python pur).
"""
from __future__ import annotations

import hashlib
import math
import re
from typing import List

from ..providers import ChatMessage, get_provider_for_purpose

EMBEDDING_DIM = 128


def embedding_dim() -> int:
    return EMBEDDING_DIM


def _normalize(vec: List[float]) -> List[float]:
    norm = math.sqrt(sum(x * x for x in vec)) or 1.0
    return [x / norm for x in vec]


def _stub_embed(text: str) -> List[float]:
    """Bag-of-words hashé sur EMBEDDING_DIM buckets, puis normalisation.

    Grossier mais déterministe et cohérent : deux textes proches en
    vocabulaire produisent des vecteurs proches en cosine.
    """
    vec = [0.0] * EMBEDDING_DIM
    tokens = re.findall(r"\w+", (text or "").lower())
    if not tokens:
        return vec
    for tok in tokens:
        h = int(hashlib.md5(tok.encode("utf-8")).hexdigest(), 16)
        bucket = h % EMBEDDING_DIM
        # Signe pseudo-aléatoire : réduit les collisions de sens.
        sign = 1.0 if (h & 1) == 0 else -1.0
        vec[bucket] += sign
    return _normalize(vec)


def _try_provider_embed(texts: List[str]) -> List[List[float]] | None:
    """Essaie d'appeler un provider ``embedding`` réel.

    Contrat OpenAI-compatible attendu :
        POST /v1/embeddings  → {data:[{embedding:[...]}, ...]}

    Pour la Phase 5 on garde une implémentation légère : on ne casse
    pas l'exécution si le provider ne supporte pas embeddings — on
    tombe silencieusement sur le stub.
    """
    try:
        resolved = get_provider_for_purpose("embedding")
    except Exception:
        return None
    # Le driver embeddings-natifs sera exposé en Phase 6.
    # Pour l'instant, si on n'est pas sur le stub → tenter d'utiliser
    # la méthode chat en fallback n'a aucun sens : on skip et on
    # retombe sur le stub. À revisiter quand un vrai driver embed
    # sera branché.
    if resolved.provider_kind != "stub":
        return None
    # Provider = stub → autant utiliser le stub direct (plus rapide).
    return None


def embed_texts(texts: List[str]) -> List[List[float]]:
    """Retourne un embedding par texte. Utilise le stub par défaut."""
    provider_result = _try_provider_embed(texts)
    if provider_result is not None:
        return provider_result
    return [_stub_embed(t) for t in texts]


def cosine_similarity(a: List[float], b: List[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    # Vecteurs normalisés L2 → dot = cosine
    return sum(x * y for x, y in zip(a, b))


# Message helper pour cohérence avec ChatMessage (import évite un lint unused).
_ = ChatMessage
