"""audit_user_profiles — Audit + réparation des comptes utilisateurs.

Détecte les incohérences liées aux rôles, profils métier et
permissions :

    - Utilisateurs sans profil métier (learner ou instructor)
    - Comptes ``is_staff=True`` ou ``is_superuser=True`` sans
      ``platform_role=PLATFORM_ADMIN`` (ou l'inverse)
    - InstructorProfile orphelin (sans User)
    - LearnerProfile orphelin
    - Comptes actifs sans email vérifié (à venir quand le champ existera)
    - Utilisateurs public marqués Super-admin sans justification

Usage :

    python manage.py audit_user_profiles                 # audit read-only
    python manage.py audit_user_profiles --apply         # applique les fix
    python manage.py audit_user_profiles --apply --create-missing-profiles
    python manage.py audit_user_profiles --json          # sortie JSON

Ne rétrograde jamais un vrai Super-administrateur automatiquement.
"""
from __future__ import annotations

import json

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction


User = get_user_model()


class Command(BaseCommand):
    help = "Audit + réparation des comptes utilisateurs (rôles / profils / permissions)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Applique les corrections. Sans ce flag, seul l'audit est affiché.",
        )
        parser.add_argument(
            "--create-missing-profiles",
            action="store_true",
            help="Crée automatiquement les profils métier manquants "
                 "(LearnerProfile par défaut) pour les users sans profil.",
        )
        parser.add_argument(
            "--json",
            action="store_true",
            help="Sortie JSON (utile en pipeline).",
        )

    # ── helpers d'inspection ─────────────────────────────────
    def _iter_findings(self):
        """Générateur de findings — un dict par anomalie détectée."""
        from compte.models import InstructorProfile, LearnerProfile

        for u in User.objects.all().iterator():
            has_instructor = hasattr(u, "instructor_profile")
            has_learner = hasattr(u, "learner_profile")
            is_admin_flag = getattr(u, "is_platform_admin", False)

            # 1) User sans aucun profil métier (learner ni instructor)
            if not has_instructor and not has_learner:
                yield {
                    "kind": "missing_business_profile",
                    "user_id": u.id,
                    "email": u.email,
                    "fix": "create_learner_profile",
                }

            # 2) is_staff / is_superuser sans platform_role admin
            if (u.is_staff or u.is_superuser) and not is_admin_flag:
                yield {
                    "kind": "staff_without_admin_role",
                    "user_id": u.id,
                    "email": u.email,
                    "is_staff": u.is_staff,
                    "is_superuser": u.is_superuser,
                    "platform_role": u.platform_role,
                    "fix": "review_manually",
                }

            # 3) platform_role admin sans is_staff (perte d'accès Django admin)
            if is_admin_flag and not u.is_staff:
                yield {
                    "kind": "admin_role_without_staff",
                    "user_id": u.id,
                    "email": u.email,
                    "fix": "set_is_staff_true",
                }

        # 4) Profils orphelins
        orphan_instructors = InstructorProfile.objects.filter(user__isnull=True)
        for p in orphan_instructors:
            yield {
                "kind": "orphan_instructor_profile",
                "profile_id": p.id,
                "fix": "delete_orphan_profile",
            }
        orphan_learners = LearnerProfile.objects.filter(user__isnull=True)
        for p in orphan_learners:
            yield {
                "kind": "orphan_learner_profile",
                "profile_id": p.id,
                "fix": "delete_orphan_profile",
            }

    # ── répairs ─────────────────────────────────────────────
    def _apply_fix(self, finding: dict, create_missing_profiles: bool) -> str:
        from compte.models import InstructorProfile, LearnerProfile

        kind = finding["kind"]
        if kind == "missing_business_profile" and create_missing_profiles:
            user = User.objects.filter(pk=finding["user_id"]).first()
            if not user:
                return "skipped: user disparu"
            LearnerProfile.objects.get_or_create(
                user=user,
                defaults={"job_title": "", "bio": ""},
            )
            return "created LearnerProfile"

        if kind == "admin_role_without_staff":
            user = User.objects.filter(pk=finding["user_id"]).first()
            if not user:
                return "skipped: user disparu"
            user.is_staff = True
            user.save(update_fields=["is_staff"])
            return "set is_staff=True"

        if kind == "orphan_instructor_profile":
            InstructorProfile.objects.filter(pk=finding["profile_id"]).delete()
            return "deleted orphan"
        if kind == "orphan_learner_profile":
            LearnerProfile.objects.filter(pk=finding["profile_id"]).delete()
            return "deleted orphan"

        # staff_without_admin_role → jamais auto (review manuel obligatoire)
        return "skipped: fix manuel requis"

    # ── main ─────────────────────────────────────────────────
    def handle(self, *args, **opts):
        apply_fixes = opts["apply"]
        create_missing = opts["create_missing_profiles"]
        as_json = opts["json"]

        findings = list(self._iter_findings())
        report = {
            "total": len(findings),
            "by_kind": {},
            "findings": findings,
            "fixes_applied": [],
        }
        for f in findings:
            report["by_kind"][f["kind"]] = report["by_kind"].get(f["kind"], 0) + 1

        if apply_fixes:
            with transaction.atomic():
                for f in findings:
                    result = self._apply_fix(f, create_missing_profiles=create_missing)
                    report["fixes_applied"].append(
                        {"kind": f["kind"], "target": f.get("email") or f.get("profile_id"), "result": result}
                    )

        if as_json:
            self.stdout.write(json.dumps(report, indent=2, ensure_ascii=False, default=str))
            return

        # Sortie humaine
        self.stdout.write(self.style.MIGRATE_HEADING("Audit comptes utilisateurs\n"))
        if not findings:
            self.stdout.write(self.style.SUCCESS("✓ Aucun problème détecté."))
            return

        self.stdout.write(self.style.WARNING(f"{len(findings)} finding(s) :"))
        for kind, count in report["by_kind"].items():
            self.stdout.write(f"  · {kind:<40}  {count}")

        self.stdout.write("")
        for f in findings[:50]:
            self.stdout.write(f"  · {f}")
        if len(findings) > 50:
            self.stdout.write(f"  … {len(findings) - 50} autres")

        if apply_fixes:
            self.stdout.write(self.style.SUCCESS(
                f"\n{len(report['fixes_applied'])} fix(es) appliqué(s)."
            ))
        else:
            self.stdout.write(self.style.NOTICE(
                "\nMode DRY-RUN — utilisez --apply pour corriger."
            ))
