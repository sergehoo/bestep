"""glossary.models — Modèles du lexique pédagogique.

Ce module implémente le RFC lexique v1 : dictionnaire interne avec
support des variantes, associations aux cours, favoris et audit.

Points clés :
    - Recherche : ``search_key`` (str lowercase sans accents, indexée)
      permet des lookups rapides sur mot + variantes.
    - Priorisation : ``GlossaryAssociation.priority`` détermine si une
      définition custom l'emporte sur la définition globale.
    - Sécurité : slug unique, ``created_by`` on-delete SET_NULL pour
      éviter la perte de données lors de la suppression d'un compte.
    - Historique : ``GlossaryRevision`` conserve un snapshot JSON à
      chaque modification (voir signals).
"""
from __future__ import annotations

import unicodedata
from django.conf import settings
from django.db import models
from django.utils.text import slugify


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

def normalize_search_key(text: str) -> str:
    """Normalise une chaîne pour la recherche (lowercase + no accents).

    Utilisée pour ``GlossaryTerm.search_key`` et
    ``GlossaryVariant.search_key`` afin de matcher les recherches
    utilisateur indépendamment de la casse et des accents.
    """
    if not text:
        return ""
    txt = unicodedata.normalize("NFD", str(text))
    txt = "".join(ch for ch in txt if unicodedata.category(ch) != "Mn")
    return txt.lower().strip()


# ─────────────────────────────────────────────────────────────
# Catégorie (arbre optionnel)
# ─────────────────────────────────────────────────────────────

class GlossaryCategory(models.Model):
    name = models.CharField(max_length=120, unique=True)
    slug = models.SlugField(max_length=140, unique=True)
    description = models.TextField(blank=True)
    icon = models.CharField(
        max_length=40, blank=True,
        help_text="Nom lucide-react (ex. 'landmark', 'trending-up').",
    )
    color = models.CharField(
        max_length=20, blank=True,
        help_text="Ex. 'primary', 'emerald', 'amber' pour palette Tailwind.",
    )
    parent = models.ForeignKey(
        "self", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="children",
    )
    is_active = models.BooleanField(default=True)
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order", "name"]
        verbose_name = "Catégorie du lexique"
        verbose_name_plural = "Catégories du lexique"

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)[:140] or "categorie"
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


# ─────────────────────────────────────────────────────────────
# Terme principal
# ─────────────────────────────────────────────────────────────

class GlossaryTerm(models.Model):
    class Scope(models.TextChoices):
        GLOBAL = "global", "Global (toute la plateforme)"
        COURSE = "course", "Cours spécifique"
        SECTION = "section", "Section spécifique"
        LESSON = "lesson", "Leçon spécifique"

    class Status(models.TextChoices):
        DRAFT = "draft", "Brouillon"
        PENDING = "pending", "En attente de validation"
        VALIDATED = "validated", "Validé"
        REJECTED = "rejected", "Rejeté"
        ARCHIVED = "archived", "Archivé"

    class Level(models.TextChoices):
        BEGINNER = "beginner", "Débutant"
        INTERMEDIATE = "intermediate", "Intermédiaire"
        ADVANCED = "advanced", "Avancé"

    word = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220, unique=True)
    search_key = models.CharField(
        max_length=240, db_index=True, blank=True,
        help_text="Version normalisée du mot (lowercase, sans accents).",
    )

    short_definition = models.CharField(
        max_length=400,
        help_text="Définition courte affichée dans les tooltips (≤ 400 car).",
    )
    long_definition = models.TextField(
        blank=True,
        help_text="Définition complète (HTML propre) affichée sur la page détail.",
    )
    pronunciation = models.CharField(
        max_length=200, blank=True,
        help_text="Prononciation phonétique (facultatif).",
    )

    language = models.CharField(max_length=8, default="fr")
    level = models.CharField(
        max_length=16, choices=Level.choices, default=Level.BEGINNER,
    )

    category = models.ForeignKey(
        GlossaryCategory,
        on_delete=models.SET_NULL, null=True, blank=True,
        related_name="terms",
    )
    domain = models.CharField(
        max_length=80, blank=True,
        help_text="Domaine métier (finance, épargne, immobilier…).",
    )

    scope = models.CharField(
        max_length=16, choices=Scope.choices, default=Scope.GLOBAL,
        help_text=(
            "Portée du terme. Un scope=global est cherché partout ; "
            "les autres nécessitent une GlossaryAssociation active."
        ),
    )

    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.DRAFT,
    )
    is_active = models.BooleanField(default=True)
    is_case_sensitive = models.BooleanField(default=False)
    enable_auto_detection = models.BooleanField(
        default=True,
        help_text="Détecte ce terme automatiquement dans le contenu des leçons.",
    )

    illustration_url = models.URLField(blank=True)
    external_source = models.URLField(blank=True)

    view_count = models.PositiveIntegerField(default=0)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL, null=True, blank=True,
        related_name="glossary_terms_created",
    )
    validated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL, null=True, blank=True,
        related_name="glossary_terms_validated",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    published_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["word"]
        indexes = [
            models.Index(fields=["search_key"]),
            models.Index(fields=["status", "is_active"]),
            models.Index(fields=["scope"]),
        ]
        verbose_name = "Terme du lexique"
        verbose_name_plural = "Termes du lexique"

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.word)[:200] or "terme"
            slug = base
            idx = 1
            while (
                GlossaryTerm.objects.filter(slug=slug)
                .exclude(pk=self.pk)
                .exists()
            ):
                idx += 1
                suffix = f"-{idx}"
                slug = base[: 220 - len(suffix)] + suffix
            self.slug = slug
        # Toujours resynchroniser search_key sur le mot (pas de dérive).
        self.search_key = normalize_search_key(self.word)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.word

    @property
    def is_public(self) -> bool:
        return (
            self.is_active
            and self.status == self.Status.VALIDATED
            and self.scope == self.Scope.GLOBAL
        )


# ─────────────────────────────────────────────────────────────
# Variantes (synonymes, acronymes, pluriels, orthographes)
# ─────────────────────────────────────────────────────────────

class GlossaryVariant(models.Model):
    class VariantType(models.TextChoices):
        SYNONYM = "synonym", "Synonyme"
        ACRONYM = "acronym", "Acronyme"
        PLURAL = "plural", "Pluriel"
        ABBREVIATION = "abbreviation", "Abréviation"
        ALTERNATIVE = "alternative_spelling", "Orthographe alternative"

    term = models.ForeignKey(
        GlossaryTerm, on_delete=models.CASCADE, related_name="variants",
    )
    variant = models.CharField(max_length=200)
    search_key = models.CharField(max_length=240, db_index=True, blank=True)
    variant_type = models.CharField(
        max_length=32, choices=VariantType.choices,
        default=VariantType.SYNONYM,
    )
    is_case_sensitive = models.BooleanField(default=False)

    class Meta:
        ordering = ["variant"]
        indexes = [models.Index(fields=["search_key"])]
        constraints = [
            models.UniqueConstraint(
                fields=["term", "variant"], name="glossary_variant_unique",
            ),
        ]

    def save(self, *args, **kwargs):
        self.search_key = normalize_search_key(self.variant)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.term.word} → {self.variant}"


# ─────────────────────────────────────────────────────────────
# Exemples d'utilisation
# ─────────────────────────────────────────────────────────────

class GlossaryExample(models.Model):
    term = models.ForeignKey(
        GlossaryTerm, on_delete=models.CASCADE, related_name="examples",
    )
    example = models.TextField()
    source = models.CharField(max_length=240, blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]


# ─────────────────────────────────────────────────────────────
# Association terme ↔ cours / section / leçon
# ─────────────────────────────────────────────────────────────

class GlossaryAssociation(models.Model):
    """Rattache un terme à un cours (et optionnellement à une section
    ou leçon), avec la possibilité de définir une définition custom
    prioritaire dans ce contexte.
    """
    term = models.ForeignKey(
        GlossaryTerm, on_delete=models.CASCADE, related_name="associations",
    )
    course = models.ForeignKey(
        "catalog.Course", on_delete=models.CASCADE,
        related_name="glossary_associations",
    )
    section = models.ForeignKey(
        "catalog.CourseSection",
        on_delete=models.CASCADE, null=True, blank=True,
        related_name="glossary_associations",
    )
    lesson = models.ForeignKey(
        "catalog.Lesson",
        on_delete=models.CASCADE, null=True, blank=True,
        related_name="glossary_associations",
    )
    priority = models.PositiveIntegerField(
        default=100,
        help_text="Plus haut = priorité plus forte (custom > global).",
    )
    custom_short_definition = models.CharField(max_length=400, blank=True)
    custom_long_definition = models.TextField(blank=True)
    is_detection_enabled = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["course", "is_detection_enabled"]),
            models.Index(fields=["term", "course"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["term", "course", "section", "lesson"],
                name="glossary_association_unique_scope",
            ),
        ]


# ─────────────────────────────────────────────────────────────
# Relations sémantiques entre termes
# ─────────────────────────────────────────────────────────────

class GlossaryRelation(models.Model):
    class RelationType(models.TextChoices):
        RELATED = "related", "Terme connexe"
        SYNONYM = "synonym", "Synonyme"
        ANTONYM = "antonym", "Antonyme"
        BROADER = "broader", "Terme plus général"
        NARROWER = "narrower", "Terme plus spécifique"

    source_term = models.ForeignKey(
        GlossaryTerm, on_delete=models.CASCADE,
        related_name="relations_out",
    )
    target_term = models.ForeignKey(
        GlossaryTerm, on_delete=models.CASCADE,
        related_name="relations_in",
    )
    relation_type = models.CharField(
        max_length=16, choices=RelationType.choices,
        default=RelationType.RELATED,
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["source_term", "target_term", "relation_type"],
                name="glossary_relation_unique",
            ),
            models.CheckConstraint(
                check=~models.Q(source_term=models.F("target_term")),
                name="glossary_relation_not_self",
            ),
        ]


# ─────────────────────────────────────────────────────────────
# Suggestions (apprenants + formateurs)
# ─────────────────────────────────────────────────────────────

class GlossarySuggestion(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "En attente"
        APPROVED = "approved", "Approuvée"
        REJECTED = "rejected", "Rejetée"

    class Kind(models.TextChoices):
        NEW_TERM = "new_term", "Nouveau terme"
        DEFINITION_UPDATE = "definition_update", "Amélioration de définition"
        ERROR_REPORT = "error_report", "Signalement d'erreur"

    kind = models.CharField(
        max_length=32, choices=Kind.choices, default=Kind.NEW_TERM,
    )
    term = models.ForeignKey(
        GlossaryTerm, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="suggestions",
        help_text="Terme concerné (null si nouveau terme proposé).",
    )
    proposed_word = models.CharField(max_length=200, blank=True)
    proposed_definition = models.TextField(blank=True)

    suggested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL, null=True, blank=True,
        related_name="glossary_suggestions",
    )
    course = models.ForeignKey(
        "catalog.Course",
        on_delete=models.SET_NULL, null=True, blank=True,
        related_name="glossary_suggestions",
    )
    lesson = models.ForeignKey(
        "catalog.Lesson",
        on_delete=models.SET_NULL, null=True, blank=True,
        related_name="glossary_suggestions",
    )
    context = models.TextField(
        blank=True,
        help_text="Extrait de contexte où le terme a été rencontré.",
    )

    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.PENDING,
    )
    review_comment = models.TextField(blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL, null=True, blank=True,
        related_name="glossary_suggestions_reviewed",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["status", "created_at"])]


# ─────────────────────────────────────────────────────────────
# Favoris apprenant
# ─────────────────────────────────────────────────────────────

class GlossaryFavorite(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE, related_name="glossary_favorites",
    )
    term = models.ForeignKey(
        GlossaryTerm, on_delete=models.CASCADE, related_name="favorited_by",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "term"], name="glossary_favorite_unique",
            ),
        ]


# ─────────────────────────────────────────────────────────────
# Notes personnelles (privées)
# ─────────────────────────────────────────────────────────────

class GlossaryUserNote(models.Model):
    class Status(models.TextChoices):
        NEW = "new", "Nouveau"
        UNDERSTOOD = "understood", "Compris"
        REVIEW = "review", "À revoir"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE, related_name="glossary_notes",
    )
    term = models.ForeignKey(
        GlossaryTerm, on_delete=models.CASCADE, related_name="user_notes",
    )
    note = models.TextField(blank=True)
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.NEW,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "term"], name="glossary_note_unique",
            ),
        ]


# ─────────────────────────────────────────────────────────────
# Historique de consultation
# ─────────────────────────────────────────────────────────────

class GlossaryView(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE, related_name="glossary_views",
        null=True, blank=True,
    )
    term = models.ForeignKey(
        GlossaryTerm, on_delete=models.CASCADE, related_name="view_events",
    )
    course = models.ForeignKey(
        "catalog.Course", on_delete=models.SET_NULL,
        null=True, blank=True,
    )
    lesson = models.ForeignKey(
        "catalog.Lesson", on_delete=models.SET_NULL,
        null=True, blank=True,
    )
    viewed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-viewed_at"]
        indexes = [models.Index(fields=["user", "-viewed_at"])]


# ─────────────────────────────────────────────────────────────
# Audit trail
# ─────────────────────────────────────────────────────────────

class GlossaryRevision(models.Model):
    term = models.ForeignKey(
        GlossaryTerm, on_delete=models.CASCADE, related_name="revisions",
    )
    version = models.PositiveIntegerField(default=1)
    previous_data = models.JSONField(default=dict, blank=True)
    new_data = models.JSONField(default=dict, blank=True)
    modified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL, null=True, blank=True,
        related_name="glossary_revisions",
    )
    change_reason = models.CharField(max_length=240, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["term", "-version"])]
