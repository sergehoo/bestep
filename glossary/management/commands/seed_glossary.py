"""Commande : seed_glossary — pré-remplit le lexique avec des termes financiers.

Charge des termes depuis :
    1. Le fichier bundle ``glossary/data/finance_terms_fr.json`` (par défaut).
    2. Optionnellement un fichier externe passé via ``--file`` (JSON ou CSV).

L'insertion est **idempotente** : dédoublonnage par ``search_key``. Un
terme déjà présent (même mot normalisé) n'est jamais dupliqué. Les
catégories manquantes sont créées à la volée.

Usage :

    # Import des termes bundlés (~500 termes finance FR)
    python manage.py seed_glossary

    # Ajouter un fichier externe complémentaire
    python manage.py seed_glossary --file /path/to/more_terms.json

    # Dry-run : affiche ce qui serait créé sans écrire
    python manage.py seed_glossary --dry-run

    # Statut cible (par défaut validated)
    python manage.py seed_glossary --status draft

Le fichier JSON attendu est une liste d'objets :

    [
      {
        "word": "Diversification",
        "short_definition": "Répartir ses placements pour réduire le risque.",
        "long_definition": "<p>Détails HTML…</p>",
        "category": "Investissement",
        "domain": "finance",
        "level": "beginner",
        "variants": ["répartition", "diversifier"],
        "examples": ["Diversifier entre actions et obligations…"]
      },
      ...
    ]
"""
from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any, Dict, List

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from glossary.models import (
    GlossaryCategory,
    GlossaryExample,
    GlossaryTerm,
    GlossaryVariant,
    normalize_search_key,
)


DEFAULT_BUNDLE = Path(__file__).resolve().parent.parent.parent / "data" / "finance_terms_fr.json"


class Command(BaseCommand):
    help = "Pré-remplit le lexique avec un corpus de termes financiers français."

    def add_arguments(self, parser):
        parser.add_argument(
            "--file",
            type=str,
            default=None,
            help="Fichier JSON ou CSV supplémentaire à importer.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="N'écrit rien en base, affiche uniquement le résumé.",
        )
        parser.add_argument(
            "--status",
            type=str,
            default="validated",
            choices=["draft", "pending", "validated"],
            help="Statut cible des termes créés (défaut : validated).",
        )
        parser.add_argument(
            "--skip-bundle",
            action="store_true",
            help="Ne charge pas le fichier bundle interne.",
        )

    # ── Helpers ─────────────────────────────────────────────
    def _load_json(self, path: Path) -> List[Dict[str, Any]]:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict) and "terms" in data:
            data = data["terms"]
        if not isinstance(data, list):
            raise ValueError(f"Format JSON invalide dans {path}")
        return data

    def _load_csv(self, path: Path) -> List[Dict[str, Any]]:
        rows: List[Dict[str, Any]] = []
        with open(path, "r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            for r in reader:
                rows.append(dict(r))
        return rows

    def _resolve_category(
        self, name: str, cache: Dict[str, GlossaryCategory]
    ) -> GlossaryCategory | None:
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

    # ── Handle ──────────────────────────────────────────────
    def handle(self, *args, **opts):
        dry_run = opts["dry_run"]
        status = opts["status"]
        skip_bundle = opts["skip_bundle"]

        entries: List[Dict[str, Any]] = []
        if not skip_bundle:
            if DEFAULT_BUNDLE.exists():
                bundle = self._load_json(DEFAULT_BUNDLE)
                self.stdout.write(
                    self.style.SUCCESS(
                        f"Bundle chargé : {len(bundle)} termes depuis {DEFAULT_BUNDLE.name}"
                    )
                )
                entries.extend(bundle)
            else:
                self.stdout.write(
                    self.style.WARNING(
                        f"Fichier bundle introuvable : {DEFAULT_BUNDLE}. Skip."
                    )
                )

        extra = opts["file"]
        if extra:
            path = Path(extra)
            if not path.exists():
                self.stdout.write(self.style.ERROR(f"Fichier introuvable : {path}"))
                return
            ext = path.suffix.lower()
            if ext == ".json":
                entries.extend(self._load_json(path))
            elif ext in (".csv", ".tsv"):
                entries.extend(self._load_csv(path))
            else:
                self.stdout.write(
                    self.style.ERROR(f"Extension non supportée : {ext} (JSON ou CSV attendus)")
                )
                return
            self.stdout.write(f"Fichier externe : {len(entries)} entrées cumulées.")

        if not entries:
            self.stdout.write(self.style.WARNING("Aucune donnée à importer."))
            return

        created = 0
        skipped = 0
        errors = 0
        cats: Dict[str, GlossaryCategory] = {}

        ctx = transaction.atomic() if not dry_run else _NoopCtx()
        now = timezone.now()

        with ctx:
            for e in entries:
                if not isinstance(e, dict):
                    errors += 1
                    continue
                word = str(e.get("word") or "").strip()
                short = str(e.get("short_definition") or "").strip()
                if not word or not short:
                    errors += 1
                    continue
                key = normalize_search_key(word)
                if GlossaryTerm.objects.filter(search_key=key).exists():
                    skipped += 1
                    continue

                if dry_run:
                    created += 1
                    continue

                try:
                    cat = self._resolve_category(str(e.get("category") or ""), cats)
                    term = GlossaryTerm.objects.create(
                        word=word[:200],
                        short_definition=short[:400],
                        long_definition=str(e.get("long_definition") or "").strip(),
                        category=cat,
                        domain=str(e.get("domain") or "finance")[:80],
                        level=str(e.get("level") or "beginner").lower().strip(),
                        scope=GlossaryTerm.Scope.GLOBAL,
                        status=status,
                        is_active=True,
                        enable_auto_detection=True,
                        published_at=now if status == "validated" else None,
                    )
                    for v in (e.get("variants") or [])[:15]:
                        v = str(v).strip()
                        if v:
                            GlossaryVariant.objects.create(
                                term=term,
                                variant=v[:200],
                                variant_type=GlossaryVariant.VariantType.SYNONYM,
                            )
                    for i, ex in enumerate((e.get("examples") or [])[:5]):
                        ex = str(ex).strip()
                        if ex:
                            GlossaryExample.objects.create(
                                term=term, example=ex, order=i
                            )
                    created += 1
                except Exception as exc:  # noqa: BLE001
                    errors += 1
                    self.stdout.write(
                        self.style.ERROR(
                            f"  ✗ {word[:60]} — {exc.__class__.__name__} : {str(exc)[:120]}"
                        )
                    )

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                f"Terminé — {created} créé(s) · {skipped} déjà présent(s) · "
                f"{errors} erreur(s) · statut = {status}"
                + (" [DRY-RUN]" if dry_run else "")
            )
        )


class _NoopCtx:
    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False
