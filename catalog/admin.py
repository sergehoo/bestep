from django.contrib import admin
from .models import Category, Course, CourseSection, Lesson


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "slug")
    search_fields = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}


class LessonInline(admin.TabularInline):
    model = Lesson
    extra = 0
    fields = ("order", "title", "lesson_type", "is_preview", "duration_sec", "video_url", "file")
    ordering = ("order",)


class CourseSectionInline(admin.TabularInline):
    model = CourseSection
    extra = 0
    fields = ("order", "title")
    ordering = ("order",)
    show_change_link = True


@admin.register(CourseSection)
class CourseSectionAdmin(admin.ModelAdmin):
    list_display = ("title", "course", "order")
    list_filter = ("course",)
    search_fields = ("title", "course__title")
    ordering = ("course", "order")
    inlines = [LessonInline]


@admin.register(Lesson)
class LessonAdmin(admin.ModelAdmin):
    list_display = ("title", "section", "lesson_type", "order", "is_preview", "duration_sec")
    list_filter = ("lesson_type", "is_preview")
    search_fields = ("title", "section__title", "section__course__title")
    ordering = ("section__course", "section__order", "order")


@admin.register(Course)
class CourseAdmin(admin.ModelAdmin):
    list_display = (
    "title", "instructor", "course_type", "pricing_type", "price", "currency", "status", "company_only", "company",
    "published_at")
    list_filter = ("status", "course_type", "pricing_type", "company_only", "currency", "category")
    search_fields = ("title", "subtitle", "description", "instructor__email", "instructor__full_name")
    readonly_fields = ("published_at", "created_at", "updated_at")
    prepopulated_fields = {"slug": ("title",)}
    inlines = [CourseSectionInline]
    actions = ("mark_review", "mark_published", "mark_archived")

    @admin.action(description="Mettre en validation")
    def mark_review(self, request, queryset):
        queryset.update(status=Course.Status.REVIEW)

    @admin.action(description="Publier")
    def mark_published(self, request, queryset):
        queryset.update(status=Course.Status.PUBLISHED)

    @admin.action(description="Archiver")
    def mark_archived(self, request, queryset):
        queryset.update(status=Course.Status.ARCHIVED)
