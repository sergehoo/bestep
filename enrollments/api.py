from rest_framework import serializers
from rest_framework.viewsets import ModelViewSet
from rest_framework.permissions import IsAuthenticated
from enrollments.models import Enrollment, LessonProgress
from catalog.models import Course, Lesson

class EnrollmentSerializer(serializers.ModelSerializer):
    course_title = serializers.CharField(source="course.title", read_only=True)
    class Meta:
        model = Enrollment
        fields = ["id","course","course_title","source","company","enrolled_at","completed_at"]

class LessonProgressSerializer(serializers.ModelSerializer):
    class Meta:
        model = LessonProgress
        fields = ["id","enrollment","lesson","progress_percent","last_position_sec","completed","updated_at"]

class EnrollmentViewSet(ModelViewSet):
    serializer_class = EnrollmentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Enrollment.objects.filter(user=self.request.user).select_related("course","company").order_by("-enrolled_at")

class LessonProgressViewSet(ModelViewSet):
    serializer_class = LessonProgressSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return LessonProgress.objects.filter(enrollment__user=self.request.user).select_related("enrollment","lesson")