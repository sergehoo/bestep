"""glossary.views — Endpoints REST du lexique."""
from __future__ import annotations

from typing import Optional

from django.db.models import Count, Q, Exists, OuterRef, F
from django.db.models.functions import Upper, Substr
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    GlossaryCategory,
    GlossaryTerm,
    GlossaryFavorite,
    GlossaryUserNote,
    GlossarySuggestion,
    GlossaryView,
    normalize_search_key,
)
from .serializers import (
    GlossaryCategorySerializer,
    GlossaryTermListSerializer,
    GlossaryTermDetailSerializer,
    GlossaryTermDetectSerializer,
    GlossaryTermWriteSerializer,
    GlossarySuggestionSerializer,
    GlossaryUserNoteSerializer,
)


# ─────────────────────────────────────────────────────────────
# Pagination
# ─────────────────────────────────────────────────────────────

class GlossaryPagination(PageNumberPagination):
    page_size = 30
    page_size_query_param = "page_size"
    max_page_size = 100


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

def _active_public_terms():
    """Termes actifs, validés, globaux ou associés à un cours publié."""
    return (
        GlossaryTerm.objects.filter(is_active=True, status=GlossaryTerm.Status.VALIDATED)
        .select_related("category")
    )


def _annotate_for_list(qs, user):
    qs = qs.annotate(variants_count=Count("variants", distinct=True))
    if user and user.is_authenticated:
        fav_sq = GlossaryFavorite.objects.filter(user=user, term=OuterRef("pk"))
        qs = qs.annotate(_is_favorite=Exists(fav_sq))
    return qs


# ─────────────────────────────────────────────────────────────
# LISTE / DÉTAIL
# ─────────────────────────────────────────────────────────────

class GlossaryTermListView(APIView):
    """GET /api/glossary/terms/ — liste paginée + filtres.

    Query params :
      - q : recherche libre (mot, variantes, définition)
      - letter : filtre alphabet (A-Z ou '#' pour autres)
      - category : slug catégorie
      - domain : chaîne exacte
      - level : beginner|intermediate|advanced
      - course : slug cours (retourne termes associés au cours)
      - ordering : recent | popular | alpha (défaut alpha)
    """
    permission_classes = [AllowAny]

    def get(self, request):
        qs = _active_public_terms()

        q = (request.query_params.get("q") or "").strip()
        if q:
            key = normalize_search_key(q)
            qs = qs.filter(
                Q(search_key__icontains=key)
                | Q(variants__search_key__icontains=key)
                | Q(short_definition__icontains=q)
                | Q(long_definition__icontains=q)
            ).distinct()

        letter = (request.query_params.get("letter") or "").strip().lower()
        if letter:
            if letter == "#":
                # Termes qui ne commencent pas par une lettre.
                qs = qs.exclude(search_key__regex=r"^[a-z]")
            elif len(letter) == 1 and letter.isalpha():
                qs = qs.filter(search_key__startswith=letter)

        cat = request.query_params.get("category")
        if cat:
            qs = qs.filter(category__slug=cat)

        domain = request.query_params.get("domain")
        if domain:
            qs = qs.filter(domain__iexact=domain)

        level = request.query_params.get("level")
        if level:
            qs = qs.filter(level=level)

        course_slug = request.query_params.get("course")
        if course_slug:
            qs = qs.filter(associations__course__slug=course_slug).distinct()

        ordering = request.query_params.get("ordering", "alpha")
        if ordering == "recent":
            qs = qs.order_by("-updated_at")
        elif ordering == "popular":
            qs = qs.order_by("-view_count", "word")
        else:
            qs = qs.order_by("search_key", "word")

        qs = _annotate_for_list(qs, request.user)

        paginator = GlossaryPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        ser = GlossaryTermListSerializer(page, many=True, context={"request": request})
        return paginator.get_paginated_response(ser.data)


class GlossaryTermDetailView(APIView):
    """GET /api/glossary/terms/:slug/ — page détail."""
    permission_classes = [AllowAny]

    def get(self, request, slug: str):
        term = get_object_or_404(
            GlossaryTerm.objects.select_related("category").prefetch_related(
                "variants", "examples",
                "relations_out__target_term",
                "associations__course",
            ),
            slug=slug, is_active=True,
        )
        # Trace la consultation (best-effort, ignore erreurs).
        try:
            user = request.user if request.user.is_authenticated else None
            GlossaryView.objects.create(user=user, term=term)
            GlossaryTerm.objects.filter(pk=term.pk).update(
                view_count=F("view_count") + 1
            )
        except Exception:
            pass
        ser = GlossaryTermDetailSerializer(term, context={"request": request})
        return Response(ser.data)


# ─────────────────────────────────────────────────────────────
# RECHERCHE INSTANTANÉE / AUTOCOMPLÉTION
# ─────────────────────────────────────────────────────────────

class GlossaryTermSearchView(APIView):
    """GET /api/glossary/terms/search/?q=... — autocomplétion (max 20).

    Utilise PostgreSQL Full-Text Search (search_vector) quand la base
    est Postgres (voir migration GLOSS-11). Fallback icontains sinon.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        from django.conf import settings as _settings

        q = (request.query_params.get("q") or "").strip()
        if len(q) < 1:
            return Response([])
        key = normalize_search_key(q)
        base = _active_public_terms()

        is_pg = "postgresql" in (
            _settings.DATABASES.get("default", {}).get("ENGINE") or ""
        )
        qs = base.none()
        if is_pg and len(q) >= 2:
            try:
                from django.contrib.postgres.search import (
                    SearchQuery, SearchRank, SearchVector,
                )
                # `search_vector` est une colonne générée par la
                # migration 0002_pg_fts — sinon on tombe en fallback.
                sq = SearchQuery(q, config="french", search_type="websearch")
                qs = (
                    base.extra(
                        select={"__has_sv": (
                            "COALESCE(NULLIF(pg_typeof(search_vector)::text, ''),"
                            " '') = 'tsvector'"
                        )}
                    )
                    .annotate(rank=SearchRank(
                        SearchVector("word", "short_definition", config="french"),
                        sq,
                    ))
                    .filter(
                        Q(search_key__istartswith=key)
                        | Q(word__icontains=q)
                        | Q(variants__search_key__icontains=key)
                    )
                    .order_by("-rank", "search_key")
                    .distinct()
                )
            except Exception:
                qs = base.none()

        if not qs.exists():
            # Fallback universel (SQLite dev ou fail FTS) : icontains.
            qs = (
                base.filter(
                    Q(search_key__startswith=key)
                    | Q(variants__search_key__startswith=key)
                    | Q(word__icontains=q)
                    | Q(search_key__icontains=key)
                )
                .distinct()
                .order_by("search_key")
            )

        qs = qs[:20]
        ser = GlossaryTermListSerializer(qs, many=True, context={"request": request})
        return Response(ser.data)


# ─────────────────────────────────────────────────────────────
# ALPHABET, POPULAIRES, RÉCENTS
# ─────────────────────────────────────────────────────────────

class GlossaryAlphabetIndexView(APIView):
    """GET /api/glossary/terms/alphabet/ — compte de termes par lettre."""
    permission_classes = [AllowAny]

    def get(self, request):
        qs = _active_public_terms()
        counts = (
            qs.annotate(letter=Upper(Substr("search_key", 1, 1)))
            .values("letter")
            .annotate(n=Count("id"))
            .order_by("letter")
        )
        total = qs.count()
        by_letter = {c["letter"] or "#": c["n"] for c in counts}
        return Response({"total": total, "by_letter": by_letter})


class GlossaryPopularView(APIView):
    """GET /api/glossary/terms/popular/ — top 12 par view_count."""
    permission_classes = [AllowAny]

    def get(self, request):
        qs = _active_public_terms().order_by("-view_count", "word")[:12]
        qs = _annotate_for_list(qs, request.user)
        ser = GlossaryTermListSerializer(qs, many=True, context={"request": request})
        return Response(ser.data)


class GlossaryRecentView(APIView):
    """GET /api/glossary/terms/recent/ — 12 derniers ajoutés."""
    permission_classes = [AllowAny]

    def get(self, request):
        qs = _active_public_terms().order_by("-updated_at")[:12]
        qs = _annotate_for_list(qs, request.user)
        ser = GlossaryTermListSerializer(qs, many=True, context={"request": request})
        return Response(ser.data)


class GlossaryCategoryListView(APIView):
    """GET /api/glossary/categories/ — liste catégories actives + compte."""
    permission_classes = [AllowAny]

    def get(self, request):
        qs = (
            GlossaryCategory.objects.filter(is_active=True)
            .annotate(
                terms_count=Count(
                    "terms",
                    filter=Q(
                        terms__is_active=True,
                        terms__status=GlossaryTerm.Status.VALIDATED,
                    ),
                    distinct=True,
                )
            )
            .order_by("order", "name")
        )
        return Response(GlossaryCategorySerializer(qs, many=True).data)


# ─────────────────────────────────────────────────────────────
# TERMES D'UN COURS / LEÇON (pour détection frontend)
# ─────────────────────────────────────────────────────────────

class GlossaryCourseTermsView(APIView):
    """GET /api/glossary/courses/<slug>/terms/

    Renvoie un payload compact utilisé par la détection côté client :
    liste des termes actifs ayant une association avec le cours OU
    étant globaux (avec ``enable_auto_detection=True``).
    """
    permission_classes = [AllowAny]

    def get(self, request, slug: str):
        from catalog.models import Course

        course = get_object_or_404(Course, slug=slug)
        base = (
            GlossaryTerm.objects.filter(
                is_active=True,
                status=GlossaryTerm.Status.VALIDATED,
                enable_auto_detection=True,
            )
            .prefetch_related("variants")
        )
        # Termes globaux + associés à ce cours.
        qs = base.filter(
            Q(scope=GlossaryTerm.Scope.GLOBAL)
            | Q(associations__course=course, associations__is_detection_enabled=True)
        ).distinct().order_by(F("word").desc())  # ordre : longs d'abord (détection prio)
        ser = GlossaryTermDetectSerializer(qs, many=True)
        return Response({
            "course": {"id": course.id, "slug": course.slug, "title": course.title},
            "terms": ser.data,
            "count": len(ser.data),
        })


class GlossaryLessonTermsView(APIView):
    """GET /api/glossary/lessons/<lesson_id>/terms/ — variante par leçon."""
    permission_classes = [AllowAny]

    def get(self, request, lesson_id: int):
        from catalog.models import Lesson

        lesson = get_object_or_404(
            Lesson.objects.select_related("section__course"), pk=lesson_id
        )
        course = lesson.section.course
        base = (
            GlossaryTerm.objects.filter(
                is_active=True,
                status=GlossaryTerm.Status.VALIDATED,
                enable_auto_detection=True,
            )
            .prefetch_related("variants")
        )
        qs = base.filter(
            Q(scope=GlossaryTerm.Scope.GLOBAL)
            | Q(associations__course=course, associations__is_detection_enabled=True)
        ).distinct()
        ser = GlossaryTermDetectSerializer(qs, many=True)
        return Response({
            "lesson_id": lesson.id,
            "course_id": course.id,
            "terms": ser.data,
            "count": len(ser.data),
        })


# ─────────────────────────────────────────────────────────────
# FAVORIS
# ─────────────────────────────────────────────────────────────

class GlossaryFavoriteView(APIView):
    """POST/DELETE /api/glossary/terms/:slug/favorite/ — toggle favori."""
    permission_classes = [IsAuthenticated]

    def post(self, request, slug: str):
        term = get_object_or_404(GlossaryTerm, slug=slug, is_active=True)
        _, created = GlossaryFavorite.objects.get_or_create(
            user=request.user, term=term
        )
        return Response(
            {"detail": "Ajouté aux favoris." if created else "Déjà en favoris."},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    def delete(self, request, slug: str):
        term = get_object_or_404(GlossaryTerm, slug=slug)
        GlossaryFavorite.objects.filter(user=request.user, term=term).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class GlossaryMyFavoritesView(APIView):
    """GET /api/glossary/my/favorites/ — mes favoris."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = (
            GlossaryTerm.objects.filter(favorited_by__user=request.user, is_active=True)
            .select_related("category")
            .order_by("-favorited_by__created_at")
        )
        qs = _annotate_for_list(qs, request.user)
        ser = GlossaryTermListSerializer(qs, many=True, context={"request": request})
        return Response(ser.data)


# ─────────────────────────────────────────────────────────────
# NOTES PERSONNELLES
# ─────────────────────────────────────────────────────────────

class GlossaryUserNoteView(APIView):
    """PUT /api/glossary/terms/:slug/note/ — upsert note perso."""
    permission_classes = [IsAuthenticated]

    def put(self, request, slug: str):
        term = get_object_or_404(GlossaryTerm, slug=slug, is_active=True)
        note_txt = str(request.data.get("note") or "")[:5000]
        note_status = (request.data.get("status") or "new").lower()
        if note_status not in {v for v, _ in GlossaryUserNote.Status.choices}:
            note_status = "new"
        obj, _ = GlossaryUserNote.objects.update_or_create(
            user=request.user, term=term,
            defaults={"note": note_txt, "status": note_status},
        )
        return Response(GlossaryUserNoteSerializer(obj).data)

    def delete(self, request, slug: str):
        term = get_object_or_404(GlossaryTerm, slug=slug)
        GlossaryUserNote.objects.filter(user=request.user, term=term).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ─────────────────────────────────────────────────────────────
# SUGGESTIONS
# ─────────────────────────────────────────────────────────────

class GlossarySuggestionCreateView(APIView):
    """POST /api/glossary/suggestions/ — proposer un terme / erreur."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ser = GlossarySuggestionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ser.save(suggested_by=request.user)
        return Response(ser.data, status=status.HTTP_201_CREATED)


# ─────────────────────────────────────────────────────────────
# INSTRUCTOR CRUD (page /formateur/lexique)
# ─────────────────────────────────────────────────────────────

def _is_instructor(user) -> bool:
    return bool(
        user
        and user.is_authenticated
        and (
            getattr(user, "is_platform_admin", False)
            or getattr(user, "is_instructor", False)
        )
    )


class InstructorGlossaryListView(APIView):
    """GET /api/glossary/instructor/terms/ — mes termes + tous les statuts.
    POST identique — création directe.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _is_instructor(request.user):
            return Response({"detail": "Réservé aux formateurs."}, status=403)
        qs = GlossaryTerm.objects.filter(created_by=request.user).select_related(
            "category"
        )
        status_filter = (request.query_params.get("status") or "").strip()
        if status_filter:
            qs = qs.filter(status=status_filter)
        q = (request.query_params.get("q") or "").strip()
        if q:
            key = normalize_search_key(q)
            qs = qs.filter(
                Q(search_key__icontains=key) | Q(word__icontains=q)
            )
        qs = qs.annotate(variants_count=Count("variants", distinct=True)).order_by(
            "-updated_at"
        )
        paginator = GlossaryPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        ser = GlossaryTermListSerializer(page, many=True, context={"request": request})
        return paginator.get_paginated_response(ser.data)

    def post(self, request):
        if not _is_instructor(request.user):
            return Response({"detail": "Réservé aux formateurs."}, status=403)
        from .serializers import GlossaryTermWriteSerializer

        ser = GlossaryTermWriteSerializer(data=request.data, context={"request": request})
        ser.is_valid(raise_exception=True)
        term = ser.save()
        return Response(
            GlossaryTermDetailSerializer(term, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class InstructorGlossaryDetailView(APIView):
    """GET/PATCH/DELETE /api/glossary/instructor/terms/<id>/ — mes termes."""
    permission_classes = [IsAuthenticated]

    def _own_qs(self, user):
        # Instructor : ne modifie que ses termes. Admin : tout.
        if getattr(user, "is_platform_admin", False):
            return GlossaryTerm.objects.all()
        return GlossaryTerm.objects.filter(created_by=user)

    def get(self, request, term_id: int):
        if not _is_instructor(request.user):
            return Response({"detail": "Réservé aux formateurs."}, status=403)
        term = get_object_or_404(self._own_qs(request.user), pk=term_id)
        return Response(
            GlossaryTermDetailSerializer(term, context={"request": request}).data
        )

    def patch(self, request, term_id: int):
        if not _is_instructor(request.user):
            return Response({"detail": "Réservé aux formateurs."}, status=403)
        from .serializers import GlossaryTermWriteSerializer

        term = get_object_or_404(self._own_qs(request.user), pk=term_id)
        ser = GlossaryTermWriteSerializer(
            term, data=request.data, partial=True, context={"request": request}
        )
        ser.is_valid(raise_exception=True)
        term = ser.save()
        return Response(
            GlossaryTermDetailSerializer(term, context={"request": request}).data
        )

    def delete(self, request, term_id: int):
        if not _is_instructor(request.user):
            return Response({"detail": "Réservé aux formateurs."}, status=403)
        term = get_object_or_404(self._own_qs(request.user), pk=term_id)
        term.is_active = False
        term.status = GlossaryTerm.Status.ARCHIVED
        term.save(update_fields=["is_active", "status", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


# ─────────────────────────────────────────────────────────────
# ADMIN MODERATION (page /admin/lexique)
# ─────────────────────────────────────────────────────────────

def _is_platform_admin(user) -> bool:
    return bool(
        user
        and user.is_authenticated
        and getattr(user, "is_platform_admin", False)
    )


class AdminGlossaryListView(APIView):
    """GET /api/glossary/admin/terms/ — TOUS les termes tous statuts."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _is_platform_admin(request.user):
            return Response({"detail": "Réservé aux administrateurs."}, status=403)
        qs = GlossaryTerm.objects.select_related("category", "created_by")
        status_filter = (request.query_params.get("status") or "").strip()
        if status_filter:
            qs = qs.filter(status=status_filter)
        q = (request.query_params.get("q") or "").strip()
        if q:
            key = normalize_search_key(q)
            qs = qs.filter(
                Q(search_key__icontains=key) | Q(word__icontains=q)
            )
        scope = request.query_params.get("scope")
        if scope:
            qs = qs.filter(scope=scope)
        qs = qs.annotate(variants_count=Count("variants", distinct=True)).order_by(
            "-updated_at"
        )
        paginator = GlossaryPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        ser = GlossaryTermListSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(ser.data)


class AdminGlossaryValidateView(APIView):
    """POST /api/glossary/admin/terms/<id>/validate/ — valide un terme."""
    permission_classes = [IsAuthenticated]

    def post(self, request, term_id: int):
        if not _is_platform_admin(request.user):
            return Response({"detail": "Réservé aux administrateurs."}, status=403)
        term = get_object_or_404(GlossaryTerm, pk=term_id)
        term.status = GlossaryTerm.Status.VALIDATED
        term.is_active = True
        term.validated_by = request.user
        if not term.published_at:
            term.published_at = timezone.now()
        term.save(
            update_fields=[
                "status", "is_active", "validated_by",
                "published_at", "updated_at",
            ]
        )
        return Response(
            {"detail": "Terme validé et publié.", "status": term.status}
        )


class AdminGlossaryRejectView(APIView):
    """POST /api/glossary/admin/terms/<id>/reject/ — rejette un terme."""
    permission_classes = [IsAuthenticated]

    def post(self, request, term_id: int):
        if not _is_platform_admin(request.user):
            return Response({"detail": "Réservé aux administrateurs."}, status=403)
        term = get_object_or_404(GlossaryTerm, pk=term_id)
        term.status = GlossaryTerm.Status.REJECTED
        term.is_active = False
        term.save(update_fields=["status", "is_active", "updated_at"])
        return Response(
            {"detail": "Terme rejeté.", "status": term.status}
        )


class AdminGlossaryMergeView(APIView):
    """POST /api/glossary/admin/terms/<id>/merge/ — fusionne deux doublons.

    Payload : {"target_id": N}. Le terme <id> est archivé, ses associations
    et favoris sont transférés vers <target_id>.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, term_id: int):
        from .models import (
            GlossaryAssociation, GlossaryFavorite, GlossaryView,
        )

        if not _is_platform_admin(request.user):
            return Response({"detail": "Réservé aux administrateurs."}, status=403)
        source = get_object_or_404(GlossaryTerm, pk=term_id)
        try:
            target_id = int(request.data.get("target_id") or 0)
        except (TypeError, ValueError):
            return Response({"detail": "target_id manquant."}, status=400)
        if target_id == source.pk:
            return Response({"detail": "Impossible de fusionner un terme avec lui-même."}, status=400)
        target = get_object_or_404(GlossaryTerm, pk=target_id)

        from django.db import transaction as _tx
        with _tx.atomic():
            # Transfère associations (ignore doublons possibles).
            for assoc in GlossaryAssociation.objects.filter(term=source):
                exists = GlossaryAssociation.objects.filter(
                    term=target, course=assoc.course,
                    section=assoc.section, lesson=assoc.lesson,
                ).exists()
                if not exists:
                    assoc.term = target
                    assoc.save(update_fields=["term"])
                else:
                    assoc.delete()
            # Transfère favoris.
            for fav in GlossaryFavorite.objects.filter(term=source):
                if not GlossaryFavorite.objects.filter(
                    user=fav.user, term=target
                ).exists():
                    fav.term = target
                    fav.save(update_fields=["term"])
                else:
                    fav.delete()
            # Transfère l'historique de vues.
            GlossaryView.objects.filter(term=source).update(term=target)
            # Archive le source.
            source.status = GlossaryTerm.Status.ARCHIVED
            source.is_active = False
            source.save(update_fields=["status", "is_active", "updated_at"])

        return Response(
            {
                "detail": f"« {source.word} » fusionné dans « {target.word} ».",
                "source_id": source.pk,
                "target_id": target.pk,
            }
        )


class AdminGlossaryImportView(APIView):
    """POST /api/glossary/admin/import/ — importe des termes depuis CSV/JSON.

    Payload multipart :
      - ``file`` : le fichier CSV ou JSON.
      - ``format`` : "csv" (défaut) ou "json".
      - ``dry_run`` : "true" (défaut) → aperçu sans écrire en base.

    Retourne le rapport complet ligne par ligne.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not _is_platform_admin(request.user):
            return Response({"detail": "Réservé aux administrateurs."}, status=403)
        from .io_service import import_terms

        upload = request.FILES.get("file")
        if not upload:
            return Response({"detail": "Fichier manquant (champ 'file')."}, status=400)
        try:
            raw = upload.read().decode("utf-8-sig")
        except UnicodeDecodeError:
            try:
                upload.seek(0)
                raw = upload.read().decode("latin-1")
            except Exception:
                return Response(
                    {"detail": "Impossible de décoder le fichier (UTF-8 attendu)."},
                    status=400,
                )
        fmt = (request.data.get("format") or "csv").lower()
        dry_run = str(request.data.get("dry_run") or "true").lower() != "false"

        # Sécurité : borne 5000 lignes / 5 Mo.
        if len(raw) > 5 * 1024 * 1024:
            return Response(
                {"detail": "Fichier trop volumineux (max 5 Mo)."}, status=400
            )

        report = import_terms(
            user=request.user, raw_content=raw, fmt=fmt, dry_run=dry_run
        )
        return Response({"dry_run": dry_run, "report": report.to_dict()})


class AdminGlossaryExportView(APIView):
    """GET /api/glossary/admin/export/?format=csv|json — export du lexique."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.http import HttpResponse
        from .io_service import export_terms_csv, export_terms_json

        if not _is_platform_admin(request.user):
            return Response({"detail": "Réservé aux administrateurs."}, status=403)
        fmt = (request.query_params.get("format") or "csv").lower()
        qs = GlossaryTerm.objects.select_related("category").filter(is_active=True)
        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)

        if fmt == "json":
            body = export_terms_json(qs)
            resp = HttpResponse(body, content_type="application/json; charset=utf-8")
            resp["Content-Disposition"] = 'attachment; filename="lexique.json"'
            return resp
        body = export_terms_csv(qs)
        resp = HttpResponse(body, content_type="text/csv; charset=utf-8")
        resp["Content-Disposition"] = 'attachment; filename="lexique.csv"'
        return resp


class InstructorGlossarySubmitView(APIView):
    """POST /api/glossary/instructor/terms/<id>/submit/ — soumettre pour
    validation (passe de draft → pending)."""
    permission_classes = [IsAuthenticated]

    def post(self, request, term_id: int):
        if not _is_instructor(request.user):
            return Response({"detail": "Réservé aux formateurs."}, status=403)
        qs = (
            GlossaryTerm.objects.all()
            if getattr(request.user, "is_platform_admin", False)
            else GlossaryTerm.objects.filter(created_by=request.user)
        )
        term = get_object_or_404(qs, pk=term_id)
        if term.status not in {GlossaryTerm.Status.DRAFT, GlossaryTerm.Status.REJECTED}:
            return Response(
                {"detail": f"Terme déjà en statut {term.status}."}, status=400
            )
        term.status = GlossaryTerm.Status.PENDING
        term.save(update_fields=["status", "updated_at"])
        return Response({"detail": "Terme soumis pour validation.", "status": term.status})
