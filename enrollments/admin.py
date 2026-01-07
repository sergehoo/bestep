from django.contrib import admin
from .models import Enrollment, LessonProgress


@admin.register(Enrollment)
class EnrollmentAdmin(admin.ModelAdmin):
    list_display = ("user", "course", "source", "company", "enrolled_at", "completed_at")
    list_filter = ("source", "company")
    search_fields = ("user__email", "user__full_name", "course__title")
    autocomplete_fields = ( "course", "company")


@admin.register(LessonProgress)
class LessonProgressAdmin(admin.ModelAdmin):
    list_display = ("enrollment", "lesson", "progress_percent", "completed", "updated_at")
    list_filter = ("completed", "lesson__lesson_type")
    search_fields = ("enrollment__user__email", "enrollment__course__title", "lesson__title")
    autocomplete_fields = ("enrollment", "lesson")
