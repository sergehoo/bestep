from django.shortcuts import render

# Create your views here.
from django.views.generic import ListView, DetailView
from django.db.models import Q, Avg, Count
from .models import Course

class CourseListView(ListView):
    template_name = "catalog/course_list.html"
    model = Course
    context_object_name = "courses"
    paginate_by = 18

    def get_queryset(self):
        qs = Course.objects.filter(status=Course.Status.PUBLISHED, company_only=False)\
            .select_related("category", "instructor")\
            .annotate(avg_rating=Avg("reviews__rating"), reviews_count=Count("reviews"))
        q = self.request.GET.get("q")
        cat = self.request.GET.get("cat")
        ctype = self.request.GET.get("type")
        price = self.request.GET.get("price")  # free/paid/hybrid

        if q:
            qs = qs.filter(Q(title__icontains=q) | Q(subtitle__icontains=q) | Q(description__icontains=q))
        if cat:
            qs = qs.filter(category__slug=cat)
        if ctype:
            qs = qs.filter(course_type=ctype)
        if price:
            qs = qs.filter(pricing_type=price.upper())
        return qs.order_by("-published_at")

class CourseDetailView(DetailView):
    template_name = "catalog/course_detail.html"
    model = Course
    slug_field = "slug"
    slug_url_kwarg = "slug"

    def get_queryset(self):
        return Course.objects.select_related("category", "instructor")\
            .prefetch_related("sections__lessons", "reviews")