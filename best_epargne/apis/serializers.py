from django.utils.timesince import timesince
from rest_framework import serializers
from catalog.models import Course, CourseSection, Lesson, Category, MediaAsset
from commerce.models import OrderItem


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "slug"]


class MediaAssetSerializer(serializers.ModelSerializer):
    class Meta:
        model = MediaAsset
        fields = ["id", "kind", "title", "object_key", "content_type", "size", "duration_seconds", "created_at"]


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

    def validate(self, attrs):
        # optionnel : auto-cohérence
        lt = attrs.get("lesson_type")
        if lt == "TEXT" and not attrs.get("content", ""):
            # pas obligatoire, mais conseillé
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


class CourseSerializer(serializers.ModelSerializer):
    category = CategorySerializer(read_only=True)

    thumbnail_url = serializers.SerializerMethodField()
    preview_media_asset = MediaAssetSerializer(read_only=True)
    preview_media_asset_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)

    instructor_name = serializers.CharField(source="instructor.full_name", read_only=True)

    # computed for instructor UI (comme tu as fait)
    sections_count = serializers.IntegerField(read_only=True)
    lessons_count = serializers.IntegerField(read_only=True)
    enrolled_count = serializers.IntegerField(read_only=True)
    rating_avg = serializers.FloatField(read_only=True)
    rating_count = serializers.IntegerField(read_only=True)
    completion_rate = serializers.IntegerField(read_only=True)

    updated_at_human = serializers.SerializerMethodField()

    def get_updated_at_human(self, obj):
        dt = getattr(obj, "updated_at", None)
        return f"il y a {timesince(dt)}" if dt else None

    def get_thumbnail_url(self, obj):
        req = self.context.get("request")
        if obj.thumbnail and hasattr(obj.thumbnail, "url"):
            return req.build_absolute_uri(obj.thumbnail.url) if req else obj.thumbnail.url
        return None

    class Meta:
        model = Course
        fields = [
            "id", "title", "slug", "subtitle", "description",
            "course_type", "pricing_type", "price", "currency",
            "status", "published_at",
            "thumbnail", "thumbnail_url",
            "preview_video_url", "preview_media_asset", "preview_media_asset_id",
            "company_only", "company",
            "category", "instructor", "instructor_name",
            "sections_count", "lessons_count", "enrolled_count",
            "rating_avg", "rating_count", "completion_rate",
            "updated_at_human",
        ]
        read_only_fields = ["status", "published_at", "instructor", "slug"]


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


class MediaUploadInitSerializer(serializers.Serializer):
    filename = serializers.CharField(max_length=255)
    content_type = serializers.CharField(max_length=120)
    size = serializers.IntegerField(min_value=1)
    kind = serializers.ChoiceField(choices=["video", "audio", "doc"])
    title = serializers.CharField(required=False, allow_blank=True, max_length=255)


class MediaUploadFinalizeBindSerializer(serializers.Serializer):
    course_id = serializers.IntegerField()
    section_id = serializers.IntegerField()
    lesson_id = serializers.IntegerField()


class MediaUploadFinalizeSerializer(serializers.Serializer):
    upload_id = serializers.CharField(max_length=64)  # id de tracking coté front
    object_key = serializers.CharField(max_length=1024)
    kind = serializers.ChoiceField(choices=["video", "audio", "doc"])
    title = serializers.CharField(required=False, allow_blank=True, max_length=255)

    content_type = serializers.CharField(max_length=120)
    size = serializers.IntegerField(min_value=1)
    duration_seconds = serializers.IntegerField(required=False, allow_null=True, min_value=0)

    # bind optionnel (recommandé)
    bind = MediaUploadFinalizeBindSerializer(required=False, allow_null=True)


class MediaAssetListSerializer(serializers.ModelSerializer):
    class Meta:
        model = MediaAsset
        fields = [
            "id",
            "kind",
            "title",
            "object_key",
            "content_type",
            "size",
            "duration_seconds",
            "created_at",
        ]
