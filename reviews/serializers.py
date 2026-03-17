from rest_framework import serializers

from reviews.models import CourseReview


class CourseReviewSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()
    is_mine = serializers.SerializerMethodField()

    class Meta:
        model = CourseReview
        fields = [
            "id", "course", "rating", "comment",
            "user_name", "is_mine",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "course", "user_name", "is_mine", "created_at", "updated_at"]

    def get_user_name(self, obj):
        u = obj.user
        return getattr(u, "get_full_name", lambda: "")() or getattr(u, "username", "Apprenant")

    def get_is_mine(self, obj):
        req = self.context.get("request")
        return bool(req and req.user.is_authenticated and obj.user_id == req.user.id)

    def validate_rating(self, value):
        if value < 1 or value > 5:
            raise serializers.ValidationError("La note doit être comprise entre 1 et 5.")
        return value
