from django.contrib import admin
from django.utils.html import format_html
from import_export.admin import ImportExportModelAdmin

from .models import Attempt, AttemptAnswer, Choice, Question, Quiz
from .resources import ChoiceResource, QuestionResource, QuizResource


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
class QuizAdmin(ImportExportModelAdmin):
    resource_class = QuizResource
    list_display = (
        "title",
        "quiz_type",
        "is_active",
        "passing_score",
        "max_attempts",
    )
    list_filter = ("is_onboarding", "is_active")
    search_fields = ("title", "slug")
    prepopulated_fields = {"slug": ("title",)}
    inlines = [QuestionInline]

    fieldsets = (
        ("Informations générales", {
            "fields": ("title", "slug", "is_active")
        }),
        ("Type de quiz", {
            "fields": ("is_onboarding", "course", "lesson"),
            "description": "Un quiz onboarding ne doit pas être lié à un cours ou une leçon.",
        }),
        ("Règles", {
            "fields": ("passing_score", "max_attempts")
        }),
    )

    def quiz_type(self, obj):
        if obj.is_onboarding:
            return "Onboarding"
        if obj.course:
            return "Cours"
        return "Autre"

    quiz_type.short_description = "Type"


@admin.register(Question)
class QuestionAdmin(ImportExportModelAdmin):
    resource_class = QuestionResource
    list_display = ("quiz", "topic","short_prompt", "order")
    list_filter = ("quiz",)
    search_fields = ("prompt",)
    ordering = ("quiz", "order")
    inlines = [ChoiceInline]

    def short_prompt(self, obj):
        return obj.prompt[:80] + ("…" if len(obj.prompt) > 80 else "")

    short_prompt.short_description = "Question"

class AttemptAnswerInline(admin.TabularInline):
    model = AttemptAnswer
    extra = 0
    readonly_fields = ("question", "selected_choice")
    can_delete = False
@admin.register(Attempt)
class AttemptAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "quiz",
        "score_percent",
        "passed",
        "submitted_at",
    )
    list_filter = ("quiz", "passed")
    search_fields = ("user__email", "quiz__title")
    readonly_fields = (
        "user",
        "quiz",
        "started_at",
        "submitted_at",
        "score_percent",
        "passed",
    )
    inlines = [AttemptAnswerInline]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

@admin.register(AttemptAnswer)
class AttemptAnswerAdmin(admin.ModelAdmin):
    list_display = (
        "attempt_user",
        "question_text",
        "choice_text",
        "is_correct_badge",
    )
    search_fields = (
        "attempt__user__email",
        "question__prompt",
        "selected_choice__text",
    )
    readonly_fields = (
        "attempt",
        "question",
        "selected_choice",
    )

    list_select_related = (
        "attempt",
        "attempt__user",
        "question",
        "selected_choice",
    )

    def has_add_permission(self, request):
        return False

    # ===== Colonnes lisibles =====

    def attempt_user(self, obj):
        return obj.attempt.user.email
    attempt_user.short_description = "Utilisateur"

    def question_text(self, obj):
        return obj.question.prompt
    question_text.short_description = "Question"

    def choice_text(self, obj):
        if not obj.selected_choice:
            return "—"
        return obj.selected_choice.text
    choice_text.short_description = "Réponse choisie"

    def is_correct_badge(self, obj):
        if not obj.selected_choice:
            return "—"
        if obj.selected_choice.is_correct:
            return format_html(
                '<span style="color:#16a34a;font-weight:600;">✔ Correct</span>'
            )
        return format_html(
            '<span style="color:#dc2626;font-weight:600;">✖ Faux</span>'
        )
    is_correct_badge.short_description = "Correct ?"
