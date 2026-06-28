"""
enrollments/api.py — CORRECTIF P1.A (audit ENROLL-03, ENROLL-04, API-04).

Avant : EnrollmentViewSet / LessonProgressViewSet étaient des ModelViewSet complets
permettant à tout utilisateur authentifié de :
  - s'auto-inscrire à un cours payant via POST (frais contournés),
  - marquer une inscription COMPLETED → déclencher un certificat frauduleux,
  - écrire des LessonProgress sur l'enrollment d'autrui (IDOR).

Après :
  - EnrollmentViewSet : LECTURE SEULE (list + retrieve). L'inscription doit
    transiter par le service de checkout commerce (paiement) ou par
    l'assignation org. Pas de POST/PUT/PATCH/DELETE depuis le client.
  - LessonProgressViewSet : list/retrieve/partial_update uniquement, avec
    validate_enrollment qui vérifie l'appartenance au user authentifié.
    `enrollment` et `lesson` sont read_only sur l'update (on n'autorise
    que la mise à jour de progress_percent / last_position_sec / completed).
  - read_only_fields exhaustifs sur les deux serializers.

L'audit complet justifie ce verrouillage : voir
``audit_best_epargne_2026.docx``, findings ENROLL-03, ENROLL-04, API-04.
"""
from __future__ import annotations

from rest_framework import mixins, serializers, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle

from enrollments.models import Enrollment, LessonProgress


class EnrollmentSerializer(serializers.ModelSerializer):
    course_title = serializers.CharField(source="course.title", read_only=True)
    course_slug = serializers.CharField(source="course.slug", read_only=True)

    class Meta:
        model = Enrollment
        fields = [
            "id",
            "course",
            "course_title",
            "course_slug",
            "source",
            "company",
            "status",
            "progress_percent",
            "enrolled_at",
            "completed_at",
            "updated_at",
        ]
        # SÉCURITÉ : tous les champs sont read-only depuis l'API. La création
        # d'enrollment ne passe JAMAIS par cette vue — elle est faite par :
        #   - commerce.services.enroll_on_payment_success (paiement)
        #   - organizations.views.OrganizationCourseAssignLearnersView (B2B)
        read_only_fields = [
            "id",
            "course",
            "course_title",
            "course_slug",
            "source",
            "company",
            "status",
            "progress_percent",
            "enrolled_at",
            "completed_at",
            "updated_at",
        ]


class LessonProgressSerializer(serializers.ModelSerializer):
    class Meta:
        model = LessonProgress
        fields = [
            "id",
            "enrollment",
            "lesson",
            "progress_percent",
            "last_position_sec",
            "completed",
            "updated_at",
        ]
        # `enrollment` et `lesson` sont en read_only pour les actions d'update :
        # on ne tolère que la progression. La création est gérée par
        # ``ensure_lesson_progress`` dans apis/views.py (LearnerLessonProgressUpdateView).
        read_only_fields = ["id", "enrollment", "lesson", "updated_at"]

    def validate_progress_percent(self, value):
        if not (0 <= value <= 100):
            raise ValidationError("progress_percent doit être entre 0 et 100.")
        return value

    def validate_last_position_sec(self, value):
        if value < 0:
            raise ValidationError("last_position_sec ne peut pas être négatif.")
        # Garde-fou : aucune leçon raisonnable > 24 h.
        if value > 60 * 60 * 24:
            raise ValidationError("last_position_sec trop grand.")
        return value


class EnrollmentViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """LECTURE SEULE — l'inscription se fait via paiement ou assignation org."""

    queryset = Enrollment.objects.none()
    serializer_class = EnrollmentSerializer
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "enrollments_read"

    def get_queryset(self):
        return (
            Enrollment.objects.filter(user=self.request.user)
            .select_related("course", "company")
            .order_by("-enrolled_at")
        )


class LessonProgressViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,  # PATCH/PUT uniquement, pas de POST/DELETE
    viewsets.GenericViewSet,
):
    """Progression : lecture + mise à jour partielle de soi-même."""

    queryset = LessonProgress.objects.none()
    serializer_class = LessonProgressSerializer
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "progress_write"
    # Limiter aux verbes GET/PATCH (refuser PUT complet qui réécrirait l'objet).
    http_method_names = ["get", "patch", "head", "options"]

    def get_queryset(self):
        return (
            LessonProgress.objects.filter(enrollment__user=self.request.user)
            .select_related("enrollment", "lesson")
        )

    def perform_update(self, serializer):
        """Garde-fou supplémentaire : l'objet appartient bien au user.

        Le ``get_queryset`` filtre déjà, donc l'instance fetched est sûre.
        On garde ce hook pour journaliser et auto-marquer ``completed`` à 100 %.
        """
        instance: LessonProgress = serializer.instance
        # Le queryset garantit instance.enrollment.user_id == request.user.id.
        if instance.enrollment.user_id != self.request.user.id:  # pragma: no cover
            raise ValidationError("Accès refusé.")
        new_obj: LessonProgress = serializer.save()
        if new_obj.progress_percent >= 100 and not new_obj.completed:
            new_obj.mark_completed()
