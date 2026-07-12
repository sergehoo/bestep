"""ai.knowledge.services — Indexation haut niveau.

    index_document(doc)      → découpe + embed + persiste chunks + statut INDEXED
    reindex_document(doc)    → purge chunks existants + re-index
    delete_document_chunks(doc) → nettoyage
"""
from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from ..models import AIAuditLog, AIKnowledgeChunk, AIKnowledgeDocument
from .chunker import chunk_text
from .embeddings import EMBEDDING_DIM, embed_texts


def delete_document_chunks(doc: AIKnowledgeDocument) -> int:
    n, _ = AIKnowledgeChunk.objects.filter(document=doc).delete()
    return n


def index_document(doc: AIKnowledgeDocument, *, actor=None) -> AIKnowledgeDocument:
    """Découpe + embed + persiste chunks. Idempotent (purge d'abord)."""
    doc.status = AIKnowledgeDocument.Status.INDEXING
    doc.error_detail = ""
    doc.save(update_fields=["status", "error_detail", "updated_at"])

    try:
        delete_document_chunks(doc)
        chunks = chunk_text(doc.content, target_chars=800, overlap=120)
        if not chunks:
            doc.status = AIKnowledgeDocument.Status.FAILED
            doc.error_detail = "Aucun contenu à indexer."
            doc.chunks_count = 0
            doc.save(update_fields=["status", "error_detail", "chunks_count", "updated_at"])
            return doc

        embeddings = embed_texts(chunks)
        rows = []
        for idx, (text, vec) in enumerate(zip(chunks, embeddings)):
            rows.append(
                AIKnowledgeChunk(
                    document=doc,
                    idx=idx,
                    text=text,
                    embedding=vec,
                    tokens=max(1, len(text) // 4),
                    metadata={"lang": doc.language},
                )
            )
        with transaction.atomic():
            AIKnowledgeChunk.objects.bulk_create(rows)
            doc.chunks_count = len(rows)
            doc.embedding_dim = EMBEDDING_DIM
            doc.status = AIKnowledgeDocument.Status.INDEXED
            doc.indexed_at = timezone.now()
            doc.save(update_fields=[
                "chunks_count", "embedding_dim", "status", "indexed_at", "updated_at",
            ])
    except Exception as exc:  # noqa: BLE001
        doc.status = AIKnowledgeDocument.Status.FAILED
        doc.error_detail = str(exc)[:500]
        doc.save(update_fields=["status", "error_detail", "updated_at"])

    AIAuditLog.objects.create(
        user=actor,
        organization_id=None,
        kind=AIAuditLog.Kind.KB_DOCUMENT_INDEXED,
        payload={
            "document_id": doc.id,
            "space_id": doc.space_id,
            "chunks": doc.chunks_count,
            "status": doc.status,
        },
        ok=doc.status == AIKnowledgeDocument.Status.INDEXED,
        error_type=doc.error_detail[:80],
    )
    return doc


def reindex_document(doc: AIKnowledgeDocument, *, actor=None) -> AIKnowledgeDocument:
    doc.version = (doc.version or 1) + 1
    doc.save(update_fields=["version", "updated_at"])
    return index_document(doc, actor=actor)
