"""
best_epargne/apis/api_certificate_templates.py — R20.1

Endpoints CRUD pour les templates de certificat.

Politique d'accès :
- Liste : renvoie les templates du user + les templates publics (owner=NULL
  ou is_public=True).
- Detail : owner OU public.
- Create : instructor authentifié (owner = request.user).
- Update / Delete : owner uniquement, sauf platform_admin qui peut tout.
- Presets globaux (owner=NULL) : lecture universelle, écriture réservée
  aux admins plateforme.
"""
from __future__ import annotations

from django.db.models import Q
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from certifications.models import CertificateTemplate


# ─────────────────────────────────────────────────────────────
# Serializer
# ─────────────────────────────────────────────────────────────

class CertificateTemplateSerializer(serializers.ModelSerializer):
    can_edit = serializers.SerializerMethodField()
    owner_name = serializers.SerializerMethodField()

    class Meta:
        model = CertificateTemplate
        fields = [
            "id",
            "name",
            "style",
            "orientation",
            "primary_color",
            "accent_color",
            "text_color",
            "font_family",
            "organization_name",
            "logo_url",
            "signature_image_url",
            "signature_name",
            "signature_title",
            "watermark_url",
            "heading_text",
            "body_text",
            "footer_text",
            "show_qr_code",
            "show_serial",
            "show_completion_date",
            "is_public",
            "is_default",
            "owner",
            "owner_name",
            "can_edit",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "owner", "owner_name", "can_edit", "created_at", "updated_at"]

    def get_can_edit(self, obj) -> bool:
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return False
        if getattr(user, "is_platform_admin", False):
            return True
        return obj.owner_id == user.id

    def get_owner_name(self, obj) -> str:
        if not obj.owner_id:
            return "Plateforme"
        u = obj.owner
        return (
            getattr(u, "full_name", None)
            or getattr(u, "email", "")
            or "Utilisateur"
        )


# ─────────────────────────────────────────────────────────────
# Views
# ─────────────────────────────────────────────────────────────

def _visible_qs(user):
    """Templates visibles pour ``user`` : les siens + les publics."""
    return CertificateTemplate.objects.filter(
        Q(owner=user) | Q(is_public=True) | Q(owner__isnull=True)
    ).distinct()


def _can_write(template: CertificateTemplate, user) -> bool:
    if getattr(user, "is_platform_admin", False):
        return True
    return template.owner_id == user.id


class CertificateTemplateListCreateView(APIView):
    """
    GET  /api/instructor/certificate-templates/  → liste des templates visibles
    POST /api/instructor/certificate-templates/  → crée (owner = request.user)
    """
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Liste des templates certificat visibles")
    def get(self, request):
        qs = _visible_qs(request.user).order_by("-is_public", "-is_default", "name")
        style = request.query_params.get("style")
        if style:
            qs = qs.filter(style=style)
        data = CertificateTemplateSerializer(
            qs, many=True, context={"request": request}
        ).data
        return Response(data)

    @extend_schema(summary="Créer un template personnel")
    def post(self, request):
        ser = CertificateTemplateSerializer(
            data=request.data, context={"request": request}
        )
        ser.is_valid(raise_exception=True)
        # is_public réservé aux platform_admin
        if ser.validated_data.get("is_public") and not getattr(
            request.user, "is_platform_admin", False
        ):
            ser.validated_data["is_public"] = False
        ser.save(owner=request.user)
        return Response(ser.data, status=status.HTTP_201_CREATED)


class CertificateTemplateDetailView(APIView):
    """
    GET    /api/instructor/certificate-templates/<id>/   → détail
    PATCH  /api/instructor/certificate-templates/<id>/   → update (owner ou admin)
    DELETE /api/instructor/certificate-templates/<id>/   → suppression (owner ou admin)
    """
    permission_classes = [IsAuthenticated]

    def _get(self, request, template_id: int):
        try:
            tpl = _visible_qs(request.user).get(pk=template_id)
        except CertificateTemplate.DoesNotExist:
            return None
        return tpl

    @extend_schema(summary="Détail d'un template")
    def get(self, request, template_id: int):
        tpl = self._get(request, template_id)
        if not tpl:
            return Response({"detail": "Introuvable."}, status=404)
        return Response(
            CertificateTemplateSerializer(tpl, context={"request": request}).data
        )

    @extend_schema(summary="Update partiel du template")
    def patch(self, request, template_id: int):
        tpl = self._get(request, template_id)
        if not tpl:
            return Response({"detail": "Introuvable."}, status=404)
        if not _can_write(tpl, request.user):
            return Response(
                {"detail": "Vous ne pouvez pas modifier ce template."},
                status=status.HTTP_403_FORBIDDEN,
            )
        ser = CertificateTemplateSerializer(
            tpl, data=request.data, partial=True, context={"request": request}
        )
        ser.is_valid(raise_exception=True)
        # Blocage is_public pour non-admin
        if (
            "is_public" in ser.validated_data
            and ser.validated_data["is_public"]
            and not getattr(request.user, "is_platform_admin", False)
        ):
            ser.validated_data.pop("is_public")
        ser.save()
        return Response(ser.data)

    @extend_schema(summary="Suppression")
    def delete(self, request, template_id: int):
        tpl = self._get(request, template_id)
        if not tpl:
            return Response(status=status.HTTP_204_NO_CONTENT)
        if not _can_write(tpl, request.user):
            return Response(
                {"detail": "Vous ne pouvez pas supprimer ce template."},
                status=status.HTTP_403_FORBIDDEN,
            )
        tpl.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CertificateTemplateDuplicateView(APIView):
    """
    POST /api/instructor/certificate-templates/<id>/duplicate/
    Duplique un template (public ou perso) en template personnel de l'user.
    """
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Dupliquer un template en template personnel")
    def post(self, request, template_id: int):
        try:
            src = _visible_qs(request.user).get(pk=template_id)
        except CertificateTemplate.DoesNotExist:
            return Response({"detail": "Introuvable."}, status=404)

        # Copie shallow : on ne dupplique pas les FK, on crée un nouveau
        src.pk = None
        src._state.adding = True
        src.name = f"{src.name} (copie)"[:160]
        src.owner = request.user
        src.is_public = False
        src.is_default = False
        src.save()
        return Response(
            CertificateTemplateSerializer(src, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )
