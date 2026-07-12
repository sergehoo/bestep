"""ai.knowledge.retrieval — Recherche cosine + filtre permissions.

Le RBAC est appliqué en amont : on calcule d'abord la liste des
``document_ids`` accessibles à l'utilisateur, PUIS on cherche les
chunks parmi ces documents uniquement.

Types d'accès :
    - GLOBAL     : tout le monde
    - ORG        : membres de l'organisation
    - COURSE     : instructeur du cours OU apprenants inscrits
    - INSTRUCTOR : le formateur seul
    - PRIVATE    : l'owner seul
    - ADMIN      : platform_admins uniquement
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Set

from ..models import (
    AIKnowledgeChunk,
    AIKnowledgeDocument,
    AIKnowledgeSpace,
)
from .embeddings import cosine_similarity, embed_texts


@dataclass
class RAGResult:
    document_id: int
    document_title: str
    space_id: int
    space_name: str
    space_scope: str
    chunk_id: int
    chunk_idx: int
    text: str
    score: float
    source_url: str = ""
    metadata: dict = field(default_factory=dict)


def _user_org_ids(user) -> Set[int]:
    try:
        ids = set()
        # OrganizationMembership standard
        for m in getattr(user, "organization_memberships", []).filter(is_active=True).values("organization_id"):
            oid = m.get("organization_id")
            if oid:
                ids.add(oid)
        return ids
    except Exception:
        return set()


def _user_course_ids(user) -> Set[int]:
    try:
        from enrollments.models import Enrollment
        return set(
            Enrollment.objects.filter(user=user).values_list("course_id", flat=True)
        )
    except Exception:
        return set()


def _instructor_course_ids(user) -> Set[int]:
    try:
        from catalog.models import Course
        return set(
            Course.objects.filter(instructor=user).values_list("id", flat=True)
        )
    except Exception:
        return set()


def accessible_document_ids(user) -> List[int]:
    """Liste des documents visibles pour cet utilisateur (RBAC KB)."""
    if not user or not user.is_authenticated:
        return []

    is_admin = bool(getattr(user, "is_platform_admin", False))
    is_instructor = bool(getattr(user, "is_instructor", False))

    spaces = AIKnowledgeSpace.objects.all()
    if is_admin:
        # Admin voit tout.
        return list(
            AIKnowledgeDocument.objects.filter(status="INDEXED").values_list("id", flat=True)
        )

    org_ids = _user_org_ids(user)
    enrolled_courses = _user_course_ids(user)
    owned_courses = _instructor_course_ids(user) if is_instructor else set()

    accessible_space_ids: List[int] = []
    for s in spaces:
        scope = s.scope
        if scope == AIKnowledgeSpace.Scope.GLOBAL:
            accessible_space_ids.append(s.id)
        elif scope == AIKnowledgeSpace.Scope.ORG and s.organization_id in org_ids:
            accessible_space_ids.append(s.id)
        elif scope == AIKnowledgeSpace.Scope.COURSE:
            if s.course_id in owned_courses or s.course_id in enrolled_courses:
                accessible_space_ids.append(s.id)
        elif scope == AIKnowledgeSpace.Scope.INSTRUCTOR and s.owner_id == user.id:
            accessible_space_ids.append(s.id)
        elif scope == AIKnowledgeSpace.Scope.PRIVATE and s.owner_id == user.id:
            accessible_space_ids.append(s.id)
        # ADMIN scope : jamais accessible sans is_platform_admin (déjà traité)

    if not accessible_space_ids:
        return []
    return list(
        AIKnowledgeDocument.objects.filter(
            space_id__in=accessible_space_ids,
            status="INDEXED",
        ).values_list("id", flat=True)
    )


def search_knowledge(
    *,
    user,
    query: str,
    limit: int = 5,
    min_score: float = 0.10,
) -> List[RAGResult]:
    query = (query or "").strip()
    if not query:
        return []

    doc_ids = accessible_document_ids(user)
    if not doc_ids:
        return []

    q_vec = embed_texts([query])[0]

    # Charge tous les chunks accessibles (limité pour éviter OOM).
    chunks = list(
        AIKnowledgeChunk.objects.select_related("document", "document__space")
        .filter(document_id__in=doc_ids)
        .only("id", "idx", "text", "embedding", "document")[:5000]
    )
    scored: List[RAGResult] = []
    for c in chunks:
        try:
            score = cosine_similarity(q_vec, c.embedding or [])
        except Exception:
            score = 0.0
        if score < min_score:
            continue
        doc = c.document
        space = doc.space
        scored.append(
            RAGResult(
                document_id=doc.id,
                document_title=doc.title,
                space_id=space.id,
                space_name=space.name,
                space_scope=space.scope,
                chunk_id=c.id,
                chunk_idx=c.idx,
                text=c.text[:800],
                score=float(score),
                source_url=doc.source_url or "",
                metadata=doc.metadata or {},
            )
        )
    scored.sort(key=lambda r: (-r.score, r.chunk_id))
    return scored[:limit]
