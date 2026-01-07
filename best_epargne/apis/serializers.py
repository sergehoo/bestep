from rest_framework import serializers
from apps.catalog.models import Course, CourseSection, Lesson, Category

class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "slug"]

class LessonSerializer(serializers.ModelSerializer):
    class Meta:
        model = Lesson
        fields = ["id", "title", "order", "lesson_type", "is_preview", "duration_sec", "video_url", "content", "file"]

class CourseSectionSerializer(serializers.ModelSerializer):
    lessons = LessonSerializer(many=True, read_only=True)
    class Meta:
        model = CourseSection
        fields = ["id", "title", "order", "lessons"]

class CourseSerializer(serializers.ModelSerializer):
    category = CategorySerializer(read_only=True)
    sections = CourseSectionSerializer(many=True, read_only=True)
    instructor_name = serializers.CharField(source="instructor.full_name", read_only=True)

    class Meta:
        model = Course
        fields = [
            "id","title","slug","subtitle","description",
            "course_type","pricing_type","price","currency",
            "status","published_at","thumbnail",
            "company_only","company",
            "category","instructor","instructor_name",
            "sections",
        ]
        read_only_fields = ["status","published_at"]