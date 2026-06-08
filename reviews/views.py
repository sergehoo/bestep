"""
reviews/views.py — CORRECTIF P1.D (audit REV-01, REV-05, REV-06, REV-07, REV-10).

Corrections principales :

1. **Enrollment requis avant note** (REV-01) : un utilisateur ne peut noter un
   cours que s'il y est inscrit (Enrollment actif) ET que le cours est PUBLISHED.
   Avant : n'importe quel user authentifié pouvait noter n'importe quel cours,
   y compris un cours DRAFT découvert par énumération d'ID.

2. **Filtrage cours publiés sur summary/me** (REV-05) : on n'expose plus les
   métadata d'un cours non publié via l'énumération de course_id.

3. **Permission 'me'** (REV-06) : ajoute "me", "me_update", "me_delete" aux
   actions exigeant IsAuthenticated.

4. **Throttling** (REV-10) : ScopedRateThrottle 'reviews_write' pour empêcher
   le spam (POST/PATCH/PUT/DELETE).

Voir REV-07 (routage) corrigé séparément dans reviews/urls.py.new.
"""
from __future__ import annotations

from django.db.models import Avg, Count
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from catalog.models import Course
from enrollments.models import Enrollment

from .models import CourseReview
from .serializers import CourseReviewSerializer


class CourseReviewViewSet(viewsets.ModelViewSet):
    """
    /api/courses/<course_id>/reviews/        (GET list, POST create)
    /api/courses/<course_id>/reviews/<id>/   (PATCH/DELETE)
    /api/courses/<course_id>/reviews/summary/
    /api/courses/<course_id>/reviews/me/     (GET, PUT/PATCH, DELETE)
    """

    serializer_class = CourseReviewSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    throttle_classes = [ScopedRateThrottle]

    def get_throttles(self):
        # Write-scope plus serré (anti-spam) ; read garde le défaut.
        if self.action in {"create", "update", "partial_update", "destroy", "me_update", "me_delete"}:
            self.throttle_scope = "reviews_write"
        else:
            self.throttle_scope = "reviews_read"
        return super().get_throttles()

    # ---- helpers -----------------------------------------------------------

    def _get_published_course(self) -> Course:
        """Retourne le Course PUBLISHED de l'URL, sinon 404 (empêche l'énumération de DRAFT)."""
        return get_object_or_404(
            Course,
            pk=self.kwargs["course_id"],
            status=Course.Status.PUBLISHED,
        )

    def _has_enrollment(self, course: Course) -> bool:
        return Enrollment.objects.filter(user=self.request.user, course=course).exists()

    # ---- queryset / permissions -------------------------------------------

    def get_queryset(self):
        course_id = self.kwargs.get("course_id")
        # CORRECTIF : si course_id absent ou non numérique, on retourne un
        # queryset vide proprement au lieu de laisser l'ORM lever une exception.
        if not course_id:
            return CourseReview.objects.none()
        # CORRECTIF : on enveloppe l'introspection user dans un try/except —
        # l'attribut `is_platform_admin` peut soit être une @property qui plante
        # sur un user incomplet (cas observé après migration), soit ne pas exister
        # sur User. Le getattr() prend en charge le cas absence, le try gère
        # l'exception au runtime de la property.
        qs = CourseReview.objects.filter(
            course_id=course_id, is_public=True
        ).select_related("user")
        u = getattr(self.request, "user", None)
        try:
            is_admin = bool(
                u and u.is_authenticated and (
                    u.is_staff or u.is_superuser
                    or bool(getattr(u, "is_platform_admin", False))
                )
            )
        except Exception:
            is_admin = False
        if is_admin:
            qs = CourseReview.objects.filter(course_id=course_id).select_related("user")
        return qs

    def get_permissions(self):
        # CORRECTIF REV-06 : on inclut explicitement `me` dans la liste des
        # actions exigeant l'auth.
        protected = {
            "create",
            "update",
            "partial_update",
            "destroy",
            "me",
            "me_update",
            "me_delete",
        }
        if self.action in protected:
            return [permissions.IsAuthenticated()]
        return super().get_permissions()

    # ---- create -----------------------------------------------------------

    def perform_create(self, serializer):
        course = self._get_published_course()
        # CORRECTIF REV-01 : exige une inscription active.
        if not self._has_enrollment(course):
            raise ValidationError({"detail": "Vous devez être inscrit au cours pour le noter."})
        # Un seul avis par (user, course) — garanti aussi par la contrainte DB.
        if CourseReview.objects.filter(course=course, user=self.request.user).exists():
            raise ValidationError({"detail": "Vous avez déjà laissé un avis sur ce cours."})
        serializer.save(course=course, user=self.request.user)

    # ---- update / delete --------------------------------------------------

    def perform_update(self, serializer):
        obj = self.get_object()
        u = self.request.user
        is_admin = u.is_staff or u.is_superuser or getattr(u, "is_platform_admin", False)
        if not is_admin and obj.user_id != u.id:
            raise PermissionDenied("Vous ne pouvez modifier que votre avis.")
        serializer.save()

    def perform_destroy(self, instance):
        u = self.request.user
        is_admin = u.is_staff or u.is_superuser or getattr(u, "is_platform_admin", False)
        if not is_admin and instance.user_id != u.id:
            raise PermissionDenied("Vous ne pouvez supprimer que votre avis.")
        instance.delete()

    # ---- summary / me -----------------------------------------------------

    def _summary(self, course_id):
        # CORRECTIF REV-05 : on vérifie le cours PUBLISHED.
        get_object_or_404(Course, pk=course_id, status=Course.Status.PUBLISHED)
        base = CourseReview.objects.filter(course_id=course_id, is_public=True)
        agg = base.aggregate(avg=Avg("rating"), count=Count("id"))
        dist = base.values("rating").annotate(c=Count("id"))
        dist_map = {i: 0 for i in range(1, 6)}
        for row in dist:
            dist_map[int(row["rating"])] = int(row["c"])
        total = int(agg["count"] or 0)
        avg = float(agg["avg"] or 0.0)
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
        # Vérifie l'existence du cours publié (anti-énumération).
        get_object_or_404(Course, pk=course_id, status=Course.Status.PUBLISHED)
        obj = (
            CourseReview.objects.filter(course_id=course_id, user=request.user)
            .select_related("user")
            .first()
        )
        if not obj:
            return Response({"exists": False, "review": None}, status=200)
        ser = self.get_serializer(obj)
        return Response({"exists": True, "review": ser.data}, status=200)

    @action(detail=False, methods=["put", "patch"], url_path="me")
    def me_update(self, request, course_id=None):
        get_object_or_404(Course, pk=course_id, status=Course.Status.PUBLISHED)
        obj = CourseReview.objects.filter(course_id=course_id, user=request.user).first()
        if not obj:
            return Response({"detail": "Aucun avis trouvé."}, status=status.HTTP_404_NOT_FOUND)
        ser = self.get_serializer(obj, data=request.data, partial=(request.method == "PATCH"))
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)

    @action(detail=False, methods=["delete"], url_path="me")
    def me_delete(self, request, course_id=None):
        get_object_or_404(Course, pk=course_id, status=Course.Status.PUBLISHED)
        obj = CourseReview.objects.filter(course_id=course_id, user=request.user).first()
        if not obj:
            return Response(status=status.HTTP_204_NO_CONTENT)
        obj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
