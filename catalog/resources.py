"""catalog.resources — Resources django-import-export pour catalog.

Import/export du catalogue : catégories, cours, sections, leçons.
Format supporté : CSV, XLSX, JSON.
"""
from __future__ import annotations

from import_export import fields, resources
from import_export.widgets import ForeignKeyWidget

from .models import Category, Course, CourseSection, Lesson


class CategoryResource(resources.ModelResource):
    class Meta:
        model = Category
        fields = ("id", "name", "slug", "description", "icon", "color")
        export_order = fields
        import_id_fields = ("slug",)


class CourseResource(resources.ModelResource):
    category = fields.Field(
        column_name="category",
        attribute="category",
        widget=ForeignKeyWidget(Category, field="name"),
    )
    instructor = fields.Field(
        column_name="instructor_email",
        attribute="instructor",
        widget=ForeignKeyWidget(
            "compte.User", field="email"
        ),
    )

    class Meta:
        model = Course
        fields = (
            "id", "title", "slug", "subtitle", "description",
            "instructor", "category",
            "course_type", "pricing_type", "price", "currency",
            "status", "level", "language",
            "company_only", "published_at",
        )
        export_order = fields
        import_id_fields = ("slug",)


class CourseSectionResource(resources.ModelResource):
    course = fields.Field(
        column_name="course_slug",
        attribute="course",
        widget=ForeignKeyWidget(Course, field="slug"),
    )

    class Meta:
        model = CourseSection
        fields = ("id", "course", "title", "order")
        export_order = fields


class LessonResource(resources.ModelResource):
    section = fields.Field(
        column_name="section_title",
        attribute="section",
        widget=ForeignKeyWidget(CourseSection, field="title"),
    )

    class Meta:
        model = Lesson
        fields = (
            "id", "section", "title", "order",
            "lesson_type", "is_preview", "duration_sec",
            "video_url",
        )
        export_order = fields
