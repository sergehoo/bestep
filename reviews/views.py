
# apps/courses/api/views.py
from django.db.models import Count, Avg
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import CourseReview
from .serializers import CourseReviewSerializer

class CourseReviewViewSet(viewsets.ModelViewSet):
    """
    /api/courses/<course_id>/reviews/  (GET list, POST create)
    /api/courses/<course_id>/reviews/<id>/ (PATCH/DELETE)
    + /api/courses/<course_id>/reviews/summary/ (GET)
    + /api/courses/<course_id>/reviews/me/ (GET, PUT/PATCH, DELETE)
    """
    serializer_class = CourseReviewSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        course_id = self.kwargs["course_id"]
        qs = CourseReview.objects.filter(course_id=course_id, is_public=True).select_related("user")
        # si admin/modérateur → voir tout
        u = self.request.user
        if u.is_authenticated and (u.is_staff or u.is_superuser):
            qs = CourseReview.objects.filter(course_id=course_id).select_related("user")
        return qs

    def perform_create(self, serializer):
        course_id = self.kwargs["course_id"]
        # un seul avis par utilisateur/cours
        if CourseReview.objects.filter(course_id=course_id, user=self.request.user).exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"detail": "Vous avez déjà laissé un avis sur ce cours."})
        serializer.save(course_id=course_id, user=self.request.user)

    def get_permissions(self):
        if self.action in ["update", "partial_update", "destroy", "create", "me_update", "me_delete"]:
            return [permissions.IsAuthenticated()]
        return super().get_permissions()

    def _summary(self, course_id):
        base = CourseReview.objects.filter(course_id=course_id, is_public=True)
        agg = base.aggregate(avg=Avg("rating"), count=Count("id"))
        dist = base.values("rating").annotate(c=Count("id"))
        dist_map = {i: 0 for i in range(1, 6)}
        for row in dist:
            dist_map[int(row["rating"])] = int(row["c"])

        total = int(agg["count"] or 0)
        avg = float(agg["avg"] or 0.0)

        # pourcentages
        dist_pct = {k: (round((v / total) * 100) if total else 0) for k, v in dist_map.items()}

        return {
            "avg": round(avg, 2) if total else None,
            "count": total,
            "dist_counts": dist_map,
            "dist_pct": dist_pct,
        }

    @action(detail=False, methods=["get"])
    def summary(self, request, course_id=None):
        return Response(self._summary(course_id))

    @action(detail=False, methods=["get"], url_path="me")
    def me(self, request, course_id=None):
        obj = CourseReview.objects.filter(course_id=course_id, user=request.user).select_related("user").first()
        if not obj:
            return Response({"exists": False, "review": None}, status=200)
        ser = self.get_serializer(obj)
        return Response({"exists": True, "review": ser.data}, status=200)

    @action(detail=False, methods=["put", "patch"], url_path="me")
    def me_update(self, request, course_id=None):
        obj = CourseReview.objects.filter(course_id=course_id, user=request.user).first()
        if not obj:
            return Response({"detail": "Aucun avis trouvé."}, status=404)
        ser = self.get_serializer(obj, data=request.data, partial=(request.method == "PATCH"))
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)

    @action(detail=False, methods=["delete"], url_path="me")
    def me_delete(self, request, course_id=None):
        obj = CourseReview.objects.filter(course_id=course_id, user=request.user).first()
        if not obj:
            return Response(status=204)
        obj.delete()
        return Response(status=204)

    def perform_update(self, serializer):
        # sécurité : l’auteur ou admin
        obj = self.get_object()
        u = self.request.user
        if not (u.is_staff or u.is_superuser) and obj.user_id != u.id:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Vous ne pouvez modifier que votre avis.")
        serializer.save()

    def perform_destroy(self, instance):
        u = self.request.user
        if not (u.is_staff or u.is_superuser) and instance.user_id != u.id:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Vous ne pouvez supprimer que votre avis.")
        instance.delete()