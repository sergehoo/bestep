"""best_epargne/apis/api_ai_p3.py — endpoints AI Phase 3.

    POST /api/ai/text-transform/               Actions IA sur texte
    GET  /api/ai/text-transform/actions/       Liste des actions disponibles
    GET  /api/ai/recommendations/              Recommandations groupées par catégorie
    POST /api/ai/recommendations/feedback/     Feedback sur une reco
"""
from __future__ import annotations

from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ai.models import AIAuditLog, AIRecommendation
from ai.permissions import user_can_use_assistant
from ai.recommendations import (
    generate_recommendations,
    submit_feedback,
)
from ai.text_transform import ACTIONS, transform_text


def _client_ip(request):
    x = request.META.get("HTTP_X_FORWARDED_FOR")
    if x:
        return x.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def _forbidden(user=None):
    # SECURITE-05 — délègue à ai.http.forbidden_for
    from ai.http import forbidden_for
    return forbidden_for(user)


# ─────────────────────────────────────────────────────────────
# Text transform
# ─────────────────────────────────────────────────────────────


class TextTransformInput(serializers.Serializer):
    action = serializers.ChoiceField(choices=list(ACTIONS.keys()))
    text = serializers.CharField(max_length=20_000)
    context = serializers.JSONField(required=False, default=dict)
    target_language = serializers.CharField(
        required=False, allow_blank=True, max_length=20
    )


class TextTransformView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        summary="Transformer un texte via l'IA (12 actions)",
        request=TextTransformInput,
    )
    def post(self, request):
        if not user_can_use_assistant(request.user):
            return _forbidden(request.user)
        # Seuls les créateurs de contenu peuvent transformer (instructor/admin).
        if not (
            getattr(request.user, "is_instructor", False)
            or getattr(request.user, "is_platform_admin", False)
        ):
            return Response(
                {"detail": "Réservé aux formateurs et administrateurs."},
                status=403,
            )

        s = TextTransformInput(data=request.data)
        s.is_valid(raise_exception=True)
        data = s.validated_data

        result = transform_text(
            action=data["action"],
            text=data["text"],
            context=data.get("context") or {},
            target_language=data.get("target_language") or None,
        )

        AIAuditLog.objects.create(
            user=request.user,
            organization_id=None,
            kind=AIAuditLog.Kind.TEXT_TRANSFORM,
            payload={
                "action": data["action"],
                "input_chars": len(data["text"]),
                "output_chars": len(result["result"]),
                "model_used": result["model_used"],
                "context_keys": list((data.get("context") or {}).keys()),
            },
            ip=_client_ip(request),
        )
        return Response(result)


class TextTransformActionsView(APIView):
    """Liste des actions disponibles (metadonnées pour le front)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Liste des actions IA de transformation")
    def get(self, request):
        return Response(
            {
                "actions": [
                    {"key": key, "label": meta[0], "instruction": meta[1]}
                    for key, meta in ACTIONS.items()
                ]
            }
        )


# ─────────────────────────────────────────────────────────────
# Recommendations
# ─────────────────────────────────────────────────────────────


class RecommendationsView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Recommandations personnalisées pour l'apprenant")
    def get(self, request):
        if not user_can_use_assistant(request.user):
            return _forbidden(request.user)
        # Recos essentiellement destinées aux learners (mais accessible
        # aux instructors/admins pour tests).
        try:
            grouped = generate_recommendations(request.user, per_category=6)
        except Exception as exc:  # noqa: BLE001
            return Response(
                {"detail": "Échec calcul recommandations.", "error": str(exc)},
                status=500,
            )

        # Enrichissement avec titre + slug pour l'affichage
        from catalog.models import Course

        course_ids = {r["course_id"] for items in grouped.values() for r in items}
        courses = {
            c.id: {
                "id": c.id,
                "title": c.title,
                "slug": c.slug,
                "level": getattr(c, "level", None),
                "language": getattr(c, "language", None),
                "course_type": getattr(c, "course_type", None),
                "subtitle": getattr(c, "subtitle", ""),
                "thumbnail_url": (
                    c.thumbnail.url if c.thumbnail else ""
                ),
            }
            for c in Course.objects.filter(id__in=course_ids)
        }

        out = {}
        for category, items in grouped.items():
            out[category] = []
            for r in items:
                course = courses.get(r["course_id"])
                if not course:
                    continue
                out[category].append(
                    {
                        "course": course,
                        "match_score": r["match_score"],
                        "reason": r["reason"],
                        "category": category,
                    }
                )

        AIAuditLog.objects.create(
            user=request.user,
            kind=AIAuditLog.Kind.RECO_GENERATED,
            payload={
                "categories": {k: len(v) for k, v in out.items()},
            },
            ip=_client_ip(request),
        )
        return Response({"categories": out})


class RecommendationFeedbackInput(serializers.Serializer):
    course_id = serializers.IntegerField(min_value=1)
    feedback = serializers.ChoiceField(
        choices=[
            "interested",
            "not_interested",
            "already_known",
            "too_easy",
            "too_hard",
            "later",
        ]
    )
    category = serializers.ChoiceField(
        choices=[c[0] for c in AIRecommendation.Category.choices],
        required=False,
        allow_blank=True,
    )


class RecommendationFeedbackView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        summary="Envoyer un feedback sur une recommandation",
        request=RecommendationFeedbackInput,
    )
    def post(self, request):
        if not user_can_use_assistant(request.user):
            return _forbidden(request.user)
        s = RecommendationFeedbackInput(data=request.data)
        s.is_valid(raise_exception=True)
        try:
            updated = submit_feedback(
                user=request.user,
                course_id=s.validated_data["course_id"],
                feedback=s.validated_data["feedback"],
                category=s.validated_data.get("category") or None,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)

        AIAuditLog.objects.create(
            user=request.user,
            kind=AIAuditLog.Kind.RECO_FEEDBACK,
            payload={
                "course_id": s.validated_data["course_id"],
                "feedback": s.validated_data["feedback"],
                "category": s.validated_data.get("category") or "",
            },
            ip=_client_ip(request),
        )
        return Response({"detail": "OK", "updated": updated})
