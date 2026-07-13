"""best_epargne/apis/api_ai_course_gen.py — Phase 2 : générateur de cours IA.

Endpoints :

    POST   /api/ai/course-generations/                Créer (étape 1 : brief)
    GET    /api/ai/course-generations/                Liste des générations de l'user
    GET    /api/ai/course-generations/<id>/           Détail (état complet)
    PATCH  /api/ai/course-generations/<id>/           Édition manuelle du plan/brief
    DELETE /api/ai/course-generations/<id>/           Supprime la génération
    POST   /api/ai/course-generations/<id>/plan/      (Re-)génère le plan
    POST   /api/ai/course-generations/<id>/lesson/    Génère UNE leçon (section_idx + lesson_idx)
    POST   /api/ai/course-generations/<id>/quiz/      Génère un quiz (section_idx)
    POST   /api/ai/course-generations/<id>/certification/  Recommande la certification
    POST   /api/ai/course-generations/<id>/finalize/  Crée le Course + sections + leçons

Sécurité :
    - IsAuthenticated + is_instructor OR is_platform_admin
    - Une génération n'est visible que par son propriétaire (ou admin).
    - Le cours créé à la finalisation reste en DRAFT (aucune publication auto).
"""
from __future__ import annotations

from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ai.course_gen import (
    finalize_generation,
    generate_lesson_content,
    generate_plan,
    generate_section_quiz,
    recommend_certification,
)
from ai.models import AIAuditLog, AICourseGeneration


# ─────────────────────────────────────────────────────────────
# Permissions & helpers
# ─────────────────────────────────────────────────────────────


def _user_can_generate(user) -> bool:
    """Instructor ou platform_admin."""
    if not user or not user.is_authenticated:
        return False
    return bool(
        getattr(user, "is_instructor", False)
        or getattr(user, "is_platform_admin", False)
    )


def _forbidden(user=None):
    # SECURITE-05 — expose un ``code`` stable. Si l'utilisateur est déjà
    # vérifié mais n'est pas formateur, on émet ROLE_FORBIDDEN pour être
    # explicite (le frontend n'a pas besoin de rediriger, juste d'afficher).
    from ai.http import forbidden_for
    if user is not None and getattr(user, "is_email_verified", True):
        return Response(
            {
                "detail": "Réservé aux formateurs et administrateurs plateforme.",
                "code": "ROLE_FORBIDDEN",
            },
            status=status.HTTP_403_FORBIDDEN,
        )
    return forbidden_for(user)


def _client_ip(request):
    x = request.META.get("HTTP_X_FORWARDED_FOR")
    if x:
        return x.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


# ─────────────────────────────────────────────────────────────
# Serializers
# ─────────────────────────────────────────────────────────────


class BriefSerializer(serializers.Serializer):
    """Étape 1 : brief. Champs volontairement souples pour laisser
    l'utilisateur écrire librement."""

    topic = serializers.CharField(max_length=280)
    audience = serializers.CharField(max_length=140, required=False, allow_blank=True)
    level = serializers.ChoiceField(
        choices=["BEGINNER", "INTERMEDIATE", "ADVANCED"],
        required=False,
        default="BEGINNER",
    )
    language = serializers.CharField(max_length=10, required=False, default="fr")
    duration_hours = serializers.IntegerField(min_value=1, max_value=100, required=False, default=4)
    style = serializers.CharField(max_length=80, required=False, allow_blank=True)
    depth = serializers.CharField(max_length=80, required=False, allow_blank=True)
    with_certificate = serializers.BooleanField(required=False, default=True)
    extra_instructions = serializers.CharField(
        required=False, allow_blank=True, max_length=2000
    )


class GenerationSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = AICourseGeneration
        fields = [
            "id",
            "status",
            "brief",
            "finalized_course_id",
            "finalized_at",
            "created_at",
            "updated_at",
        ]


class GenerationDetailSerializer(GenerationSummarySerializer):
    class Meta(GenerationSummarySerializer.Meta):
        fields = GenerationSummarySerializer.Meta.fields + [
            "plan",
            "lessons_content",
            "quizzes",
            "certification",
            "error_detail",
        ]


class LessonContentInput(serializers.Serializer):
    section_idx = serializers.IntegerField(min_value=0)
    lesson_idx = serializers.IntegerField(min_value=0)


class QuizInput(serializers.Serializer):
    section_idx = serializers.IntegerField(min_value=0)


class PlanPatchInput(serializers.Serializer):
    """Le front peut envoyer un plan manuel après édition."""

    plan = serializers.JSONField()


# ─────────────────────────────────────────────────────────────
# Views
# ─────────────────────────────────────────────────────────────


class AICourseGenerationListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Liste des générations de cours IA de l'utilisateur")
    def get(self, request):
        if not _user_can_generate(request.user):
            return _forbidden(request.user)
        qs = AICourseGeneration.objects.filter(user=request.user).order_by(
            "-updated_at", "-id"
        )
        paginator = PageNumberPagination()
        paginator.page_size = 20
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response(
            GenerationSummarySerializer(page, many=True).data
        )

    @extend_schema(
        summary="Créer une génération de cours (étape 1)",
        request=BriefSerializer,
        responses=GenerationDetailSerializer,
    )
    def post(self, request):
        if not _user_can_generate(request.user):
            return _forbidden(request.user)
        s = BriefSerializer(data=request.data)
        s.is_valid(raise_exception=True)

        gen = AICourseGeneration.objects.create(
            user=request.user,
            brief=dict(s.validated_data),
            status=AICourseGeneration.Status.DRAFT,
        )
        AIAuditLog.objects.create(
            user=request.user,
            organization_id=gen.organization_id,
            kind=AIAuditLog.Kind.COURSE_GEN_START,
            payload={"generation_id": gen.id, "brief": gen.brief},
            ip=_client_ip(request),
        )
        return Response(GenerationDetailSerializer(gen).data, status=201)


class AICourseGenerationDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get(self, request, generation_id):
        if not _user_can_generate(request.user):
            return None, _forbidden()
        try:
            gen = AICourseGeneration.objects.get(pk=generation_id)
        except AICourseGeneration.DoesNotExist:
            return None, Response({"detail": "Introuvable."}, status=404)
        if gen.user_id != request.user.id and not getattr(
            request.user, "is_platform_admin", False
        ):
            return None, _forbidden()
        return gen, None

    def get(self, request, generation_id: int):
        gen, err = self._get(request, generation_id)
        if err:
            return err
        return Response(GenerationDetailSerializer(gen).data)

    def patch(self, request, generation_id: int):
        gen, err = self._get(request, generation_id)
        if err:
            return err
        # Whitelist stricte : brief ou plan uniquement (édition manuelle)
        allowed = {"brief", "plan", "certification"}
        touched = False
        for key, val in (request.data or {}).items():
            if key in allowed and isinstance(val, dict):
                setattr(gen, key, val)
                touched = True
        if touched:
            gen.save()
        return Response(GenerationDetailSerializer(gen).data)

    def delete(self, request, generation_id: int):
        gen, err = self._get(request, generation_id)
        if err:
            return err
        gen.delete()
        return Response(status=204)


class _StepMixin(APIView):
    permission_classes = [IsAuthenticated]

    def _get(self, request, generation_id):
        if not _user_can_generate(request.user):
            return None, _forbidden()
        try:
            gen = AICourseGeneration.objects.get(pk=generation_id, user=request.user)
        except AICourseGeneration.DoesNotExist:
            return None, Response({"detail": "Introuvable."}, status=404)
        return gen, None

    def _audit(self, gen, request, payload):
        AIAuditLog.objects.create(
            user=request.user,
            organization_id=gen.organization_id,
            kind=AIAuditLog.Kind.COURSE_GEN_STEP,
            payload=payload,
            ip=_client_ip(request),
        )


class AICourseGenerationPlanView(_StepMixin):
    @extend_schema(summary="Générer / régénérer le plan de cours (étape 2)")
    def post(self, request, generation_id: int):
        gen, err = self._get(request, generation_id)
        if err:
            return err
        try:
            plan = generate_plan(gen)
        except Exception as exc:  # noqa: BLE001
            gen.status = AICourseGeneration.Status.FAILED
            gen.error_detail = str(exc)[:500]
            gen.save(update_fields=["status", "error_detail", "updated_at"])
            return Response({"detail": "Échec génération plan.", "error": str(exc)}, status=502)

        gen.plan = plan
        gen.status = AICourseGeneration.Status.PLAN_READY
        gen.error_detail = ""
        gen.save(update_fields=["plan", "status", "error_detail", "updated_at"])
        self._audit(gen, request, {"generation_id": gen.id, "step": "plan"})
        return Response(GenerationDetailSerializer(gen).data)


class AICourseGenerationLessonView(_StepMixin):
    @extend_schema(
        summary="Générer le contenu d'une leçon (étape 3)",
        request=LessonContentInput,
    )
    def post(self, request, generation_id: int):
        gen, err = self._get(request, generation_id)
        if err:
            return err
        s = LessonContentInput(data=request.data)
        s.is_valid(raise_exception=True)
        section_idx = s.validated_data["section_idx"]
        lesson_idx = s.validated_data["lesson_idx"]

        try:
            content = generate_lesson_content(gen, section_idx, lesson_idx)
        except IndexError as exc:
            return Response({"detail": str(exc)}, status=400)
        except Exception as exc:  # noqa: BLE001
            return Response({"detail": "Échec.", "error": str(exc)}, status=502)

        # Range dans lessons_content["lessons"]["<s>-<l>"]
        data = gen.lessons_content or {}
        lessons_map = data.get("lessons") or {}
        lessons_map[f"{section_idx}-{lesson_idx}"] = content
        data["lessons"] = lessons_map
        gen.lessons_content = data
        if gen.status in (
            AICourseGeneration.Status.PLAN_READY,
            AICourseGeneration.Status.DRAFT,
        ):
            gen.status = AICourseGeneration.Status.CONTENT_READY
        gen.save(update_fields=["lessons_content", "status", "updated_at"])
        self._audit(
            gen,
            request,
            {
                "generation_id": gen.id,
                "step": "lesson_content",
                "section_idx": section_idx,
                "lesson_idx": lesson_idx,
            },
        )
        return Response(GenerationDetailSerializer(gen).data)


class AICourseGenerationQuizView(_StepMixin):
    @extend_schema(
        summary="Générer un quiz pour une section (étape 4)",
        request=QuizInput,
    )
    def post(self, request, generation_id: int):
        gen, err = self._get(request, generation_id)
        if err:
            return err
        s = QuizInput(data=request.data)
        s.is_valid(raise_exception=True)
        section_idx = s.validated_data["section_idx"]

        try:
            quiz = generate_section_quiz(gen, section_idx)
        except IndexError as exc:
            return Response({"detail": str(exc)}, status=400)
        except Exception as exc:  # noqa: BLE001
            return Response({"detail": "Échec.", "error": str(exc)}, status=502)

        data = gen.quizzes or {}
        quizzes_map = data.get("quizzes") or {}
        quizzes_map[str(section_idx)] = quiz
        data["quizzes"] = quizzes_map
        gen.quizzes = data
        gen.status = AICourseGeneration.Status.QUIZ_READY
        gen.save(update_fields=["quizzes", "status", "updated_at"])
        self._audit(
            gen,
            request,
            {
                "generation_id": gen.id,
                "step": "quiz",
                "section_idx": section_idx,
            },
        )
        return Response(GenerationDetailSerializer(gen).data)


class AICourseGenerationCertificationView(_StepMixin):
    @extend_schema(summary="Recommandation de certification (étape 5)")
    def post(self, request, generation_id: int):
        gen, err = self._get(request, generation_id)
        if err:
            return err
        try:
            reco = recommend_certification(gen)
        except Exception as exc:  # noqa: BLE001
            return Response({"detail": "Échec.", "error": str(exc)}, status=502)
        gen.certification = reco
        gen.save(update_fields=["certification", "updated_at"])
        self._audit(gen, request, {"generation_id": gen.id, "step": "certification"})
        return Response(GenerationDetailSerializer(gen).data)


class AICourseGenerationFinalizeView(_StepMixin):
    @extend_schema(
        summary="Finaliser : créer le Course + Sections + Leçons (étape 6). "
                "Le cours reste en DRAFT — la publication humaine est obligatoire.",
    )
    def post(self, request, generation_id: int):
        gen, err = self._get(request, generation_id)
        if err:
            return err
        if gen.status == AICourseGeneration.Status.FINALIZED:
            return Response(
                {"detail": "Cette génération est déjà finalisée."},
                status=400,
            )
        if not (gen.plan or {}).get("sections"):
            return Response(
                {"detail": "Générez d'abord un plan avant de finaliser."},
                status=400,
            )
        try:
            course_id = finalize_generation(gen)
        except Exception as exc:  # noqa: BLE001
            return Response(
                {"detail": "Échec finalisation.", "error": str(exc)},
                status=500,
            )
        return Response(
            {
                "detail": "Cours créé en brouillon.",
                "course_id": course_id,
                "generation": GenerationDetailSerializer(gen).data,
            }
        )
