"""glossary.io_service — Import/Export du lexique en CSV et JSON.

Format attendu (CSV et JSON) :

    Terme (word)                — requis
    Définition courte (short)   — requis
    Définition complète (long)  — optionnel, HTML autorisé
    Catégorie (category)        — nom ou slug, création à la volée
    Synonymes (variants)        — séparés par | ou ,
    Acronymes                   — séparés par |
    Exemple                     — texte libre
    Portée (scope)              — global | course
    Statut (status)             — draft | pending | validated
    Domaine (domain)            — texte libre
    Niveau (level)              — beginner | intermediate | advanced

Import : mode ``dry_run`` disponible — retourne un rapport ligne par ligne
sans écrire en base. En mode non dry_run, chaque ligne devient un
GlossaryTerm (déduplication par search_key : si déjà présent → skip).
"""
from __future__ import annotations

import csv
import io
import json
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from django.db import transaction

from .models import (
    GlossaryCategory,
    GlossaryTerm,
    GlossaryVariant,
    GlossaryExample,
    normalize_search_key,
)


CSV_HEADERS_MAP = {
    # français → clé interne (lowercase)
    "terme": "word",
    "mot": "word",
    "word": "word",
    "définition courte": "short",
    "definition courte": "short",
    "short_definition": "short",
    "short": "short",
    "définition complète": "long",
    "definition complete": "long",
    "long_definition": "long",
    "long": "long",
    "catégorie": "category",
    "categorie": "category",
    "category": "category",
    "synonymes": "variants",
    "synonyms": "variants",
    "variants": "variants",
    "acronymes": "acronyms",
    "acronyms": "acronyms",
    "exemple": "example",
    "example": "example",
    "portée": "scope",
    "portee": "scope",
    "scope": "scope",
    "statut": "status",
    "status": "status",
    "domaine": "domain",
    "domain": "domain",
    "niveau": "level",
    "level": "level",
}


@dataclass
class RowResult:
    line: int
    word: str
    action: str  # "created" | "skipped_duplicate" | "error"
    detail: str = ""


@dataclass
class ImportReport:
    total_rows: int = 0
    created: int = 0
    skipped: int = 0
    errors: int = 0
    rows: List[RowResult] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "total_rows": self.total_rows,
            "created": self.created,
            "skipped": self.skipped,
            "errors": self.errors,
            "rows": [
                {
                    "line": r.line,
                    "word": r.word,
                    "action": r.action,
                    "detail": r.detail,
                }
                for r in self.rows
            ],
        }


def _normalize_row(raw: Dict[str, Any]) -> Dict[str, Any]:
    """Normalise les clés (accents, casse) et fusionne acronymes+variants."""
    norm: Dict[str, Any] = {}
    for key, val in raw.items():
        canonical = CSV_HEADERS_MAP.get(str(key).strip().lower())
        if canonical:
            norm[canonical] = val
    # Fusion acronyms → variants (même bucket).
    if norm.get("acronyms"):
        base = str(norm.get("variants") or "").strip()
        extra = str(norm.get("acronyms")).strip()
        norm["variants"] = (base + ("|" if base and extra else "") + extra) if extra else base
    return norm


def _split_variants(s: Any) -> List[str]:
    if not s:
        return []
    txt = str(s)
    parts = [p.strip() for p in txt.replace(";", "|").replace(",", "|").split("|")]
    return [p for p in parts if p]


def _resolve_category(name: Optional[str], cache: Dict[str, GlossaryCategory]) -> Optional[GlossaryCategory]:
    if not name:
        return None
    key = name.strip().lower()
    if not key:
        return None
    if key in cache:
        return cache[key]
    cat = GlossaryCategory.objects.filter(name__iexact=key).first()
    if not cat:
        cat = GlossaryCategory.objects.filter(slug__iexact=key).first()
    if not cat:
        cat = GlossaryCategory.objects.create(name=name.strip()[:120])
    cache[key] = cat
    return cat


def _parse_csv(content: str) -> List[Dict[str, Any]]:
    """Parse un CSV en dict[]. Sniff automatique du délimiteur."""
    # Sniff délimiteur — sinon fallback comma.
    sample = content[:2048]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
    except csv.Error:
        class _D(csv.excel):
            delimiter = ","
        dialect = _D
    reader = csv.DictReader(io.StringIO(content), dialect=dialect)
    return [row for row in reader if any((v or "").strip() for v in row.values())]


def _parse_json(content: str) -> List[Dict[str, Any]]:
    data = json.loads(content)
    if isinstance(data, dict) and isinstance(data.get("terms"), list):
        return data["terms"]
    if isinstance(data, list):
        return data
    raise ValueError("Le JSON doit être une liste d'objets ou {\"terms\": [...]}.")


def import_terms(
    *,
    user,
    raw_content: str,
    fmt: str = "csv",
    dry_run: bool = True,
) -> ImportReport:
    """Point d'entrée principal d'import."""
    if fmt.lower() == "json":
        try:
            rows = _parse_json(raw_content)
        except Exception as exc:  # noqa: BLE001
            report = ImportReport()
            report.errors += 1
            report.rows.append(RowResult(line=0, word="", action="error", detail=str(exc)[:200]))
            return report
    else:
        rows = _parse_csv(raw_content)

    report = ImportReport()
    cat_cache: Dict[str, GlossaryCategory] = {}
    # Transaction : appliquée seulement si !dry_run.
    outer_ctx = transaction.atomic() if not dry_run else _noop_ctx()
    with outer_ctx:
        for idx, raw in enumerate(rows, start=2):  # ligne 1 = header CSV
            report.total_rows += 1
            norm = _normalize_row(raw) if isinstance(raw, dict) else {}
            word = str(norm.get("word") or "").strip()
            short = str(norm.get("short") or "").strip()
            if not word or not short:
                report.errors += 1
                report.rows.append(
                    RowResult(
                        line=idx, word=word,
                        action="error",
                        detail="Colonnes 'Terme' et 'Définition courte' obligatoires.",
                    )
                )
                continue
            # Déduplication par search_key.
            key = normalize_search_key(word)
            if GlossaryTerm.objects.filter(search_key=key).exists():
                report.skipped += 1
                report.rows.append(
                    RowResult(
                        line=idx, word=word,
                        action="skipped_duplicate",
                        detail="Un terme avec ce mot existe déjà.",
                    )
                )
                continue

            if dry_run:
                report.created += 1
                report.rows.append(
                    RowResult(line=idx, word=word, action="created", detail="")
                )
                continue

            # Création réelle.
            try:
                cat = _resolve_category(str(norm.get("category") or ""), cat_cache)
                level_raw = str(norm.get("level") or "beginner").lower().strip()
                if level_raw not in {"beginner", "intermediate", "advanced"}:
                    level_raw = "beginner"
                scope_raw = str(norm.get("scope") or "global").lower().strip()
                if scope_raw not in {"global", "course", "section", "lesson"}:
                    scope_raw = "global"
                status_raw = str(norm.get("status") or "draft").lower().strip()
                if status_raw not in {"draft", "pending", "validated"}:
                    status_raw = "draft"

                term = GlossaryTerm.objects.create(
                    word=word[:200],
                    short_definition=short[:400],
                    long_definition=str(norm.get("long") or "").strip(),
                    category=cat,
                    domain=str(norm.get("domain") or "").strip()[:80],
                    level=level_raw,
                    scope=scope_raw,
                    status=status_raw,
                    is_active=True,
                    enable_auto_detection=True,
                    created_by=user,
                )
                variants = _split_variants(norm.get("variants"))
                for v in variants[:20]:
                    GlossaryVariant.objects.create(
                        term=term, variant=v[:200],
                        variant_type=GlossaryVariant.VariantType.SYNONYM,
                    )
                example = str(norm.get("example") or "").strip()
                if example:
                    GlossaryExample.objects.create(
                        term=term, example=example, order=0
                    )
                report.created += 1
                report.rows.append(RowResult(line=idx, word=word, action="created"))
            except Exception as exc:  # noqa: BLE001
                report.errors += 1
                report.rows.append(
                    RowResult(
                        line=idx, word=word, action="error",
                        detail=str(exc)[:200],
                    )
                )
    return report


class _noop_ctx:
    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


# ─────────────────────────────────────────────────────────────
# Export
# ─────────────────────────────────────────────────────────────

EXPORT_COLUMNS = [
    "Terme",
    "Définition courte",
    "Définition complète",
    "Catégorie",
    "Synonymes",
    "Exemple",
    "Portée",
    "Statut",
    "Domaine",
    "Niveau",
]


def export_terms_csv(queryset) -> str:
    """Génère un CSV UTF-8 avec BOM (compatible Excel)."""
    buf = io.StringIO()
    buf.write("﻿")  # BOM pour Excel FR
    writer = csv.writer(buf, delimiter=";", quoting=csv.QUOTE_ALL)
    writer.writerow(EXPORT_COLUMNS)
    for t in queryset.prefetch_related("variants", "examples").select_related("category"):
        variants = " | ".join(v.variant for v in t.variants.all())
        example = ""
        first_ex = t.examples.first()
        if first_ex:
            example = first_ex.example
        writer.writerow(
            [
                t.word,
                t.short_definition,
                t.long_definition,
                t.category.name if t.category else "",
                variants,
                example,
                t.scope,
                t.status,
                t.domain,
                t.level,
            ]
        )
    return buf.getvalue()


def export_terms_json(queryset) -> str:
    out: List[Dict[str, Any]] = []
    for t in queryset.prefetch_related("variants", "examples").select_related("category"):
        out.append(
            {
                "word": t.word,
                "slug": t.slug,
                "short_definition": t.short_definition,
                "long_definition": t.long_definition,
                "category": t.category.name if t.category else None,
                "variants": [v.variant for v in t.variants.all()],
                "examples": [e.example for e in t.examples.all()],
                "scope": t.scope,
                "status": t.status,
                "domain": t.domain,
                "level": t.level,
                "updated_at": t.updated_at.isoformat() if t.updated_at else None,
            }
        )
    return json.dumps({"terms": out, "count": len(out)}, ensure_ascii=False, indent=2)
