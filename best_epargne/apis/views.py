from rest_framework.viewsets import ModelViewSet, ReadOnlyModelViewSet
from rest_framework.permissions import IsAuthenticatedOrReadOnly, IsAuthenticated
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Q

from apps.catalog.models import Course, Category
from .serializers import CourseSerializer, CategorySerializer
from apps.accounts.api.permissions import IsInstructor

class CategoryViewSet(ReadOnlyModelViewSet):
    queryset = Category.objects.all().order_by("name")
    serializer_class = CategorySerializer

class CourseViewSet(ModelViewSet):
    serializer_class = CourseSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        qs = Course.objects.select_related("category", "instructor").prefetch_related("sections__lessons")
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            # public: seulement cours publiés (hors internes)
            if not self.request.user.is_authenticated or self.request.user.role != "SUPERADMIN":
                qs = qs.filter(status=Course.Status.PUBLISHED, company_only=False)

        q = self.request.query_params.get("q")
        if q:
            qs = qs.filter(Q(title__icontains=q) | Q(subtitle__icontains=q) | Q(description__icontains=q))
        return qs.order_by("-published_at", "-created_at")

    def perform_create(self, serializer):
        # formateur crée son cours
        serializer.save(instructor=self.request.user)

    @action(detail=False, methods=["get"], permission_classes=[IsAuthenticated, IsInstructor])
    def my_courses(self, request):
        qs = Course.objects.filter(instructor=request.user).order_by("-created_at")
        return Response(CourseSerializer(qs, many=True, context={"request": request}).data)