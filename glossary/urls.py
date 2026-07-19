"""glossary.urls — Routes du module lexique."""
from django.urls import path
from . import views as v

app_name = "glossary"

urlpatterns = [
    # Catégories
    path("categories/", v.GlossaryCategoryListView.as_view(), name="categories"),

    # Termes — liste + détail + recherche + agrégats
    path("terms/", v.GlossaryTermListView.as_view(), name="term-list"),
    path("terms/search/", v.GlossaryTermSearchView.as_view(), name="term-search"),
    path("terms/alphabet/", v.GlossaryAlphabetIndexView.as_view(), name="term-alphabet"),
    path("terms/popular/", v.GlossaryPopularView.as_view(), name="term-popular"),
    path("terms/recent/", v.GlossaryRecentView.as_view(), name="term-recent"),
    path("terms/<slug:slug>/", v.GlossaryTermDetailView.as_view(), name="term-detail"),

    # Actions utilisateur
    path("terms/<slug:slug>/favorite/", v.GlossaryFavoriteView.as_view(), name="term-favorite"),
    path("terms/<slug:slug>/note/", v.GlossaryUserNoteView.as_view(), name="term-note"),

    # Section perso
    path("my/favorites/", v.GlossaryMyFavoritesView.as_view(), name="my-favorites"),

    # Suggestions
    path("suggestions/", v.GlossarySuggestionCreateView.as_view(), name="suggestions"),

    # Détection dans un cours / leçon
    path("courses/<slug:slug>/terms/", v.GlossaryCourseTermsView.as_view(), name="course-terms"),
    path("lessons/<int:lesson_id>/terms/", v.GlossaryLessonTermsView.as_view(), name="lesson-terms"),

    # GLOSS-6 — CRUD formateur (mes termes + soumission au global).
    path("instructor/terms/", v.InstructorGlossaryListView.as_view(), name="instructor-terms"),
    path("instructor/terms/<int:term_id>/", v.InstructorGlossaryDetailView.as_view(), name="instructor-term-detail"),
    path("instructor/terms/<int:term_id>/submit/", v.InstructorGlossarySubmitView.as_view(), name="instructor-term-submit"),

    # GLOSS-8 — Modération admin (validation, rejet, fusion de doublons).
    path("admin/terms/", v.AdminGlossaryListView.as_view(), name="admin-terms"),
    path("admin/terms/<int:term_id>/validate/", v.AdminGlossaryValidateView.as_view(), name="admin-term-validate"),
    path("admin/terms/<int:term_id>/reject/", v.AdminGlossaryRejectView.as_view(), name="admin-term-reject"),
    path("admin/terms/<int:term_id>/merge/", v.AdminGlossaryMergeView.as_view(), name="admin-term-merge"),
]
