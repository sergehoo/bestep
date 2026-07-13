"""best_epargne/apis/api_ai_kb.py — RAG + Web search (Phase 5).

Endpoints :

    GET    /api/ai/knowledge/spaces/                Liste des espaces visibles
    POST   /api/ai/knowledge/spaces/                Créer un espace (instructor/admin)
    GET    /api/ai/knowledge/documents/             Liste des documents visibles
    POST   /api/ai/knowledge/documents/             Créer un document (index immédiat)
    GET    /api/ai/knowledge/documents/<id>/        Détail
    PATCH  /api/ai/knowledge/documents/<id>/        Update contenu → statut PENDING
    DELETE /api/ai/knowledge/documents/<id>/        Supprime + chunks
    POST   /api/ai/knowledge/documents/<id>/reindex/  Ré-indexation
    POST   /api/ai/knowledge/search/                Recherche RAG
    POST   /api/ai/web-search/                      Recherche Internet contrôlée

Sécurité :
    - Aucun document d'un espace privé/org d'autrui n'est visible.
    - La recherche RAG applique le filtre RBAC (accessible_document_ids).
    - Le web search est journalisé + audit.
"""
from __future__ import annotations

from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ai.knowledge import (
    accessible_document_ids,
    delete_document_chunks,
    index_document,
    reindex_document,
    search_knowledge,
)
from ai.models import (
    AIKnowledgeDocument,
    AIKnowledgeSpace,
)
from ai.permissions import user_can_use_assistant
from ai.web_search import search_web


def _forbidden(user=None):
    # SECURITE-05 — délègue à ai.http.forbidden_for pour émettre un ``code``
    # stable (EMAIL_NOT_VERIFIED, ACCOUNT_SUSPENDED, …).
    from ai.http import forbidden_for
    return forbidden_for(user)


def _client_ip(request):
    x = request.META.get("HTTP_X_FORWARDED_FOR")
    if x:
        return x.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def _is_editor(user) -> bool:
    return bool(
        getattr(user, "is_platform_admin", False)
        or getattr(user, "is_instructor", False)
    )


# ─────────────────────────────────────────────────────────────
# Serializers
# ─────────────────────────────────────────────────────────────


class SpaceSerializer(serializers.ModelSerializer):
    documents_count = serializers.SerializerMethodField()

    class Meta:
        model = AIKnowledgeSpace
        fields = [
            "id",
            "name",
            "scope",
            "owner",
            "organization_id",
            "course_id",
            "description",
            "created_at",
            "updated_at",
            "documents_count",
        ]

    def get_documents_count(self, obj) -> int:
        return obj.documents.count()


class SpaceCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=140)
    scope = serializers.ChoiceField(
        choices=[c[0] for c in AIKnowledgeSpace.Scope.choices]
    )
    organization_id = serializers.IntegerField(required=False, allow_null=True)
    course_id = serializers.IntegerField(required=False, allow_null=True)
    description = serializers.CharField(required=False, allow_blank=True, max_length=280)


class DocumentSerializer(serializers.ModelSerializer):
    space_name = serializers.CharField(source="space.name", read_only=True)
    space_scope = serializers.CharField(source="space.scope", read_only=True)

    class Meta:
        model = AIKnowledgeDocument
        fields = [
            "id",
            "space",
            "space_name",
            "space_scope",
            "title",
            "source_url",
            "doc_type",
            "language",
            "version",
            "content",
            "metadata",
            "status",
            "error_detail",
            "chunks_count",
            "embedding_dim",
            "created_at",
            "updated_at",
            "indexed_at",
        ]


class DocumentCreateSerializer(serializers.Serializer):
    space_id = serializers.IntegerField()
    title = serializers.CharField(max_length=240)
    content = serializers.CharField()
    source_url = serializers.URLField(required=False, allow_blank=True)
    doc_type = serializers.ChoiceField(
        choices=[c[0] for c in AIKnowledgeDocument.DocType.choices],
        required=False,
        default="MARKDOWN",
    )
    language = serializers.CharField(max_length=10, required=False, default="fr")
    metadata = serializers.JSONField(required=False, default=dict)


class SearchInput(serializers.Serializer):
    query = serializers.CharField(max_length=500)
    limit = serializers.IntegerField(min_value=1, max_value=20, required=False, default=5)


class WebSearchInput(serializers.Serializer):
    query = serializers.CharField(max_length=500)
    limit = serializers.IntegerField(min_value=1, max_value=10, required=False, default=5)


# ─────────────────────────────────────────────────────────────
# Spaces
# ─────────────────────────────────────────────────────────────


def _visible_space_ids(user) -> list[int]:
    """Liste des espaces visibles selon RBAC (même logique que retrieval)."""
    if not user or not user.is_authenticated:
        return []
    if getattr(user, "is_platform_admin", False):
        return list(AIKnowledgeSpace.objects.values_list("id", flat=True))

    try:
        from enrollments.models import Enrollment
        enrolled = set(Enrollment.objects.filter(user=user).values_list("course_id", flat=True))
    except Exception:
        enrolled = set()
    try:
        from catalog.models import Course
        owned = set(Course.objects.filter(instructor=user).values_list("id", flat=True))
    except Exception:
        owned = set()
    try:
        org_ids = set(
            user.organization_memberships.filter(is_active=True).values_list(
                "organization_id", flat=True
            )
        )
    except Exception:
        org_ids = set()

    ids: list[int] = []
    for s in AIKnowledgeSpace.objects.all():
        if s.scope == "GLOBAL":
            ids.append(s.id)
        elif s.scope == "ORG" and s.organization_id in org_ids:
            ids.append(s.id)
        elif s.scope == "COURSE" and (s.course_id in owned or s.course_id in enrolled):
            ids.append(s.id)
        elif s.scope == "INSTRUCTOR" and s.owner_id == user.id:
            ids.append(s.id)
        elif s.scope == "PRIVATE" and s.owner_id == user.id:
            ids.append(s.id)
    return ids


class KBSpaceListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Liste des espaces KB visibles")
    def get(self, request):
        if not user_can_use_assistant(request.user):
            return _forbidden(request.user)
        ids = _visible_space_ids(request.user)
        qs = AIKnowledgeSpace.objects.filter(id__in=ids).order_by("scope", "name")
        return Response({"spaces": SpaceSerializer(qs, many=True).data})

    @extend_schema(summary="Créer un espace KB", request=SpaceCreateSerializer)
    def post(self, request):
        if not _is_editor(request.user):
            return _forbidden(request.user)
        s = SpaceCreateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        data = s.validated_data

        scope = data["scope"]
        # Empêche un instructeur de créer un ADMIN ou GLOBAL.
        if scope in ("ADMIN", "GLOBAL") and not getattr(request.user, "is_platform_admin", False):
            return Response(
                {"detail": "Seul un admin plateforme peut créer un espace ADMIN/GLOBAL."},
                status=403,
            )
        space = AIKnowledgeSpace.objects.create(
            name=data["name"][:140],
            scope=scope,
            owner=request.user,
            organization_id=data.get("organization_id"),
            course_id=data.get("course_id"),
            description=data.get("description") or "",
        )
        return Response(SpaceSerializer(space).data, status=201)


# ─────────────────────────────────────────────────────────────
# Documents
# ─────────────────────────────────────────────────────────────


class KBDocumentListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Liste des documents KB visibles")
    def get(self, request):
        if not user_can_use_assistant(request.user):
            return _forbidden(request.user)
        space_ids = _visible_space_ids(request.user)
        qs = AIKnowledgeDocument.objects.filter(space_id__in=space_ids).select_related("space").order_by(
            "-updated_at"
        )
        paginator = PageNumberPagination()
        paginator.page_size = 30
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response(DocumentSerializer(page, many=True).data)

    @extend_schema(summary="Créer + indexer un document", request=DocumentCreateSerializer)
    def post(self, request):
        if not _is_editor(request.user):
            return _forbidden(request.user)
        s = DocumentCreateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        data = s.validated_data

        space = AIKnowledgeSpace.objects.filter(pk=data["space_id"]).first()
        if not space:
            return Response({"detail": "Espace introuvable."}, status=404)
        # RBAC : l'user doit avoir accès à cet espace (owner, admin, ou org)
        if space.id not in _visible_space_ids(request.user):
            return Response({"detail": "Espace non accessible."}, status=403)

        doc = AIKnowledgeDocument.objects.create(
            space=space,
            title=data["title"][:240],
            content=data["content"],
            source_url=data.get("source_url") or "",
            doc_type=data.get("doc_type") or "MARKDOWN",
            language=data.get("language") or "fr",
            metadata=data.get("metadata") or {},
            created_by=request.user,
            status=AIKnowledgeDocument.Status.PENDING,
        )
        index_document(doc, actor=request.user)
        doc.refresh_from_db()
        return Response(DocumentSerializer(doc).data, status=201)


class KBDocumentDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get(self, request, document_id):
        if not user_can_use_assistant(request.user):
            return None, _forbidden()
        try:
            doc = AIKnowledgeDocument.objects.select_related("space").get(pk=document_id)
        except AIKnowledgeDocument.DoesNotExist:
            return None, Response({"detail": "Introuvable."}, status=404)
        if doc.space_id not in _visible_space_ids(request.user):
            return None, _forbidden()
        return doc, None

    def get(self, request, document_id: int):
        doc, err = self._get(request, document_id)
        if err:
            return err
        return Response(DocumentSerializer(doc).data)

    def patch(self, request, document_id: int):
        doc, err = self._get(request, document_id)
        if err:
            return err
        if not _is_editor(request.user):
            return _forbidden(request.user)
        allowed = {"title", "content", "source_url", "language", "metadata"}
        for key, val in (request.data or {}).items():
            if key in allowed:
                setattr(doc, key, val)
        doc.status = AIKnowledgeDocument.Status.PENDING
        doc.save()
        return Response(DocumentSerializer(doc).data)

    def delete(self, request, document_id: int):
        doc, err = self._get(request, document_id)
        if err:
            return err
        if not _is_editor(request.user):
            return _forbidden(request.user)
        delete_document_chunks(doc)
        doc.delete()
        return Response(status=204)


class KBDocumentReindexView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Re-indexer un document")
    def post(self, request, document_id: int):
        if not _is_editor(request.user):
            return _forbidden(request.user)
        try:
            doc = AIKnowledgeDocument.objects.get(pk=document_id)
        except AIKnowledgeDocument.DoesNotExist:
            return Response({"detail": "Introuvable."}, status=404)
        if doc.space_id not in _visible_space_ids(request.user):
            return _forbidden(request.user)
        reindex_document(doc, actor=request.user)
        doc.refresh_from_db()
        return Response(DocumentSerializer(doc).data)


# ─────────────────────────────────────────────────────────────
# Search
# ─────────────────────────────────────────────────────────────


class KBSearchView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Recherche RAG dans les documents accessibles", request=SearchInput)
    def post(self, request):
        if not user_can_use_assistant(request.user):
            return _forbidden(request.user)
        s = SearchInput(data=request.data)
        s.is_valid(raise_exception=True)

        results = search_knowledge(
            user=request.user,
            query=s.validated_data["query"],
            limit=s.validated_data.get("limit") or 5,
        )
        payload = [
            {
                "document_id": r.document_id,
                "document_title": r.document_title,
                "space_id": r.space_id,
                "space_name": r.space_name,
                "space_scope": r.space_scope,
                "chunk_id": r.chunk_id,
                "chunk_idx": r.chunk_idx,
                "text": r.text,
                "score": round(r.score, 4),
                "source_url": r.source_url,
            }
            for r in results
        ]
        from ai.models import AIAuditLog

        AIAuditLog.objects.create(
            user=request.user,
            kind=AIAuditLog.Kind.KB_SEARCH,
            payload={
                "query": s.validated_data["query"][:200],
                "hits": len(payload),
            },
            ip=_client_ip(request),
        )
        return Response({"query": s.validated_data["query"], "results": payload})


class WebSearchView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Recherche Internet (avec allowlist/blocklist)", request=WebSearchInput)
    def post(self, request):
        if not user_can_use_assistant(request.user):
            return _forbidden(request.user)
        s = WebSearchInput(data=request.data)
        s.is_valid(raise_exception=True)
        payload = search_web(
            user=request.user,
            query=s.validated_data["query"],
            limit=s.validated_data.get("limit") or 5,
            ip=_client_ip(request),
        )
        return Response(payload)
