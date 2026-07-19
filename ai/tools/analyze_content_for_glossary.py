"""Tool : analyze_content_for_glossary — extrait les termes techniques
d'une leçon et les propose comme entrées du lexique.

Le LLM (via l'agent Best-AI) génère la liste ``proposed_terms`` dans les
paramètres de l'action ; ce tool ne fait QUE persister ces propositions
comme ``GlossaryTerm`` en statut ``pending``. C'est l'admin (ou l'auteur
si autorisé) qui valide ensuite via la page ``/admin/lexique`` ou une
approbation directe.

Aucun terme n'est jamais publié automatiquement — sécurité + qualité.
"""
from __future__ import annotations

from typing import Any, Dict, List

from django.db import transaction

from .base import AbstractAITool, ToolPreview, ToolResult, register


MAX_TERMS_PER_CALL = 30


def _normalize_proposals(raw: Any) -> List[Dict[str, Any]]:
    """Nettoie la liste des propositions.

    Format attendu (par item) :
        {
          "word": str, requis
          "short_definition": str, requis (≤ 400 car)
          "long_definition": str, optionnel (HTML)
          "category": str, optionnel (nom ou slug catégorie existante)
          "domain": str, optionnel
          "level": beginner|intermediate|advanced, optionnel
          "variants": [str], optionnel — synonymes/acronymes
          "examples": [str], optionnel
          "confidence": float 0..1, optionnel
        }
    """
    if not isinstance(raw, list):
        return []
    out: List[Dict[str, Any]] = []
    for it in raw[:MAX_TERMS_PER_CALL]:
        if not isinstance(it, dict):
            continue
        word = str(it.get("word") or "").strip()
        short = str(it.get("short_definition") or "").strip()
        if not word or not short:
            continue
        out.append(
            {
                "word": word[:200],
                "short_definition": short[:400],
                "long_definition": str(it.get("long_definition") or "").strip(),
                "category": str(it.get("category") or "").strip(),
                "domain": str(it.get("domain") or "").strip()[:80],
                "level": str(it.get("level") or "beginner").lower().strip(),
                "variants": [
                    str(v).strip() for v in (it.get("variants") or [])
                    if isinstance(v, str) and str(v).strip()
                ][:10],
                "examples": [
                    str(e).strip() for e in (it.get("examples") or [])
                    if isinstance(e, str) and str(e).strip()
                ][:5],
                "confidence": float(it.get("confidence") or 0.5),
            }
        )
    return out


@register
class AnalyzeContentForGlossaryTool(AbstractAITool):
    key = "analyze_content_for_glossary"
    title = "Analyser le contenu et enrichir le lexique"
    description = (
        "Analyse le contenu d'un cours ou d'une leçon et propose une liste "
        "de termes techniques à ajouter au lexique pédagogique. Chaque "
        "terme est créé en statut PENDING et doit être validé par un "
        "administrateur avant d'être visible publiquement."
    )
    allowed_roles = ["instructor", "platform_admin"]
    confirmation_level = 1
    params_schema = {
        "course_id": {"type": "integer", "required": False},
        "lesson_id": {"type": "integer", "required": False},
        "proposed_terms": {
            "type": "array",
            "required": True,
            "max_items": MAX_TERMS_PER_CALL,
            "description": (
                "Liste d'objets {word, short_definition, long_definition, "
                "category, domain, level, variants, examples, confidence}."
            ),
        },
        "scope": {
            "type": "string",
            "required": False,
            "default": "global",
            "enum": ["global", "course"],
        },
    }

    # ── PREVIEW ─────────────────────────────────────────────────
    def build_preview(self, user, params: dict) -> ToolPreview:
        proposals = _normalize_proposals(params.get("proposed_terms"))
        scope = str(params.get("scope") or "global").lower()
        course_ref = ""
        if params.get("course_id"):
            course_ref = f" pour le cours #{params.get('course_id')}"
        elif params.get("lesson_id"):
            course_ref = f" pour la leçon #{params.get('lesson_id')}"

        preview_items = [
            {
                "type": "term",
                "word": p["word"][:60],
                "short": p["short_definition"][:80],
                "category": p["category"] or "—",
                "confidence": p["confidence"],
            }
            for p in proposals[:15]
        ]
        return ToolPreview(
            summary=(
                f"Ajouter {len(proposals)} terme(s) au lexique en statut "
                f"PENDING{course_ref}."
            ),
            impact=(
                f"{len(proposals)} nouvelle(s) entrée(s) seront créées en "
                "attente de validation. Aucune n'est publiée automatiquement. "
                "Portée : "
                + ("globale (plateforme entière)" if scope == "global"
                   else "spécifique au cours ciblé")
                + "."
            ),
            affected_items=preview_items,
            permissions_used=[
                "glossary.add_glossaryterm",
                "glossary.add_glossaryvariant",
                "glossary.add_glossaryexample",
            ],
        )

    # ── RUN ────────────────────────────────────────────────────
    def run(self, user, params: dict) -> ToolResult:
        from glossary.models import (
            GlossaryTerm,
            GlossaryVariant,
            GlossaryExample,
            GlossaryCategory,
            GlossaryAssociation,
            normalize_search_key,
        )

        proposals = _normalize_proposals(params.get("proposed_terms"))
        if not proposals:
            return ToolResult(
                ok=False,
                detail=(
                    "Aucune proposition valide. Chaque item doit contenir "
                    "au minimum ``word`` et ``short_definition``."
                ),
            )

        scope_raw = str(params.get("scope") or "global").lower()
        scope = (
            GlossaryTerm.Scope.COURSE
            if scope_raw == "course"
            else GlossaryTerm.Scope.GLOBAL
        )

        # Résolution optionnelle du cours (pour scope=course + association).
        course = None
        course_id = params.get("course_id")
        lesson_id = params.get("lesson_id")
        if course_id or lesson_id:
            from catalog.models import Course, Lesson
            try:
                if course_id:
                    course = Course.objects.filter(pk=int(course_id)).first()
                elif lesson_id:
                    lesson = Lesson.objects.select_related(
                        "section__course"
                    ).filter(pk=int(lesson_id)).first()
                    if lesson:
                        course = lesson.section.course
            except (TypeError, ValueError):
                pass

        # Cache des catégories existantes (name/slug lower → instance).
        cats = {
            **{c.name.lower(): c for c in GlossaryCategory.objects.all()},
        }
        for c in GlossaryCategory.objects.all():
            cats[c.slug.lower()] = c

        created_terms: List[Dict[str, Any]] = []
        skipped_terms: List[Dict[str, Any]] = []

        try:
            with transaction.atomic():
                for p in proposals:
                    word = p["word"]
                    # Dédoublonnage : cherche par search_key.
                    key = normalize_search_key(word)
                    if GlossaryTerm.objects.filter(search_key=key).exists():
                        skipped_terms.append(
                            {"word": word, "reason": "existing"}
                        )
                        continue

                    cat = None
                    cat_hint = (p["category"] or "").lower()
                    if cat_hint:
                        cat = cats.get(cat_hint)
                        if cat is None:
                            # Crée la catégorie en volée (soft — pas de doublon).
                            cat = GlossaryCategory.objects.create(
                                name=p["category"][:120],
                            )
                            cats[cat_hint] = cat
                            cats[cat.slug.lower()] = cat

                    level = p["level"]
                    if level not in {"beginner", "intermediate", "advanced"}:
                        level = "beginner"

                    term = GlossaryTerm.objects.create(
                        word=word,
                        short_definition=p["short_definition"],
                        long_definition=p["long_definition"],
                        category=cat,
                        domain=p["domain"],
                        level=level,
                        scope=scope,
                        status=GlossaryTerm.Status.PENDING,
                        is_active=True,
                        enable_auto_detection=True,
                        created_by=user,
                    )

                    for v in p["variants"]:
                        GlossaryVariant.objects.create(
                            term=term, variant=v[:200],
                            variant_type=GlossaryVariant.VariantType.SYNONYM,
                        )
                    for i, ex in enumerate(p["examples"]):
                        GlossaryExample.objects.create(
                            term=term, example=ex, order=i,
                        )
                    if scope == GlossaryTerm.Scope.COURSE and course:
                        GlossaryAssociation.objects.create(
                            term=term, course=course,
                            is_detection_enabled=True,
                        )

                    created_terms.append(
                        {
                            "id": term.id,
                            "word": term.word,
                            "slug": term.slug,
                            "confidence": p["confidence"],
                        }
                    )
        except Exception as exc:  # noqa: BLE001
            return ToolResult(
                ok=False,
                detail=(
                    f"Ajout au lexique interrompu : "
                    f"{exc.__class__.__name__} — {str(exc)[:200]}"
                ),
            )

        return ToolResult(
            ok=True,
            detail=(
                f"{len(created_terms)} terme(s) ajouté(s) au lexique en "
                f"attente de validation ({len(skipped_terms)} ignoré(s) car "
                "déjà présents)."
            ),
            data={
                "created": created_terms,
                "skipped": skipped_terms,
                "review_url": "/admin/lexique",
            },
        )
