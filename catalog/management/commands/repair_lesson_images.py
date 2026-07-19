"""Commande : repair_lesson_images — FIX-IMG-01.

Scanne toutes les Lesson (et Course.description) pour repérer les
``<img src="…?X-Amz-Signature=…">`` ou ``<a href="…?X-Amz-Signature=…">``
et les remplace par l'URL stable ``/api/media/<uuid>/serve/`` quand
l'object_key correspondant est trouvé dans MediaAsset.

Usage :

    python manage.py repair_lesson_images
    python manage.py repair_lesson_images --dry-run

Le dry-run affiche ce qui serait modifié sans écrire en base.
"""
from __future__ import annotations

import re
from urllib.parse import urlparse

from django.core.management.base import BaseCommand
from django.db import transaction

from catalog.models import Course, Lesson, MediaAsset


# Matche href/src avec ?X-Amz-Signature= (URL présignée S3/MinIO).
_HREF_SIGNED_RE = re.compile(
    r'(?P<attr>src|href)="(?P<url>[^"]*\?[^"]*X-Amz-Signature=[^"]+)"'
)


class Command(BaseCommand):
    help = "Répare les images/liens de leçons pointant vers des URLs MinIO présignées expirées."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="N'écrit pas en base, affiche uniquement les changements.",
        )

    def handle(self, *args, **opts):
        dry_run = opts["dry_run"]
        # Index : clé de l'objet → UUID de MediaAsset (résolution O(1)).
        media_by_key = {}
        for asset in MediaAsset.objects.all().only(
            "id", "object_key", "optimized_object_key", "thumbnail_object_key"
        ):
            for k in (
                asset.object_key,
                asset.optimized_object_key,
                asset.thumbnail_object_key,
            ):
                if k:
                    media_by_key[k] = str(asset.id)

        total_lessons = 0
        fixed_lessons = 0
        total_courses = 0
        fixed_courses = 0
        total_replacements = 0

        def repair(html: str) -> tuple[str, int]:
            replacements = 0

            def _sub(m: re.Match) -> str:
                nonlocal replacements
                url = m.group("url")
                attr = m.group("attr")
                # Extrait l'object_key depuis le path (après le bucket).
                try:
                    parsed = urlparse(url)
                    path = parsed.path.lstrip("/")
                    # Path habituel : /bucket/prefix/file.ext → on prend
                    # tout après le premier segment (nom du bucket).
                    parts = path.split("/", 1)
                    key = parts[1] if len(parts) == 2 else parts[0]
                except Exception:
                    return m.group(0)
                asset_id = media_by_key.get(key)
                if not asset_id:
                    return m.group(0)  # inconnu → on laisse (mais broken)
                replacements += 1
                return f'{attr}="/api/media/{asset_id}/serve/"'

            new_html = _HREF_SIGNED_RE.sub(_sub, html)
            return new_html, replacements

        # ── Leçons ──
        for lesson in Lesson.objects.exclude(content="").iterator():
            total_lessons += 1
            new_content, replaced = repair(lesson.content or "")
            if replaced:
                fixed_lessons += 1
                total_replacements += replaced
                self.stdout.write(
                    f"  Lesson #{lesson.id} « {lesson.title[:60]} » "
                    f"→ {replaced} URL(s) réparée(s)"
                )
                if not dry_run:
                    Lesson.objects.filter(pk=lesson.pk).update(content=new_content)

        # ── Descriptions de cours ──
        for course in Course.objects.exclude(description="").iterator():
            total_courses += 1
            new_desc, replaced = repair(course.description or "")
            if replaced:
                fixed_courses += 1
                total_replacements += replaced
                self.stdout.write(
                    f"  Course #{course.id} « {course.title[:60]} » "
                    f"→ {replaced} URL(s) réparée(s)"
                )
                if not dry_run:
                    Course.objects.filter(pk=course.pk).update(description=new_desc)

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                f"Terminé — {fixed_lessons}/{total_lessons} leçons + "
                f"{fixed_courses}/{total_courses} cours modifiés · "
                f"{total_replacements} URL(s) réécrite(s)."
            )
        )
        if dry_run:
            self.stdout.write(self.style.WARNING("(dry-run : aucune écriture en base)"))
