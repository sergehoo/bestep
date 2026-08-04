"""glossary.serializers — DRF serializers du lexique."""
from __future__ import annotations

from rest_framework import serializers

from core.sanitizers import sanitize_plain_text, sanitize_rich_html

from .models import (
    GlossaryCategory,
    GlossaryTerm,
    GlossaryVariant,
    GlossaryExample,
    GlossaryAssociation,
    GlossaryRelation,
    GlossarySuggestion,
    GlossaryFavorite,
    GlossaryUserNote,
)


# ─────────────────────────────────────────────────────────────
# Catégorie
# ─────────────────────────────────────────────────────────────

class GlossaryCategorySerializer(serializers.ModelSerializer):
    terms_count = serializers.SerializerMethodField()

    class Meta:
        model = GlossaryCategory
        fields = [
            "id", "name", "slug", "description",
            "icon", "color", "parent", "is_active",
            "order", "terms_count",
        ]

    def get_terms_count(self, obj) -> int:
        # Peut être surchargé via annotate() sur le queryset caller.
        return getattr(obj, "terms_count", None) or obj.terms.filter(
            is_active=True, status=GlossaryTerm.Status.VALIDATED,
        ).count()


# ─────────────────────────────────────────────────────────────
# Variantes & exemples (imbriqués)
# ─────────────────────────────────────────────────────────────

class GlossaryVariantSerializer(serializers.ModelSerializer):
    class Meta:
        model = GlossaryVariant
        fields = ["id", "variant", "variant_type", "is_case_sensitive"]


class GlossaryExampleSerializer(serializers.ModelSerializer):
    class Meta:
        model = GlossaryExample
        fields = ["id", "example", "source", "order"]


# ─────────────────────────────────────────────────────────────
# Terme — plusieurs représentations
# ─────────────────────────────────────────────────────────────

class GlossaryTermMiniSerializer(serializers.ModelSerializer):
    """Représentation compacte (pour listes, related, tooltips)."""
    category_name = serializers.CharField(source="category.name", read_only=True)
    category_color = serializers.CharField(source="category.color", read_only=True)

    class Meta:
        model = GlossaryTerm
        fields = [
            "id", "word", "slug", "short_definition",
            "category", "category_name", "category_color",
            "level", "domain", "scope", "updated_at",
        ]


class GlossaryTermListSerializer(serializers.ModelSerializer):
    """Représentation pour /lexique — carte."""
    category_name = serializers.CharField(source="category.name", read_only=True)
    category_slug = serializers.CharField(source="category.slug", read_only=True)
    category_color = serializers.CharField(source="category.color", read_only=True)
    variants_count = serializers.IntegerField(read_only=True, default=0)
    is_favorite = serializers.SerializerMethodField()
    first_letter = serializers.SerializerMethodField()

    class Meta:
        model = GlossaryTerm
        fields = [
            "id", "word", "slug", "search_key",
            "short_definition", "level", "domain", "scope",
            "category", "category_name", "category_slug", "category_color",
            "illustration_url", "view_count", "variants_count",
            "is_favorite", "first_letter", "updated_at",
        ]

    def get_is_favorite(self, obj) -> bool:
        request = self.context.get("request")
        user = getattr(request, "user", None) if request else None
        if not user or not user.is_authenticated:
            return False
        # Utilise l'annotation is_favorite si disponible (optim).
        if hasattr(obj, "_is_favorite"):
            return bool(obj._is_favorite)
        return GlossaryFavorite.objects.filter(user=user, term=obj).exists()

    def get_first_letter(self, obj) -> str:
        key = obj.search_key or obj.word or ""
        return (key[:1] or "#").upper()


class GlossaryTermDetailSerializer(serializers.ModelSerializer):
    """Représentation pour /lexique/:slug — page détail."""
    category = GlossaryCategorySerializer(read_only=True)
    variants = GlossaryVariantSerializer(many=True, read_only=True)
    examples = GlossaryExampleSerializer(many=True, read_only=True)
    related_terms = serializers.SerializerMethodField()
    associated_courses = serializers.SerializerMethodField()
    is_favorite = serializers.SerializerMethodField()
    user_note = serializers.SerializerMethodField()

    class Meta:
        model = GlossaryTerm
        fields = [
            "id", "word", "slug",
            "short_definition", "long_definition",
            "pronunciation", "language", "level",
            "category", "domain", "scope",
            "status", "is_active", "enable_auto_detection",
            "illustration_url", "external_source",
            "view_count",
            "variants", "examples", "related_terms",
            "associated_courses", "is_favorite", "user_note",
            "created_at", "updated_at", "published_at",
        ]

    def get_related_terms(self, obj):
        rels = obj.relations_out.select_related("target_term__category")[:8]
        return [
            {
                "id": r.target_term_id,
                "word": r.target_term.word,
                "slug": r.target_term.slug,
                "short_definition": r.target_term.short_definition,
                "relation_type": r.relation_type,
            }
            for r in rels
        ]

    def get_associated_courses(self, obj):
        assocs = (
            obj.associations.select_related("course")
            .filter(course__status="PUBLISHED")
            .distinct("course_id")
        )
        return [
            {
                "id": a.course_id,
                "title": a.course.title,
                "slug": a.course.slug,
            }
            for a in assocs[:20]
        ]

    def get_is_favorite(self, obj) -> bool:
        request = self.context.get("request")
        user = getattr(request, "user", None) if request else None
        if not user or not user.is_authenticated:
            return False
        return GlossaryFavorite.objects.filter(user=user, term=obj).exists()

    def get_user_note(self, obj):
        request = self.context.get("request")
        user = getattr(request, "user", None) if request else None
        if not user or not user.is_authenticated:
            return None
        note = GlossaryUserNote.objects.filter(user=user, term=obj).first()
        if not note:
            return None
        return {
            "note": note.note,
            "status": note.status,
            "updated_at": note.updated_at,
        }


class GlossaryTermDetectSerializer(serializers.ModelSerializer):
    """Payload minimal pour la détection frontend (compact, cache-friendly)."""
    variants = serializers.SerializerMethodField()

    class Meta:
        model = GlossaryTerm
        fields = [
            "id", "word", "slug", "short_definition",
            "is_case_sensitive", "variants",
        ]

    def get_variants(self, obj):
        return [
            {"variant": v.variant, "search_key": v.search_key}
            for v in obj.variants.all()
        ]


# ─────────────────────────────────────────────────────────────
# Suggestions & notes
# ─────────────────────────────────────────────────────────────

class GlossarySuggestionSerializer(serializers.ModelSerializer):
    suggested_by_name = serializers.SerializerMethodField()
    term_word = serializers.CharField(source="term.word", read_only=True)
    course_title = serializers.CharField(source="course.title", read_only=True)

    class Meta:
        model = GlossarySuggestion
        fields = [
            "id", "kind", "term", "term_word",
            "proposed_word", "proposed_definition",
            "course", "course_title", "lesson", "context",
            "status", "review_comment",
            "suggested_by", "suggested_by_name",
            "reviewed_by", "reviewed_at",
            "created_at",
        ]
        read_only_fields = [
            "status", "review_comment",
            "suggested_by", "reviewed_by", "reviewed_at", "created_at",
        ]

    def get_suggested_by_name(self, obj):
        if not obj.suggested_by_id:
            return "Anonyme"
        u = obj.suggested_by
        full = (u.get_full_name() or "").strip() if hasattr(u, "get_full_name") else ""
        return full or (u.email.split("@")[0] if u.email else "Apprenant")


class GlossaryUserNoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = GlossaryUserNote
        fields = ["id", "term", "note", "status", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


# ─────────────────────────────────────────────────────────────
# Écriture : create / update terme
# ─────────────────────────────────────────────────────────────

class GlossaryTermWriteSerializer(serializers.ModelSerializer):
    """Serializer d'écriture — variantes + exemples nested.

    GLOSS-14 :
      - Auto-validation : les termes créés par un instructor ou platform_admin
        sortent en ``status=validated`` par défaut (au lieu de draft). Seules
        les suggestions apprenants passent en pending queue.
      - Anti-doublons : refuse la création si un terme actif existe déjà
        avec la même search_key (mot normalisé). L'update ignore ce check
        sur le pk courant.
    """
    variants = GlossaryVariantSerializer(many=True, required=False)
    examples = GlossaryExampleSerializer(many=True, required=False)

    class Meta:
        model = GlossaryTerm
        fields = [
            "word", "slug", "short_definition", "long_definition",
            "pronunciation", "language", "level",
            "category", "domain", "scope",
            "status", "is_active", "is_case_sensitive",
            "enable_auto_detection",
            "illustration_url", "external_source",
            "variants", "examples",
        ]
        extra_kwargs = {"slug": {"required": False}}

    def validate_long_definition(self, value: str) -> str:
        """SEC : ``long_definition`` est du HTML rendu tel quel par le SPA
        (GlossaryTermPage). Il est écrit ici par l'admin, par l'import
        (``glossary/io_service.py``) et indirectement par le LLM via le tool
        ``analyze_content_for_glossary``. Allowlist appliquée à l'écriture."""
        return sanitize_rich_html(value)

    def validate_short_definition(self, value: str) -> str:
        """Jamais du HTML : affiché en texte dans les listes et tooltips."""
        return sanitize_plain_text(value)

    def validate_word(self, value: str) -> str:
        from .models import normalize_search_key
        key = normalize_search_key(value)
        qs = GlossaryTerm.objects.filter(
            search_key=key, is_active=True,
        ).exclude(status=GlossaryTerm.Status.ARCHIVED)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        existing = qs.first()
        if existing:
            raise serializers.ValidationError(
                f"Un terme actif existe déjà avec ce mot : « {existing.word} » "
                f"(#{existing.id}, statut {existing.status})."
            )
        return value

    def create(self, validated_data):
        from django.utils import timezone
        variants_data = validated_data.pop("variants", [])
        examples_data = validated_data.pop("examples", [])
        request = self.context.get("request")
        user = getattr(request, "user", None) if request else None
        if user and user.is_authenticated:
            validated_data["created_by"] = user
            # Auto-validation : les termes créés par instructor ou admin
            # sont considérés fiables. Seules les suggestions apprenants
            # (via /api/glossary/suggestions/) passent en pending.
            is_trusted = bool(
                getattr(user, "is_platform_admin", False)
                or getattr(user, "is_instructor", False)
            )
            if is_trusted:
                # Ne pas écraser un status explicitement passé (ex. draft
                # si le formateur veut un brouillon privé).
                if not validated_data.get("status"):
                    validated_data["status"] = GlossaryTerm.Status.VALIDATED
                if validated_data.get("status") == GlossaryTerm.Status.VALIDATED:
                    validated_data["validated_by"] = user
                    validated_data["published_at"] = timezone.now()
        term = GlossaryTerm.objects.create(**validated_data)
        for v in variants_data:
            GlossaryVariant.objects.create(term=term, **v)
        for e in examples_data:
            GlossaryExample.objects.create(term=term, **e)
        return term

    def update(self, instance, validated_data):
        variants_data = validated_data.pop("variants", None)
        examples_data = validated_data.pop("examples", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if variants_data is not None:
            instance.variants.all().delete()
            for v in variants_data:
                GlossaryVariant.objects.create(term=instance, **v)
        if examples_data is not None:
            instance.examples.all().delete()
            for e in examples_data:
                GlossaryExample.objects.create(term=instance, **e)
        return instance
