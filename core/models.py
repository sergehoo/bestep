"""core.models — R46 : PlatformSettings versionné + journal.

Un singleton (``pk=1``) contient l'état courant des paramètres plateforme,
avec un compteur de version incrémenté à chaque écriture. Chaque
modification produit une entrée ``PlatformSettingsHistory`` immuable
(before / after / diff) pour audit et rollback.

Le payload est stocké en ``JSONField`` avec un dictionnaire structuré par
sections :

    {
      "identity":    {"platform_name": "...", "support_email": "...", ...},
      "auth":        {"session_ttl_min": 60, "mfa_required": false, ...},
      "emails":      {"from_email": "...", "smtp_host": "...", ...},
      "storage":     {"driver": "s3", "bucket": "...", ...},
      "limits":      {"max_upload_mb": 50, "quiz_max_questions": 100, ...},
      "maintenance": {"is_enabled": false, "message": "...", ...},
    }

Les valeurs par défaut sont fournies par ``PlatformSettings.default_data()``
et fusionnées à la lecture pour supporter l'ajout de nouvelles clés sans
migration de données.
"""
from __future__ import annotations

from typing import Any

from django.conf import settings
from django.db import models
from django.utils import timezone


def _default_settings() -> dict:
    """Structure canonique des sections + valeurs par défaut."""
    return {
        "identity": {
            "platform_name": "Best-Épargne",
            "tagline": "L'e-learning premium en Afrique de l'Ouest",
            "support_email": "support@best-epargne.com",
            "legal_email": "legal@best-epargne.com",
            "primary_locale": "fr",
            "supported_locales": ["fr", "en"],
        },
        "auth": {
            "session_ttl_min": 60,
            "refresh_ttl_days": 14,
            "mfa_required_admin": False,
            "password_min_length": 10,
            "lockout_attempts": 8,
            "lockout_cooldown_min": 15,
        },
        "emails": {
            "from_email": "noreply@best-epargne.com",
            "reply_to": "support@best-epargne.com",
            "smtp_host": "",
            "smtp_port": 587,
            "smtp_use_tls": True,
            "footer_signature": "L'équipe Best-Épargne",
        },
        "storage": {
            "driver": "s3",
            "bucket": "best-epargne-media",
            "region": "eu-west-3",
            "cdn_url": "",
            "max_upload_mb": 50,
            "signed_url_ttl_min": 60,
        },
        "limits": {
            "max_upload_mb": 50,
            "quiz_max_questions": 100,
            "course_max_lessons": 200,
            "instructor_max_courses": 50,
            "students_per_cohort": 500,
        },
        "maintenance": {
            "is_enabled": False,
            "message": "",
            "estimated_end": None,
            "block_write_only": True,
        },
    }


class PlatformSettings(models.Model):
    """Singleton : la ligne pk=1 contient les paramètres courants."""

    SINGLETON_PK = 1

    data = models.JSONField(default=_default_settings)
    version = models.PositiveIntegerField(default=1)
    updated_at = models.DateTimeField(default=timezone.now)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    class Meta:
        verbose_name = "Paramètres plateforme"
        verbose_name_plural = "Paramètres plateforme"

    def __str__(self) -> str:
        return f"PlatformSettings v{self.version}"

    # ── Helpers ────────────────────────────────────────────────
    @classmethod
    def default_data(cls) -> dict:
        return _default_settings()

    @classmethod
    def load(cls) -> "PlatformSettings":
        """Charge (ou crée) la ligne singleton."""
        obj, _created = cls.objects.get_or_create(
            pk=cls.SINGLETON_PK,
            defaults={"data": _default_settings(), "version": 1},
        )
        return obj

    def merged_data(self) -> dict:
        """Fusion défauts × data : garantit toutes les clés à la lecture."""
        defaults = _default_settings()
        out: dict[str, Any] = {}
        for section, default_section in defaults.items():
            stored = (self.data or {}).get(section) or {}
            merged = dict(default_section)
            merged.update({k: v for k, v in stored.items() if k in default_section})
            out[section] = merged
        return out

    def apply_patch(
        self,
        patch: dict,
        *,
        actor=None,
        note: str = "",
    ) -> "PlatformSettingsHistory":
        """Applique un patch (dict partiel section → clés) et journalise.

        - Fusionne section par section (les sections/clés non mentionnées
          restent inchangées).
        - Incrémente ``version``, met à jour ``updated_at``/``updated_by``.
        - Crée un ``PlatformSettingsHistory`` before/after.
        """
        before = self.merged_data()
        merged = self.merged_data()
        for section, changes in (patch or {}).items():
            if section not in merged or not isinstance(changes, dict):
                continue
            merged[section].update(
                {k: v for k, v in changes.items() if k in merged[section]}
            )

        self.data = merged
        self.version = (self.version or 0) + 1
        self.updated_at = timezone.now()
        if actor is not None and getattr(actor, "is_authenticated", False):
            self.updated_by = actor
        self.save(update_fields=["data", "version", "updated_at", "updated_by"])

        return PlatformSettingsHistory.objects.create(
            version=self.version,
            before=before,
            after=merged,
            actor=actor if getattr(actor, "is_authenticated", False) else None,
            note=note or "",
        )


class PlatformSettingsHistory(models.Model):
    """Journal immuable des modifications de PlatformSettings."""

    version = models.PositiveIntegerField()
    before = models.JSONField(default=dict)
    after = models.JSONField(default=dict)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    note = models.CharField(max_length=280, blank=True, default="")
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["-created_at"])]
        verbose_name = "Historique paramètres"
        verbose_name_plural = "Historique paramètres"

    def __str__(self) -> str:
        return f"Settings v{self.version} @ {self.created_at:%Y-%m-%d %H:%M}"

    def diff_flat(self) -> list[dict]:
        """Retourne une liste plate {section, key, old, new} des changements."""
        out: list[dict] = []
        for section, after_section in (self.after or {}).items():
            before_section = (self.before or {}).get(section) or {}
            if not isinstance(after_section, dict):
                continue
            for key, new in after_section.items():
                old = before_section.get(key)
                if old != new:
                    out.append(
                        {"section": section, "key": key, "old": old, "new": new}
                    )
        return out
