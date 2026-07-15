"""mark_pending_videos_ready — backfill des vidéos bloquées en PENDING.

Utilitaire de correction one-shot : les uploads antérieurs à UX-11
créaient les MediaAsset vidéo en ``processing_status=PENDING`` en
attendant un worker qui n'a jamais été mis en place. Cette commande
les remet en READY pour qu'elles soient utilisables dans la médiathèque.

Usage :
    python manage.py mark_pending_videos_ready
    python manage.py mark_pending_videos_ready --dry-run
    python manage.py mark_pending_videos_ready --older-than-hours 1
"""
from __future__ import annotations

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from catalog.models import MediaAsset


class Command(BaseCommand):
    help = "Passe en READY les vidéos MediaAsset bloquées en PENDING."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Affiche le nombre sans modifier la base.",
        )
        parser.add_argument(
            "--older-than-hours",
            type=int,
            default=0,
            help=(
                "Ne toucher que les uploads créés il y a au moins N heures "
                "(défaut 0 = tous). Utile pour ne pas interférer avec un "
                "vrai worker de post-processing."
            ),
        )

    def handle(self, *args, **options):
        qs = MediaAsset.objects.filter(
            kind=MediaAsset.Kind.VIDEO,
            processing_status=MediaAsset.ProcessingStatus.PENDING,
        )
        hours = int(options.get("older_than_hours") or 0)
        if hours > 0:
            cutoff = timezone.now() - timedelta(hours=hours)
            qs = qs.filter(created_at__lte=cutoff)

        total = qs.count()
        if options["dry_run"]:
            self.stdout.write(
                self.style.WARNING(
                    f"[dry-run] {total} vidéo(s) passerai(en)t en READY."
                )
            )
            return

        updated = qs.update(
            processing_status=MediaAsset.ProcessingStatus.READY
        )
        self.stdout.write(
            self.style.SUCCESS(f"{updated} vidéo(s) passée(s) en READY.")
        )
