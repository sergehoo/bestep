"""setup_best_ai — provisionne le provider Anthropic Claude pour Best-AI.

Usage :
    python manage.py setup_best_ai
    python manage.py setup_best_ai --api-key sk-ant-xxx
    python manage.py setup_best_ai --api-key sk-ant-xxx --activate

Effets :
    1. Crée (ou met à jour) le provider ``anthropic-claude`` avec la clé
       API fournie en argument ou lue depuis ``ANTHROPIC_API_KEY``.
    2. Crée / réactive 3 modèles logiques par défaut :
         - chat_fast     → claude-haiku-4-5-20251001
         - chat_advanced → claude-sonnet-4-6
         - analysis      → claude-sonnet-4-6
    3. Marque ces 3 modèles comme ``is_default=True`` pour leur purpose.
    4. Désactive optionnellement le provider stub-dev (--activate).

Sécurité :
    - Si aucune clé n'est fournie et que ``ANTHROPIC_API_KEY`` est vide,
      le provider est créé mais laissé ``is_active=False`` (sécurité).
    - La clé est stockée telle quelle dans ``AIProvider.api_key`` — le
      chiffrement au repos sera ajouté ultérieurement (roadmap infra).
"""
from __future__ import annotations

import os
from decimal import Decimal

from django.core.management.base import BaseCommand

from ai.models import AIModel, AIProvider


DEFAULT_MODELS = [
    # (purpose, model_name, max_tokens, temperature, cost_in, cost_out)
    ("chat_fast", "claude-haiku-4-5-20251001", 8192, "0.30", "0.0008", "0.0040"),
    ("chat_advanced", "claude-sonnet-4-6", 16384, "0.30", "0.003", "0.015"),
    ("analysis", "claude-sonnet-4-6", 16384, "0.10", "0.003", "0.015"),
]


class Command(BaseCommand):
    help = "Provisionne le provider Anthropic Claude pour Best-AI."

    def add_arguments(self, parser):
        parser.add_argument(
            "--api-key",
            dest="api_key",
            default=None,
            help="Clé API Anthropic. À défaut, lue depuis ANTHROPIC_API_KEY.",
        )
        parser.add_argument(
            "--name",
            dest="name",
            default="anthropic-claude",
            help="Nom logique du provider (défaut: anthropic-claude).",
        )
        parser.add_argument(
            "--activate",
            action="store_true",
            help="Désactive le provider stub-dev pour utiliser Anthropic exclusivement.",
        )
        parser.add_argument(
            "--priority",
            dest="priority",
            type=int,
            default=10,
            help="Priorité de routage (plus bas = plus prioritaire). Défaut 10.",
        )

    def handle(self, *args, **options):
        api_key = options["api_key"] or os.environ.get("ANTHROPIC_API_KEY", "")
        name = options["name"]
        priority = options["priority"]
        activate = options["activate"]

        # ── 1. Provider ─────────────────────────────────────────
        provider, created = AIProvider.objects.update_or_create(
            name=name,
            defaults={
                "kind": AIProvider.Kind.ANTHROPIC,
                "base_url": "https://api.anthropic.com/v1",
                "api_key": api_key,
                "is_active": bool(api_key),
                "priority": priority,
                "timeout_seconds": 90,
            },
        )
        verb = "Créé" if created else "Mis à jour"
        state = "actif" if provider.is_active else "inactif (pas de clé API)"
        self.stdout.write(self.style.SUCCESS(
            f"{verb} : provider {provider.name} → {state}"
        ))
        if not api_key:
            self.stdout.write(self.style.WARNING(
                "  ⚠  Aucune clé API fournie. Ajoutez ANTHROPIC_API_KEY dans .env "
                "puis relancez la commande, ou éditez la clé dans /admin/ai."
            ))

        # ── 2. Modèles ─────────────────────────────────────────
        for purpose, model_name, max_tok, temp, ci, co in DEFAULT_MODELS:
            obj, m_created = AIModel.objects.update_or_create(
                provider=provider,
                purpose=purpose,
                model_name=model_name,
                defaults={
                    "max_tokens": max_tok,
                    "temperature": Decimal(temp),
                    "cost_input_per_1k": Decimal(ci),
                    "cost_output_per_1k": Decimal(co),
                    "is_default": True,
                    "is_active": True,
                },
            )
            # Débranche les autres default du même purpose.
            AIModel.objects.filter(purpose=purpose).exclude(pk=obj.pk).update(
                is_default=False
            )
            action = "Créé" if m_created else "Mis à jour"
            self.stdout.write(
                f"  ✓ {action} modèle {purpose:>15}  →  {model_name}"
            )

        # ── 3. Bascule stub ────────────────────────────────────
        if activate:
            updated = AIProvider.objects.filter(kind=AIProvider.Kind.STUB).update(
                is_active=False
            )
            if updated:
                self.stdout.write(self.style.SUCCESS(
                    f"  ✓ {updated} provider(s) stub désactivé(s)"
                ))
        else:
            self.stdout.write(
                "  ℹ  Provider stub-dev conservé (utilisez --activate pour "
                "basculer Best-AI intégralement sur Anthropic)."
            )

        self.stdout.write(self.style.SUCCESS(
            "\nBest-AI est configuré. Testez la connexion dans /admin/ai → Providers → Test."
        ))
