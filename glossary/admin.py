from django.contrib import admin
from import_export.admin import ImportExportModelAdmin

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
    GlossaryView,
    GlossaryRevision,
)
from .resources import (
    GlossaryCategoryResource,
    GlossaryExampleResource,
    GlossaryTermResource,
    GlossaryVariantResource,
)


class VariantInline(admin.TabularInline):
    model = GlossaryVariant
    extra = 0
    fields = ("variant", "variant_type", "is_case_sensitive")


class ExampleInline(admin.TabularInline):
    model = GlossaryExample
    extra = 0
    fields = ("example", "source", "order")


class AssociationInline(admin.TabularInline):
    model = GlossaryAssociation
    extra = 0
    fields = ("course", "section", "lesson", "priority", "is_detection_enabled")
    autocomplete_fields = ("course", "section", "lesson")


@admin.register(GlossaryCategory)
class GlossaryCategoryAdmin(ImportExportModelAdmin):
    resource_class = GlossaryCategoryResource
    list_display = ("name", "slug", "parent", "is_active", "order")
    list_filter = ("is_active", "parent")
    search_fields = ("name", "slug", "description")
    prepopulated_fields = {"slug": ("name",)}


@admin.register(GlossaryTerm)
class GlossaryTermAdmin(ImportExportModelAdmin):
    resource_class = GlossaryTermResource
    list_display = (
        "word", "category", "scope", "status",
        "is_active", "enable_auto_detection", "view_count", "updated_at",
    )
    list_filter = (
        "status", "scope", "is_active", "enable_auto_detection",
        "category", "level", "language",
    )
    search_fields = (
        "word", "slug", "search_key", "short_definition", "long_definition",
        "variants__variant",
    )
    prepopulated_fields = {"slug": ("word",)}
    readonly_fields = ("search_key", "view_count", "created_at", "updated_at")
    inlines = [VariantInline, ExampleInline, AssociationInline]
    autocomplete_fields = ("category", "created_by", "validated_by")
    fieldsets = (
        ("Identité", {
            "fields": (
                "word", "slug", "search_key", "language", "level",
                "pronunciation",
            )
        }),
        ("Définitions", {
            "fields": ("short_definition", "long_definition"),
        }),
        ("Classification", {
            "fields": ("category", "domain", "scope"),
        }),
        ("Statut & détection", {
            "fields": (
                "status", "is_active", "is_case_sensitive",
                "enable_auto_detection", "published_at",
            ),
        }),
        ("Médias", {
            "fields": ("illustration_url", "external_source"),
            "classes": ("collapse",),
        }),
        ("Audit", {
            "fields": ("view_count", "created_by", "validated_by",
                       "created_at", "updated_at"),
            "classes": ("collapse",),
        }),
    )


@admin.register(GlossarySuggestion)
class GlossarySuggestionAdmin(admin.ModelAdmin):
    list_display = (
        "kind", "proposed_word", "term", "suggested_by",
        "status", "created_at",
    )
    list_filter = ("status", "kind")
    search_fields = ("proposed_word", "proposed_definition", "context")
    autocomplete_fields = (
        "term", "suggested_by", "course", "lesson", "reviewed_by",
    )


@admin.register(GlossaryFavorite)
class GlossaryFavoriteAdmin(admin.ModelAdmin):
    list_display = ("user", "term", "created_at")
    search_fields = ("user__email", "term__word")
    autocomplete_fields = ("user", "term")


@admin.register(GlossaryUserNote)
class GlossaryUserNoteAdmin(admin.ModelAdmin):
    list_display = ("user", "term", "status", "updated_at")
    list_filter = ("status",)
    search_fields = ("user__email", "term__word", "note")
    autocomplete_fields = ("user", "term")


@admin.register(GlossaryView)
class GlossaryViewAdmin(admin.ModelAdmin):
    list_display = ("term", "user", "course", "lesson", "viewed_at")
    list_filter = ("viewed_at",)
    autocomplete_fields = ("user", "term", "course", "lesson")


@admin.register(GlossaryRevision)
class GlossaryRevisionAdmin(admin.ModelAdmin):
    list_display = ("term", "version", "modified_by", "created_at")
    list_filter = ("created_at",)
    readonly_fields = ("previous_data", "new_data", "created_at")
    autocomplete_fields = ("term", "modified_by")


@admin.register(GlossaryRelation)
class GlossaryRelationAdmin(admin.ModelAdmin):
    list_display = ("source_term", "relation_type", "target_term")
    list_filter = ("relation_type",)
    autocomplete_fields = ("source_term", "target_term")
