"""
reviews/admin.py — CORRECTIF P1.D (audit REV-12).

Avant : ``admin.py`` vide → modérateurs sans interface. Après : interface
complète avec filtres, actions de modération bulk, et recherche.
"""
from __future__ import annotations

from django.contrib import admin

from .models import CourseReview


@admin.register(CourseReview)
class CourseReviewAdmin(admin.ModelAdmin):
    list_display = ("id", "course", "user", "rating", "is_public", "created_at")
    list_filter = ("rating", "is_public", "created_at")
    search_fields = ("user__email", "user__full_name", "course__title", "comment")
    list_select_related = ("course", "user")
    ordering = ("-created_at",)
    actions = ["hide_reviews", "publish_reviews"]
    readonly_fields = ("created_at", "updated_at")

    @admin.action(description="Masquer les avis sélectionnés")
    def hide_reviews(self, request, queryset):
        updated = queryset.update(is_public=False)
        self.message_user(request, f"{updated} avis masqué(s).")

    @admin.action(description="Publier les avis sélectionnés")
    def publish_reviews(self, request, queryset):
        updated = queryset.update(is_public=True)
        self.message_user(request, f"{updated} avis publié(s).")
