"""sync_allauth_verified — Backfill User.is_email_verified depuis allauth.

Pour tous les users dont un EmailAddress est ``verified=True`` côté
allauth mais ``User.is_email_verified=False`` côté natif, propage la
vérification. Idempotent et sûr à ré-exécuter.

Usage :

    python manage.py sync_allauth_verified              # dry-run
    python manage.py sync_allauth_verified --apply      # applique
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone


User = get_user_model()


class Command(BaseCommand):
    help = "Propage allauth.EmailAddress.verified vers User.is_email_verified."

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true", help="Applique (défaut = dry-run).")

    def handle(self, *args, **opts):
        apply_ = opts["apply"]
        try:
            from allauth.account.models import EmailAddress
        except ImportError:
            self.stdout.write(self.style.ERROR("allauth n'est pas installé."))
            return

        # Users à backfiller : ont au moins un EmailAddress verified
        # mais leur flag natif est encore False.
        targets = (
            User.objects
            .filter(emailaddress__verified=True, is_email_verified=False)
            .distinct()
        )
        total = targets.count()
        self.stdout.write(
            f"{total} user(s) à backfiller (allauth verified → User.is_email_verified)."
        )
        if not apply_:
            for u in targets[:50]:
                self.stdout.write(f"  · {u.email}")
            if total > 50:
                self.stdout.write(f"  … et {total - 50} autres")
            self.stdout.write(
                self.style.NOTICE("Mode DRY-RUN. Utilisez --apply pour propager.")
            )
            return

        now = timezone.now()
        updated = 0
        for u in targets.iterator():
            u.is_email_verified = True
            u.email_verified_at = u.email_verified_at or now
            u.save(update_fields=["is_email_verified", "email_verified_at"])
            updated += 1
        self.stdout.write(
            self.style.SUCCESS(f"✓ {updated} user(s) mis à jour.")
        )
