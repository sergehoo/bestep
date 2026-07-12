"""ai.knowledge — Pipeline RAG (Phase 5).

    chunker  → découpe un document en fragments
    embeddings → produit un vecteur par chunk (stub ou provider réel)
    retrieval → search cosine + filtre RBAC
    services  → orchestration index + search
"""
from .chunker import chunk_text  # noqa: F401
from .embeddings import embed_texts, embedding_dim  # noqa: F401
from .retrieval import (  # noqa: F401
    RAGResult,
    accessible_document_ids,
    search_knowledge,
)
from .services import (  # noqa: F401
    index_document,
    reindex_document,
    delete_document_chunks,
)
