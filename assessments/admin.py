from django.contrib import admin

from django.contrib import admin
from .models import Quiz, Question, Choice, Attempt, AttemptAnswer


class ChoiceInline(admin.TabularInline):
    model = Choice
    extra = 0
    fields = ("text", "is_correct")


class QuestionInline(admin.TabularInline):
    model = Question
    extra = 0
    fields = ("order", "prompt")
    show_change_link = True
    ordering = ("order",)


@admin.register(Quiz)
class QuizAdmin(admin.ModelAdmin):
    list_display = ("title", "course", "passing_score", "max_attempts")
    search_fields = ("title", "course__title")
    list_filter = ("course",)
    inlines = [QuestionInline]


@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ("quiz", "order")
    list_filter = ("quiz",)
    inlines = [ChoiceInline]


@admin.register(Attempt)
class AttemptAdmin(admin.ModelAdmin):
    list_display = ("quiz", "user", "score_percent", "passed", "started_at", "submitted_at")
    list_filter = ("passed", "quiz")
    search_fields = ("user__email", "quiz__title", "quiz__course__title")


@admin.register(AttemptAnswer)
class AttemptAnswerAdmin(admin.ModelAdmin):
    list_display = ("attempt", "question", "selected_choice")
