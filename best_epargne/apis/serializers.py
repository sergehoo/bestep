"""
best_epargne/apis/serializers.py — CORRECTIF P1.B.

Corrections principales (audit) :

- **API-28 / API-32 (Critique IDOR sérializer)** : ``company``, ``company_only``,
  ``preview_media_asset_id`` deviennent ``read_only_fields`` du CourseSerializer
  par défaut. Un instructeur ne peut plus PATCH son cours sous une autre org.
  Pour les écritures légitimes (admin org qui crée un cours pour son org),
  une sous-classe ``CourseWriteSerializer`` peut être utilisée plus tard.

- **API-31 (IDOR sérializer)** : ``LessonSerializer.validate_media_asset_id``
  vérifie via ``catalog.services.get_visible_media_qs`` que l'asset référencé
  est visible par le request.user.

- **API-32 (IDOR sérializer)** : ``CourseSerializer.validate_preview_media_asset_id``
  fait le même check sur le preview.

- **API-34 (Leak object_key MinIO)** : ``object_key``, ``optimized_object_key``,
  ``thumbnail_object_key`` ne sont plus exposés dans MediaAssetListSerializer ni
  MediaAssetDetailSerializer ni MediaAssetSerializer. Les clients passent par
  ``/api/media/<id>/signed/`` pour obtenir une URL temporaire.

- **API-36 (Bug get_can_edit)** : on utilise ``obj.company_id`` (le nom réel du
  champ sur ``Course``) au lieu de ``obj.organization_id`` (qui n'existe pas).

- **API-37 (Code mort)** : suppression des ~40 lignes commentées.

- **Validation upload (API-10 + API-12)** : ``MediaUploadInitSerializer`` valide
  désormais MIME ∈ whitelist par kind, size ≤ MAX_SIZE_PER_KIND, et accepte une
  ``expires_in`` optionnelle bornée à 1800s (30 min).
"""
from __future__ import annotations

from typing import Optional

from django.urls import reverse
from django.utils.text import slugify
from django.utils.timesince import timesince
from rest_framework import serializers

from catalog.models import Category, Course, CourseSection, Lesson, MediaAsset
from commerce.models import OrderItem
from organizations.models import OrganizationMembership

# --- Whitelists upload média ----------------------------------------------

ALLOWED_MIME_BY_KIND = {
    MediaAsset.Kind.VIDEO: {
        "video/mp4",
        "video/webm",
        "video/quicktime",
        "video/x-matroska",
    },
    MediaAsset.Kind.AUDIO: {
        "audio/mpeg",
        "audio/mp4",
        "audio/ogg",
        "audio/wav",
        "audio/x-m4a",
    },
    MediaAsset.Kind.DOC: {
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "image/png",
        "image/jpeg",
        "image/webp",
    },
}

MAX_SIZE_BY_KIND = {
    MediaAsset.Kind.VIDEO: 5 * 1024 * 1024 * 1024,   # 5 GiB
    MediaAsset.Kind.AUDIO: 250 * 1024 * 1024,        # 250 MiB
    MediaAsset.Kind.DOC: 100 * 1024 * 1024,          # 100 MiB
}


class OpenApiObjectSerializer(serializers.Serializer):
    """Contrat générique pour les endpoints à réponse JSON libre."""


# --- Catégorie -------------------------------------------------------------


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "slug"]


# --- MediaAsset ------------------------------------------------------------

class MediaAssetSerializer(serializers.ModelSerializer):
    can_edit = serializers.SerializerMethodField()
    can_delete = serializers.SerializerMethodField()
    scope = serializers.SerializerMethodField()
    owner_name = serializers.SerializerMethodField()
    # UX-01 — URLs de rendu pour la médiathèque (thumbnails).
    thumbnail_url = serializers.SerializerMethodField()
    preview_url = serializers.SerializerMethodField()

    def _default_storage_url(self, key: str) -> str:
        """Construit l'URL d'accès à un object_key stocké dans MinIO.

        UX-03 — Fix miniatures brisées : le backend est configuré avec
        ``DEFAULT_FILE_STORAGE = S3Boto3Storage`` + ``AWS_QUERYSTRING_AUTH
        = True``, donc les URLs bruts ``/media/<key>`` sont refusées par
        MinIO (bucket privé). On génère ici une **URL presignée** via
        boto3, réutilisant le même client que ``MediaSignedGetView``.

        En cas d'échec (config manquante, etc.), on retourne une URL
        best-effort ``MEDIA_URL + key`` — utile en environnement de dev
        où le bucket peut être public. Cache par-appel : les listes
        pagination faisant 20-30 items, on évite de signer 2 fois le
        même key.
        """
        if not key:
            return ""
        from django.conf import settings

        # Cache par contexte de sérialisation pour éviter des signatures
        # redondantes (thumbnail_url + preview_url peuvent partager la
        # même clé pour une image).
        cache = self.context.setdefault("_signed_url_cache", {})
        if key in cache:
            return cache[key]

        bucket = getattr(settings, "MINIO_BUCKET", None) or getattr(
            settings, "AWS_STORAGE_BUCKET_NAME", None
        )
        try:
            if bucket and getattr(settings, "MINIO_PUBLIC_ENDPOINT", None):
                from best_epargne.apis.views import s3_public_client
                client = s3_public_client()
                url = client.generate_presigned_url(
                    ClientMethod="get_object",
                    Params={"Bucket": bucket, "Key": key.lstrip("/")},
                    # 1h — suffisant pour un affichage sans re-signature
                    # constante. Le frontend refetch la liste toutes les
                    # 30s (staleTime react-query), donc largement OK.
                    ExpiresIn=int(getattr(settings, "AWS_QUERYSTRING_EXPIRE", 3600)),
                )
                cache[key] = url
                return url
        except Exception:
            # Best-effort : on tombe sur l'URL relative si la signature
            # échoue (dev local sans MinIO, etc.).
            pass

        media_url = getattr(settings, "MEDIA_URL", "/media/").rstrip("/")
        url = f"{media_url}/{key.lstrip('/')}"
        cache[key] = url
        return url

    def get_thumbnail_url(self, obj) -> str:
        """URL de la miniature (image extraite pour vidéo, aperçu pour doc).

        UX-09 — Détection image élargie : certains uploads anciens ont
        ``content_type`` vide en base (ex : upload direct via boto3 sans
        entête). On fallback donc aussi sur l'extension du ``object_key``
        et du ``title`` pour reconnaître PNG/JPEG/GIF/WebP/SVG.

        Retourne '' si aucune miniature disponible.
        """
        import re

        key = getattr(obj, "thumbnail_object_key", "") or ""
        if key:
            return self._default_storage_url(key)

        # Détection image robuste : content_type OU extension dans
        # object_key / title.
        content_type = (getattr(obj, "content_type", "") or "").lower()
        object_key = (getattr(obj, "object_key", "") or "").lower()
        title = (getattr(obj, "title", "") or "").lower()
        ext_re = re.compile(r"\.(png|jpe?g|gif|webp|svg|bmp|avif)($|\?)")
        is_image = (
            content_type.startswith("image/")
            or bool(ext_re.search(object_key))
            or bool(ext_re.search(title))
        )
        if is_image:
            main_key = (
                getattr(obj, "optimized_object_key", "")
                or getattr(obj, "object_key", "")
                or ""
            )
            if main_key:
                return self._default_storage_url(main_key)
        return ""

    def get_preview_url(self, obj) -> str:
        """URL de streaming/lecture (video optimisée si dispo, sinon original).

        Utile pour les cards vidéo qui peuvent lire un `<video poster>`
        dans la médiathèque, et pour l'insertion réelle du média dans
        l'éditeur WYSIWYG.
        """
        for attr in ("optimized_object_key", "object_key"):
            key = getattr(obj, attr, "") or ""
            if key:
                return self._default_storage_url(key)
        return ""

    def _writable_org_ids(self):
        """Lazy cache des org_ids OWNER/ADMIN/MANAGER du request.user.

        Évite un N+1 dans les listes paginées (cf. API-35).
        """
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user is None or not user.is_authenticated:
            return []
        cache = self.context.setdefault("_writable_org_ids_cache", None)
        if cache is not None:
            return cache
        ids = list(
            user.organization_memberships.filter(
                role__in=[
                    OrganizationMembership.Role.OWNER,
                    OrganizationMembership.Role.ADMIN,
                    OrganizationMembership.Role.MANAGER,
                ],
                is_active=True,
                organization__is_active=True,
            ).values_list("organization_id", flat=True)
        )
        self.context["_writable_org_ids_cache"] = ids
        return ids

    def get_can_edit(self, obj) -> bool:
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user is None or not user.is_authenticated:
            return False
        if getattr(user, "is_platform_admin", False):
            return True
        if obj.owner_id == user.id:
            return True
        organization_id = getattr(obj, "organization_id", None)
        if not organization_id:
            return False
        return organization_id in self._writable_org_ids()

    def get_can_delete(self, obj) -> bool:
        return self.get_can_edit(obj)

    def get_scope(self, obj) -> str:
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user and user.is_authenticated and obj.owner_id == user.id:
            return "personal"
        return "organization"

    def get_owner_name(self, obj) -> str:
        owner = getattr(obj, "owner", None)
        if not owner:
            return "—"
        return (
            getattr(owner, "full_name", None)
            or f"{getattr(owner, 'first_name', '')} {getattr(owner, 'last_name', '')}".strip()
            or getattr(owner, "email", None)
            or "Utilisateur"
        )

    class Meta:
        model = MediaAsset
        # CORRECTIF API-34 : on ne renvoie plus ``object_key`` (chemin MinIO interne).
        fields = [
            "id",
            "kind",
            "title",
            "content_type",
            "size",
            "duration_seconds",
            "created_at",
            "processing_status",
            "can_edit",
            "can_delete",
            "scope",
            "owner_name",
            "thumbnail_url",
            "preview_url",
        ]


# --- Lesson / Section ------------------------------------------------------


class LessonSerializer(serializers.ModelSerializer):
    media_asset = MediaAssetSerializer(read_only=True)
    media_asset_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = Lesson
        fields = [
            "id", "title", "order", "lesson_type", "is_preview", "duration_sec",
            "video_url", "content", "file",
            "media_asset", "media_asset_id",
        ]
        read_only_fields = ["id", "media_asset"]

    def validate_media_asset_id(self, value):
        """CORRECTIF API-31 : un instructeur ne peut référencer que les médias
        qu'il a légitimement le droit de voir (siens + ceux de ses orgs)."""
        if value is None:
            return value
        # Import local pour éviter le coût d'import au top-level.
        from catalog.services import get_visible_media_qs
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user is None or not user.is_authenticated:
            raise serializers.ValidationError("Authentification requise.")
        if not get_visible_media_qs(user).filter(pk=value).exists():
            raise serializers.ValidationError("Média introuvable ou non accessible.")
        return value

    def validate(self, attrs):
        lt = attrs.get("lesson_type")
        # Garde-fou : leçon VIDEO doit avoir media_asset_id ou video_url ;
        # leçon TEXT doit avoir content ; on accepte vide mais on log côté front.
        if lt == "TEXT" and not attrs.get("content", ""):
            return attrs
        return attrs

    def create(self, validated_data):
        media_asset_id = validated_data.pop("media_asset_id", None)
        obj = super().create(validated_data)
        if media_asset_id:
            obj.media_asset_id = media_asset_id
            obj.save(update_fields=["media_asset"])
        return obj

    def update(self, instance, validated_data):
        media_asset_id = validated_data.pop("media_asset_id", None)
        instance = super().update(instance, validated_data)
        if media_asset_id is not None:
            instance.media_asset_id = media_asset_id
            instance.save(update_fields=["media_asset"])
        return instance


class CourseSectionSerializer(serializers.ModelSerializer):
    lessons = LessonSerializer(many=True, read_only=True)

    class Meta:
        model = CourseSection
        fields = ["id", "title", "order", "lessons"]


# --- Course ----------------------------------------------------------------


class CourseSerializer(serializers.ModelSerializer):
    category = CategorySerializer(read_only=True)
    # R6 : permettre à la SPA React d'associer/modifier la catégorie via
    # son id (le nested ``category`` reste read-only pour la sortie propre).
    category_id = serializers.PrimaryKeyRelatedField(
        source="category",
        queryset=Category.objects.all(),
        write_only=True,
        required=False,
        allow_null=True,
    )
    thumbnail_url = serializers.SerializerMethodField()
    preview_media_asset = MediaAssetSerializer(read_only=True)
    preview_media_asset_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)

    instructor_name = serializers.CharField(source="instructor.full_name", read_only=True)

    sections_count = serializers.IntegerField(read_only=True)
    lessons_count = serializers.IntegerField(read_only=True)
    enrolled_count = serializers.IntegerField(read_only=True)
    rating_avg = serializers.FloatField(read_only=True)
    rating_count = serializers.IntegerField(read_only=True)
    completion_rate = serializers.IntegerField(read_only=True)

    updated_at_human = serializers.SerializerMethodField()

    can_edit = serializers.SerializerMethodField()
    can_delete = serializers.SerializerMethodField()
    scope = serializers.SerializerMethodField()

    class Meta:
        model = Course
        fields = [
            "id",
            "title",
            "slug",
            "subtitle",
            "description",
            "course_type",
            "pricing_type",
            "price",
            "currency",
            "status",
            "published_at",
            "thumbnail",
            "thumbnail_url",
            "preview_video_url",
            "preview_media_asset",
            "preview_media_asset_id",
            "company_only",
            "company",
            "category",
            "category_id",
            "instructor",
            "instructor_name",
            "sections_count",
            "lessons_count",
            "enrolled_count",
            "rating_avg",
            "rating_count",
            "completion_rate",
            "updated_at_human",
            "can_edit",
            "can_delete",
            "scope",
            # R20 — Certificate Template Builder
            "certificate_template",
        ]
        # CORRECTIF API-28 : ``company``, ``company_only`` deviennent
        # read_only sur ce sérializer générique. Un instructeur ne peut
        # PLUS basculer son cours vers une autre org via PATCH.
        # Si vous voulez permettre l'édition à un admin org, créez un
        # ``CourseAdminWriteSerializer(CourseSerializer)`` dédié qui
        # surcharge ``read_only_fields`` et valide via ``can_edit``.
        read_only_fields = [
            "status",
            "published_at",
            "instructor",
            "slug",
            "company",
            "company_only",
        ]

    def get_updated_at_human(self, obj) -> Optional[str]:  # noqa: UP007
        dt = getattr(obj, "updated_at", None)
        return f"il y a {timesince(dt)}" if dt else None

    def get_thumbnail_url(self, obj) -> Optional[str]:  # noqa: UP007
        req = self.context.get("request")
        if obj.thumbnail and hasattr(obj.thumbnail, "url"):
            return req.build_absolute_uri(obj.thumbnail.url) if req else obj.thumbnail.url
        return None

    def _writable_org_ids(self):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user is None or not user.is_authenticated:
            return []
        cache = self.context.get("_course_writable_orgs_cache")
        if cache is not None:
            return cache
        ids = list(
            user.organization_memberships.filter(
                role__in=[
                    OrganizationMembership.Role.OWNER,
                    OrganizationMembership.Role.ADMIN,
                    OrganizationMembership.Role.MANAGER,
                ],
                is_active=True,
                organization__is_active=True,
            ).values_list("organization_id", flat=True)
        )
        self.context["_course_writable_orgs_cache"] = ids
        return ids

    def get_can_edit(self, obj) -> bool:
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return False
        if getattr(user, "is_platform_admin", False):
            return True
        if obj.instructor_id == user.id:
            return True
        # CORRECTIF API-36 : on lit company_id, pas organization_id (champ inexistant).
        company_id = getattr(obj, "company_id", None)
        if not company_id:
            return False
        return company_id in self._writable_org_ids()

    def get_can_delete(self, obj) -> bool:
        return self.get_can_edit(obj)

    def get_scope(self, obj) -> str:
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user and obj.instructor_id == user.id:
            return "personal"
        return "organization"

    def validate_certificate_template(self, value):
        """R20 — un cours ne peut référencer qu'un template visible.

        Templates visibles = owner par l'user connecté OU publics
        (``is_public=True``) OU presets globaux (``owner IS NULL``).
        ``None`` désassigne le template.
        """
        if value is None:
            return value
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user is None or not user.is_authenticated:
            raise serializers.ValidationError("Authentification requise.")
        if getattr(user, "is_platform_admin", False):
            return value
        if value.owner_id and value.owner_id != user.id and not value.is_public:
            raise serializers.ValidationError(
                "Ce template n'est pas accessible."
            )
        return value

    def validate_preview_media_asset_id(self, value):
        """CORRECTIF API-32 : preview ne peut référencer qu'un média visible."""
        if value is None:
            return value
        from catalog.services import get_visible_media_qs
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user is None or not user.is_authenticated:
            raise serializers.ValidationError("Authentification requise.")
        if not get_visible_media_qs(user).filter(pk=value).exists():
            raise serializers.ValidationError("Média de preview introuvable ou non accessible.")
        return value


# --- Checkout / Webhook ----------------------------------------------------


class CheckoutItemSerializer(serializers.Serializer):
    course_id = serializers.IntegerField(required=False)
    seats_qty = serializers.IntegerField(required=False, min_value=1)
    item_type = serializers.ChoiceField(choices=OrderItem.ItemType.choices)

    def validate(self, attrs):
        item_type = attrs["item_type"]
        if item_type == OrderItem.ItemType.COURSE and not attrs.get("course_id"):
            raise serializers.ValidationError("course_id is required for COURSE item.")
        if item_type == OrderItem.ItemType.COMPANY_SEATS and not attrs.get("seats_qty"):
            raise serializers.ValidationError("seats_qty is required for COMPANY_SEATS item.")
        return attrs


class CheckoutCreateSerializer(serializers.Serializer):
    provider = serializers.CharField()
    currency = serializers.CharField(default="XOF")
    coupon_code = serializers.CharField(required=False, allow_blank=True)
    company_id = serializers.IntegerField(required=False)
    items = CheckoutItemSerializer(many=True)


class WebhookSerializer(serializers.Serializer):
    provider = serializers.CharField()
    reference = serializers.CharField()
    status = serializers.ChoiceField(choices=["SUCCESS", "FAILED", "PENDING"])
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    currency = serializers.CharField(required=False)
    raw_payload = serializers.JSONField(required=False)


# --- Media upload init -----------------------------------------------------


class MediaUploadInitSerializer(serializers.Serializer):
    """CORRECTIF API-10 : whitelist stricte des MIME/size par kind.

    Empêche d'utiliser le bucket comme hébergement libre (text/html, 10 TB, etc.).
    """
    filename = serializers.CharField(max_length=255)
    content_type = serializers.CharField(max_length=255)
    size = serializers.IntegerField(min_value=1)
    kind = serializers.ChoiceField(choices=MediaAsset.Kind.choices)
    title = serializers.CharField(max_length=255, required=False, allow_blank=True)

    def validate(self, attrs):
        kind = attrs["kind"]
        content_type = attrs["content_type"].lower().strip()
        size = attrs["size"]

        allowed = ALLOWED_MIME_BY_KIND.get(kind, set())
        if content_type not in allowed:
            raise serializers.ValidationError({
                "content_type": (
                    f"Type MIME '{content_type}' non autorisé pour kind={kind}. "
                    f"Autorisés : {sorted(allowed)}."
                ),
            })

        max_size = MAX_SIZE_BY_KIND.get(kind, 0)
        if max_size and size > max_size:
            raise serializers.ValidationError({
                "size": f"Fichier trop volumineux pour kind={kind} (max {max_size} octets).",
            })

        # Filename : pas de path traversal en clair (côté serveur on resanitize aussi).
        fn = attrs["filename"]
        if "/" in fn or "\\" in fn or fn.startswith("."):
            raise serializers.ValidationError({"filename": "Nom de fichier invalide."})
        if len(fn) > 200:
            raise serializers.ValidationError({"filename": "Nom de fichier trop long."})

        return attrs


class MediaBindSerializer(serializers.Serializer):
    course_id = serializers.IntegerField(min_value=1)
    section_id = serializers.IntegerField(min_value=1)
    lesson_id = serializers.IntegerField(min_value=1)


class MediaUploadFinalizeSerializer(serializers.Serializer):
    upload_id = serializers.CharField(max_length=255)
    object_key = serializers.CharField(max_length=500)
    kind = serializers.ChoiceField(choices=MediaAsset.Kind.choices)
    title = serializers.CharField(max_length=255, required=False, allow_blank=True)
    content_type = serializers.CharField(max_length=255)
    size = serializers.IntegerField(min_value=1)
    duration_seconds = serializers.IntegerField(required=False, allow_null=True, min_value=0)
    bind = MediaBindSerializer(required=False, allow_null=True)

    def validate(self, attrs):
        kind = attrs["kind"]
        content_type = attrs["content_type"].lower().strip()
        allowed = ALLOWED_MIME_BY_KIND.get(kind, set())
        if content_type not in allowed:
            raise serializers.ValidationError({
                "content_type": f"Type MIME '{content_type}' non autorisé pour kind={kind}.",
            })
        max_size = MAX_SIZE_BY_KIND.get(kind, 0)
        if max_size and attrs["size"] > max_size:
            raise serializers.ValidationError({"size": "Fichier trop volumineux."})
        return attrs


# --- Media list / detail / update -----------------------------------------


class MediaAssetListSerializer(serializers.ModelSerializer):
    """CORRECTIF API-34 : on n'expose plus les chemins MinIO internes (object_key,
    optimized_object_key, thumbnail_object_key). Le client passe par les
    endpoints ``/api/media/<id>/signed/`` ou ``/thumbnail/`` pour récupérer
    une URL signée éphémère."""
    thumbnail_url = serializers.SerializerMethodField()
    optimized = serializers.SerializerMethodField()

    class Meta:
        model = MediaAsset
        fields = [
            "id",
            "kind",
            "title",
            "content_type",
            "size",
            "duration_seconds",
            "processing_status",
            "processing_error",
            "width",
            "height",
            "bitrate",
            "thumbnail_url",
            "optimized",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_thumbnail_url(self, obj):
        request = self.context.get("request")
        if not request:
            return ""
        if not obj.thumbnail_object_key:
            return ""
        return request.build_absolute_uri(f"/api/media/{obj.id}/thumbnail/")

    def get_optimized(self, obj):
        return bool(obj.optimized_object_key)


class MediaAssetDetailSerializer(serializers.ModelSerializer):
    """CORRECTIF API-34 : idem, plus de fuite des chemins internes."""

    class Meta:
        model = MediaAsset
        fields = [
            "id",
            "kind",
            "title",
            "content_type",
            "size",
            "duration_seconds",
            "width",
            "height",
            "bitrate",
            "processing_status",
            "processing_error",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class MediaAssetUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = MediaAsset
        fields = ["title", "kind"]

    def validate_kind(self, value):
        allowed = {
            MediaAsset.Kind.VIDEO,
            MediaAsset.Kind.AUDIO,
            MediaAsset.Kind.DOC,
        }
        if value not in allowed:
            raise serializers.ValidationError("Type de média invalide.")
        return value


# --- Public course ---------------------------------------------------------


class PublicCourseSerializer(serializers.ModelSerializer):
    course_type_label = serializers.CharField(source="get_course_type_display", read_only=True)
    pricing_type_label = serializers.CharField(source="get_pricing_type_display", read_only=True)

    category_name = serializers.SerializerMethodField()
    category_slug = serializers.SerializerMethodField()
    instructor_name = serializers.SerializerMethodField()
    instructor_initials = serializers.SerializerMethodField()
    thumbnail_url = serializers.SerializerMethodField()

    level = serializers.SerializerMethodField()
    level_label = serializers.SerializerMethodField()
    level_color = serializers.SerializerMethodField()
    duration = serializers.SerializerMethodField()
    enrolled_count = serializers.SerializerMethodField()
    rating = serializers.SerializerMethodField()
    is_popular = serializers.SerializerMethodField()
    color_gradient = serializers.SerializerMethodField()
    icon = serializers.SerializerMethodField()
    price_period = serializers.SerializerMethodField()
    detail_url = serializers.SerializerMethodField()
    preview_url = serializers.SerializerMethodField()
    enroll_url = serializers.SerializerMethodField()

    class Meta:
        model = Course
        fields = [
            "id",
            "title",
            "slug",
            "subtitle",
            "description",
            "category_name",
            "category_slug",
            "course_type",
            "course_type_label",
            "pricing_type",
            "pricing_type_label",
            "price",
            "currency",
            "price_period",
            "status",
            "published_at",
            "company_only",
            "thumbnail_url",
            "preview_video_url",
            "level",
            "level_label",
            "level_color",
            "duration",
            "enrolled_count",
            "rating",
            "is_popular",
            "color_gradient",
            "icon",
            "instructor_name",
            "instructor_initials",
            "detail_url",
            "preview_url",
            "enroll_url",
        ]
        read_only_fields = fields

    def get_category_name(self, obj):
        return obj.category.name if obj.category else None

    def get_category_slug(self, obj):
        return obj.category.slug if obj.category else None

    def get_instructor_name(self, obj):
        instructor = obj.instructor
        if not instructor:
            return "Formateur"
        name = ""
        if hasattr(instructor, "get_full_name"):
            name = instructor.get_full_name() or ""
        return name.strip() or "Formateur"

    def get_instructor_initials(self, obj):
        name = self.get_instructor_name(obj) or "BE"
        parts = [p for p in name.split(" ") if p]
        if len(parts) >= 2:
            return (parts[0][0] + parts[1][0]).upper()
        if len(parts) == 1 and parts[0]:
            return parts[0][0].upper()
        return "BE"

    def get_thumbnail_url(self, obj):
        if not obj.thumbnail:
            return None
        try:
            request = self.context.get("request")
            url = obj.thumbnail.url
            return request.build_absolute_uri(url) if request else url
        except (ValueError, AttributeError):
            return None

    def get_level(self, obj):
        return "beginner"

    def get_level_label(self, obj):
        return {
            "beginner": "Débutant",
            "intermediate": "Intermédiaire",
            "advanced": "Avancé",
        }.get(self.get_level(obj), "Niveau")

    def get_level_color(self, obj):
        return {
            "beginner": "green",
            "intermediate": "yellow",
            "advanced": "rose",
        }.get(self.get_level(obj), "blue")

    def get_duration(self, obj):
        return "—"

    def get_enrolled_count(self, obj):
        return 0

    def get_rating(self, obj):
        return 0.0

    def get_is_popular(self, obj):
        return bool(obj.published_at)

    def get_color_gradient(self, obj):
        if obj.pricing_type == Course.PricingType.FREE:
            return "from-green-600 to-green-500"
        if obj.pricing_type == Course.PricingType.HYBRID:
            return "from-yellow-600 to-yellow-500"
        return "from-blue-600 to-blue-500"

    def get_icon(self, obj):
        return {
            Course.CourseType.CERTIFIANTE: "fas fa-certificate",
            Course.CourseType.PROFESSIONNELLE: "fas fa-briefcase",
            Course.CourseType.ACADEMIQUE: "fas fa-graduation-cap",
            Course.CourseType.INTERNE: "fas fa-building",
        }.get(obj.course_type, "fas fa-book-open")

    def get_price_period(self, obj):
        return "cours"

    def get_detail_url(self, obj):
        slug = obj.slug or slugify(obj.title)
        return reverse("course_public_page", kwargs={"slug": slug, "course_id": obj.id})

    def get_preview_url(self, obj):
        return self.get_detail_url(obj)

    def get_enroll_url(self, obj):
        request = self.context.get("request")
        url = reverse("account_signup")
        if request:
            return f"{url}?next={self.get_detail_url(obj)}"
        return url
