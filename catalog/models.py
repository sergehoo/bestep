from __future__ import annotations

import uuid

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import models
from django.utils import timezone
from django.utils.text import slugify

User = get_user_model()


class Category(models.Model):
    name = models.CharField(max_length=120, unique=True)
    slug = models.SlugField(max_length=140, unique=True, blank=True)

    class Meta:
        verbose_name = "Catégorie"
        verbose_name_plural = "Catégories"
        ordering = ["name"]

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)[:140]
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class Course(models.Model):
    class CourseType(models.TextChoices):
        CERTIFIANTE = "CERTIFIANTE", "Certifiante"
        PROFESSIONNELLE = "PROFESSIONNELLE", "Professionnelle"
        ACADEMIQUE = "ACADEMIQUE", "Académique"
        INTERNE = "INTERNE", "Interne (RH / conformité)"

    class PricingType(models.TextChoices):
        FREE = "FREE", "Gratuit"
        PAID = "PAID", "Payant"
        HYBRID = "HYBRID", "Hybride"

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Brouillon"
        REVIEW = "REVIEW", "En validation"
        PUBLISHED = "PUBLISHED", "Publié"
        ARCHIVED = "ARCHIVED", "Archivé"

    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220, unique=True, blank=True)
    subtitle = models.CharField(max_length=220, blank=True)
    description = models.TextField(blank=True)

    category = models.ForeignKey("catalog.Category", on_delete=models.SET_NULL, null=True, related_name="courses")
    instructor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="courses_created")

    course_type = models.CharField(max_length=20, choices=CourseType.choices, default=CourseType.PROFESSIONNELLE)
    pricing_type = models.CharField(max_length=10, choices=PricingType.choices, default=PricingType.PAID)
    price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    currency = models.CharField(max_length=8, default="XOF")

    status = models.CharField(max_length=12, choices=Status.choices, default=Status.DRAFT)
    published_at = models.DateTimeField(null=True, blank=True)

    # Cours internes d'entreprise
    company_only = models.BooleanField(default=False)
    company = models.ForeignKey(
        "organizations.Company",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="internal_courses"
    )

    thumbnail = models.ImageField(upload_to="courses/thumbnails/", null=True, blank=True)
    preview_video_url = models.URLField(blank=True)
    preview_media_asset = models.ForeignKey(
        "catalog.MediaAsset",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="course_previews",
        help_text="Preview vidéo (MinIO) affichée en page cours."
    )
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "pricing_type"]),
            models.Index(fields=["slug"]),
            models.Index(fields=["created_at"]),
        ]

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.title)[:190] or "course"
            slug = base
            i = 1
            while Course.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                i += 1
                slug = f"{base}-{i}"[:220]
            self.slug = slug

        # Prix automatique si gratuit
        if self.pricing_type == self.PricingType.FREE:
            self.price = 0

        if self.status == self.Status.PUBLISHED and self.published_at is None:
            self.published_at = timezone.now()

        super().save(*args, **kwargs)

    def __str__(self):
        return self.title


class CourseSection(models.Model):
    course = models.ForeignKey("catalog.Course", on_delete=models.CASCADE, related_name="sections")
    title = models.CharField(max_length=200)
    order = models.PositiveIntegerField(default=1)

    class Meta:
        unique_together = ("course", "order")
        ordering = ["order"]
        indexes = [models.Index(fields=["course", "order"])]

    def __str__(self):
        return f"{self.course.title} — {self.order}. {self.title}"


class MediaAsset(models.Model):
    """
    Fichiers envoyés par le formateur vers MinIO via presigned URL.
    Une Lesson peut pointer vers un MediaAsset pour VIDEO/AUDIO/DOC.
    """

    class Kind(models.TextChoices):
        VIDEO = "video", "Video"
        AUDIO = "audio", "Audio"
        DOC = "doc", "Document"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name="media_assets")
    kind = models.CharField(max_length=10, choices=Kind.choices)

    title = models.CharField(max_length=255, blank=True, default="")
    object_key = models.CharField(max_length=1024, unique=True)  # chemin dans MinIO
    content_type = models.CharField(max_length=120)
    size = models.BigIntegerField(default=0)

    duration_seconds = models.IntegerField(null=True, blank=True)  # optionnel
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["owner", "kind", "created_at"]),
        ]

    def __str__(self):
        return f"{self.kind} • {self.title or self.object_key}"


class Lesson(models.Model):
    class LessonType(models.TextChoices):
        VIDEO = "VIDEO", "Vidéo"
        TEXT = "TEXT", "Texte"
        FILE = "FILE", "Fichier"
        QUIZ = "QUIZ", "Quiz"
        LIVE = "LIVE", "Live"

    section = models.ForeignKey("catalog.CourseSection", on_delete=models.CASCADE, related_name="lessons")
    title = models.CharField(max_length=200)
    order = models.PositiveIntegerField(default=1)

    lesson_type = models.CharField(max_length=10, choices=LessonType.choices, default=LessonType.VIDEO)
    is_preview = models.BooleanField(default=False)  # pour HYBRID / marketing

    duration_sec = models.PositiveIntegerField(default=0)

    # Contenu texte
    content = models.TextField(blank=True)

    # (Legacy) si tu veux garder des URL externes (YouTube/Vimeo)
    video_url = models.URLField(blank=True)

    # Fichier local (optionnel). En prod, préfère MediaAsset + MinIO.
    file = models.FileField(upload_to="courses/files/", null=True, blank=True)

    # ✅ Nouveau: lien vers un upload MinIO
    media_asset = models.ForeignKey(
        "catalog.MediaAsset",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="lessons",
        help_text="Fichier MinIO lié (video/audio/doc)."
    )

    class Meta:
        unique_together = ("section", "order")
        ordering = ["section__order", "order"]
        indexes = [models.Index(fields=["section", "order"])]

    def __str__(self):
        return f"{self.section.course.title} — {self.section.order}.{self.order} {self.title}"

class Payment(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "En attente"
        PAID = "PAID", "Payé"
        FAILED = "FAILED", "Échoué"
        CANCELED = "CANCELED", "Annulé"
        REFUNDED = "REFUNDED", "Remboursé"

    class Kind(models.TextChoices):
        COURSE = "COURSE", "Achat cours"
        SUBSCRIPTION = "SUBSCRIPTION", "Abonnement"
        OTHER = "OTHER", "Autre"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="payments",
    )

    # Optionnel (si tu as Course)
    course_id = models.PositiveIntegerField(null=True, blank=True)

    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.COURSE)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)

    reference = models.CharField(max_length=80, unique=True)  # ex: "PAY-2026-00001"
    provider = models.CharField(max_length=40, blank=True, default="")  # ex: "CinetPay", "OrangeMoney", ...
    provider_ref = models.CharField(max_length=120, blank=True, default="")  # ref du PSP

    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    currency = models.CharField(max_length=8, default="XOF")

    description = models.CharField(max_length=255, blank=True, default="")

    meta = models.JSONField(default=dict, blank=True)  # payload brut, infos PSP, etc.

    created_at = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "status"]),
            models.Index(fields=["reference"]),
            models.Index(fields=["provider", "provider_ref"]),
        ]

    def __str__(self):
        return f"{self.reference} • {self.user_id} • {self.status} • {self.amount}{self.currency}"
class Notification(models.Model):
    class Level(models.TextChoices):
        INFO = "INFO", "Info"
        SUCCESS = "SUCCESS", "Succès"
        WARNING = "WARNING", "Alerte"
        DANGER = "DANGER", "Critique"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )

    title = models.CharField(max_length=140)
    body = models.TextField(blank=True, default="")
    level = models.CharField(max_length=10, choices=Level.choices, default=Level.INFO)

    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)

    # Optionnel: lien cliquable côté UI
    action_url = models.CharField(max_length=255, blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "is_read", "created_at"]),
        ]

    def __str__(self):
        return f"{self.user_id} • {self.title}"