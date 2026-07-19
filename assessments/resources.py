"""assessments.resources — Resources django-import-export pour les quiz."""
from __future__ import annotations

from import_export import fields, resources
from import_export.widgets import ForeignKeyWidget

from catalog.models import Course, CourseSection, Lesson

from .models import Choice, Question, Quiz


class QuizResource(resources.ModelResource):
    course = fields.Field(
        column_name="course_slug",
        attribute="course",
        widget=ForeignKeyWidget(Course, field="slug"),
    )
    section = fields.Field(
        column_name="section_id",
        attribute="section",
        widget=ForeignKeyWidget(CourseSection, field="id"),
    )
    lesson = fields.Field(
        column_name="lesson_id",
        attribute="lesson",
        widget=ForeignKeyWidget(Lesson, field="id"),
    )

    class Meta:
        model = Quiz
        fields = (
            "id", "title", "slug",
            "course", "section", "lesson",
            "is_onboarding", "is_active", "is_final",
            "passing_score", "max_attempts",
        )
        export_order = fields
        import_id_fields = ("slug",)


class QuestionResource(resources.ModelResource):
    quiz = fields.Field(
        column_name="quiz_slug",
        attribute="quiz",
        widget=ForeignKeyWidget(Quiz, field="slug"),
    )

    class Meta:
        model = Question
        fields = ("id", "quiz", "prompt", "topic", "order")
        export_order = fields


class ChoiceResource(resources.ModelResource):
    question = fields.Field(
        column_name="question_id",
        attribute="question",
        widget=ForeignKeyWidget(Question, field="id"),
    )

    class Meta:
        model = Choice
        fields = ("id", "question", "text", "is_correct")
        export_order = fields
