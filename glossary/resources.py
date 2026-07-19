"""glossary.resources — Resources django-import-export pour le lexique.

Fournit :
    - GlossaryTermResource     : terme principal (import CSV/XLSX/JSON).
    - GlossaryCategoryResource : catégorie.
    - GlossaryVariantResource  : synonymes / acronymes.
    - GlossaryExampleResource  : exemples d'utilisation.

L'import de GlossaryTerm gère intelligemment :
    - la déduplication par ``search_key`` (normalisé),
    - la résolution automatique de la catégorie par nom ou slug
      (création à la volée si inconnue),
    - les champs multi-valeurs (variants) via une colonne séparée par ``|``.

Documentation format import :

    Colonne          Requis  Description
    ─────────────────────────────────────────────────────────
    word             oui     Mot ou expression.
    short_definition oui     Définition courte (≤ 400 caractères).
    long_definition  non     Définition complète (HTML autorisé).
    category         non     Nom OU slug de catégorie (auto-créée).
    scope            non     global (défaut) | course | section | lesson.
    status           non     draft | pending | validated (défaut validated).
    level            non     beginner (défaut) | intermediate | advanced.
    domain           non     Domaine métier (finance, épargne…).
    language         non     Code ISO (fr par défaut).
    variants         non     Synonymes séparés par ``|``.
    is_active        non     True/False (défaut True).
    enable_auto_detection non  True/False (défaut True).
"""
from __future__ import annotations

from import_export import resources, fields
from import_export.widgets import ForeignKeyWidget, BooleanWidget

from .models import (
    GlossaryCategory,
    GlossaryExample,
    GlossaryTerm,
    GlossaryVariant,
    normalize_search_key,
)


# ─────────────────────────────────────────────────────────────
# Widgets custom
# ─────────────────────────────────────────────────────────────

class CategoryByNameOrSlugWidget(ForeignKeyWidget):
    """Résout une catégorie par nom OU slug ; crée si absente.

    Permet d'importer un CSV où la colonne ``category`` contient soit
    « Finance », soit « finance » — le système gère les deux cas et
    crée la catégorie manquante à la volée.
    """
    def clean(self, value, row=None, **kwargs):
        if not value:
            return None
        value = str(value).strip()
        if not value:
            return None
        cat = GlossaryCategory.objects.filter(name__iexact=value).first()
        if not cat:
            cat = GlossaryCategory.objects.filter(slug__iexact=value).first()
        if not cat:
            cat = GlossaryCategory.objects.create(name=value[:120])
        return cat


class PipeSeparatedListField(fields.Field):
    """Champ qui sérialise/parse une liste de strings séparées par ``|``.

    Import CSV : ``synonyme | abbréviation | pluriel`` → liste.
    Export CSV : liste stockée en base → chaîne séparée par ``|``.
    """
    pass


# ─────────────────────────────────────────────────────────────
# Category
# ─────────────────────────────────────────────────────────────

class GlossaryCategoryResource(resources.ModelResource):
    class Meta:
        model = GlossaryCategory
        fields = (
            "id", "name", "slug", "description",
            "icon", "color", "parent", "is_active", "order",
        )
        export_order = fields
        import_id_fields = ("slug",)


# ─────────────────────────────────────────────────────────────
# Variant
# ─────────────────────────────────────────────────────────────

class GlossaryVariantResource(resources.ModelResource):
    term = fields.Field(
        column_name="term_word",
        attribute="term",
        widget=ForeignKeyWidget(GlossaryTerm, field="word"),
    )

    class Meta:
        model = GlossaryVariant
        fields = ("id", "term", "variant", "variant_type", "is_case_sensitive")
        export_order = fields


# ─────────────────────────────────────────────────────────────
# Example
# ─────────────────────────────────────────────────────────────

class GlossaryExampleResource(resources.ModelResource):
    term = fields.Field(
        column_name="term_word",
        attribute="term",
        widget=ForeignKeyWidget(GlossaryTerm, field="word"),
    )

    class Meta:
        model = GlossaryExample
        fields = ("id", "term", "example", "source", "order")
        export_order = fields


# ─────────────────────────────────────────────────────────────
# Term (principal)
# ─────────────────────────────────────────────────────────────

class GlossaryTermResource(resources.ModelResource):
    """Import/Export principal du lexique.

    Import intelligent :
        - Déduplication par ``search_key`` (mot normalisé lowercase + sans
          accents) : refuse silencieusement les doublons via skip_diff=True.
        - Catégorie auto-créée par nom ou slug.
        - Colonne ``variants`` (séparateur ``|``) crée les GlossaryVariant
          associés en post-save.
    """
    category = fields.Field(
        column_name="category",
        attribute="category",
        widget=CategoryByNameOrSlugWidget(GlossaryCategory, field="name"),
    )
    # Colonne pipe-separated des synonymes.
    variants = fields.Field(column_name="variants", attribute="variants")

    class Meta:
        model = GlossaryTerm
        # `search_key` est calculé automatiquement au save() — on ne
        # l'accepte pas en import. On utilise `word` comme clé
        # d'identification unique.
        fields = (
            "id", "word", "slug",
            "short_definition", "long_definition",
            "category",
            "scope", "status", "level", "domain",
            "language", "pronunciation",
            "is_active", "is_case_sensitive", "enable_auto_detection",
            "illustration_url", "external_source",
            "variants",
        )
        export_order = fields
        # Clef d'unicité pour import : `word` d'abord, sinon `slug`.
        # NB : on ne peut pas utiliser search_key car il est calculé.
        import_id_fields = ("word",)
        skip_unchanged = True
        report_skipped = True

    # ── Sérialisation des variants (export) ─────────────────────
    def dehydrate_variants(self, obj):
        return " | ".join(v.variant for v in obj.variants.all())

    # ── Post-import : crée les variants ────────────────────────
    def after_save_instance(self, instance, row, **kwargs):
        """Après création/update du terme, gère la colonne ``variants``."""
        raw = (row.get("variants") or "").strip() if row else ""
        if not raw:
            return
        # Support des séparateurs |, ,, ;
        parts = []
        for chunk in raw.replace(";", "|").replace(",", "|").split("|"):
            v = chunk.strip()
            if v:
                parts.append(v)
        if not parts:
            return
        # Remplacement complet : on drop les anciens variants avant
        # de reconstruire (permet d'ajuster la liste via ré-import).
        instance.variants.all().delete()
        for v in parts[:20]:
            GlossaryVariant.objects.create(
                term=instance,
                variant=v[:200],
                variant_type=GlossaryVariant.VariantType.SYNONYM,
            )

    # ── Dédoublonnage additionnel par search_key ────────────────
    def get_instance(self, instance_loader, row):
        """Cherche par search_key avant de tomber sur l'import_id_fields.

        Permet de matcher « Épargne » avec un import « épargne » ou
        « EPARGNE » (même search_key normalisé) au lieu de créer un doublon.
        """
        word = str(row.get("word") or "").strip()
        if word:
            key = normalize_search_key(word)
            found = GlossaryTerm.objects.filter(search_key=key).first()
            if found:
                return found
        return super().get_instance(instance_loader, row)

    # ── Défauts sécuritaires à l'import ────────────────────────
    def before_import_row(self, row, **kwargs):
        """Applique des défauts et normalise les valeurs faibles/absentes."""
        # Status par défaut : validated (les imports admin sont trusted).
        raw_status = str(row.get("status") or "").lower().strip()
        if raw_status not in {"draft", "pending", "validated", "rejected", "archived"}:
            row["status"] = "validated"
        # Level.
        raw_level = str(row.get("level") or "").lower().strip()
        if raw_level not in {"beginner", "intermediate", "advanced"}:
            row["level"] = "beginner"
        # Scope.
        raw_scope = str(row.get("scope") or "").lower().strip()
        if raw_scope not in {"global", "course", "section", "lesson"}:
            row["scope"] = "global"
        # is_active / enable_auto_detection defaults.
        for k in ("is_active", "enable_auto_detection"):
            v = row.get(k)
            if v is None or v == "":
                row[k] = True
