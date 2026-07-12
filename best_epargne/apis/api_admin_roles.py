"""
best_epargne/apis/api_admin_roles.py — R39.1

Endpoints admin — Rôles & permissions basés sur Django `Group` natif.
Aucune migration DB nécessaire : on réutilise `auth.Group` et le
many-to-many `user.groups` déjà présent dans `AbstractBaseUser` via
`PermissionsMixin`.

    GET    /api/admin/roles/                    → liste + counts
    POST   /api/admin/roles/                    → créer un rôle
    PATCH  /api/admin/roles/<id>/               → renommer
    DELETE /api/admin/roles/<id>/               → supprimer
    GET    /api/admin/roles/<id>/users/         → membres du rôle
    POST   /api/admin/roles/<id>/users/         → ajouter un user (body: {user_id})
    DELETE /api/admin/roles/<id>/users/<uid>/   → retirer un user

Réservé ``is_platform_admin``. Pour affecter des permissions Django
détaillées à un groupe, utiliser l'admin Django (roadmap R41+ pour une
matrice permissions visuelle).
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.db.models import Count
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView


User = get_user_model()


def _guard(request):
    if not getattr(request.user, "is_platform_admin", False):
        return Response(
            {"detail": "Réservé aux administrateurs plateforme."},
            status=status.HTTP_403_FORBIDDEN,
        )
    return None


class _GroupSerializer(serializers.ModelSerializer):
    users_count = serializers.IntegerField(read_only=True)
    permissions_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Group
        fields = ["id", "name", "users_count", "permissions_count"]


class _UserSummarySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    email = serializers.EmailField()
    full_name = serializers.CharField(allow_blank=True)
    is_active = serializers.BooleanField()


class AdminRolesListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Admin — liste des rôles (Django groups)")
    def get(self, request):
        g = _guard(request)
        if g:
            return g
        qs = (
            Group.objects.annotate(
                users_count=Count("user", distinct=True),
                permissions_count=Count("permissions", distinct=True),
            )
            .order_by("name")
        )
        ser = _GroupSerializer(qs, many=True)
        return Response(
            {
                "results": ser.data,
                "aggregated": {
                    "total": qs.count(),
                    "total_users_assigned": sum(g.users_count for g in qs),
                },
            }
        )

    @extend_schema(summary="Créer un rôle")
    def post(self, request):
        g = _guard(request)
        if g:
            return g
        name = (request.data.get("name") or "").strip()
        if not name:
            return Response({"detail": "Nom requis."}, status=400)
        if Group.objects.filter(name=name).exists():
            return Response({"detail": "Un rôle avec ce nom existe déjà."}, status=409)
        group = Group.objects.create(name=name)
        return Response(
            {"id": group.id, "name": group.name, "users_count": 0, "permissions_count": 0},
            status=201,
        )


class AdminRoleDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, role_id: int):
        g = _guard(request)
        if g:
            return g
        try:
            group = Group.objects.get(pk=role_id)
        except Group.DoesNotExist:
            return Response({"detail": "Introuvable."}, status=404)
        name = request.data.get("name")
        if name:
            name = name.strip()
            if not name:
                return Response({"detail": "Nom invalide."}, status=400)
            if Group.objects.filter(name=name).exclude(pk=role_id).exists():
                return Response({"detail": "Nom déjà utilisé."}, status=409)
            group.name = name
            group.save(update_fields=["name"])
        return Response({"id": group.id, "name": group.name})

    def delete(self, request, role_id: int):
        g = _guard(request)
        if g:
            return g
        try:
            group = Group.objects.get(pk=role_id)
        except Group.DoesNotExist:
            return Response(status=204)
        if group.user_set.exists():
            return Response(
                {"detail": "Impossible de supprimer un rôle ayant des membres. Retirez-les d'abord."},
                status=409,
            )
        group.delete()
        return Response(status=204)


class AdminRoleUsersView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, role_id: int):
        g = _guard(request)
        if g:
            return g
        try:
            group = Group.objects.get(pk=role_id)
        except Group.DoesNotExist:
            return Response({"detail": "Introuvable."}, status=404)
        users = group.user_set.all().order_by("email")[:200]
        results = [
            {
                "id": u.id,
                "email": u.email,
                "full_name": getattr(u, "full_name", "") or "",
                "is_active": u.is_active,
            }
            for u in users
        ]
        return Response({"results": results, "count": group.user_set.count()})

    def post(self, request, role_id: int):
        g = _guard(request)
        if g:
            return g
        try:
            group = Group.objects.get(pk=role_id)
        except Group.DoesNotExist:
            return Response({"detail": "Introuvable."}, status=404)
        user_id = request.data.get("user_id")
        if not user_id:
            return Response({"detail": "user_id requis."}, status=400)
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({"detail": "Utilisateur introuvable."}, status=404)
        user.groups.add(group)
        return Response({"id": user.id, "email": user.email, "added": True})


class AdminRoleUserRemoveView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, role_id: int, user_id: int):
        g = _guard(request)
        if g:
            return g
        try:
            group = Group.objects.get(pk=role_id)
            user = User.objects.get(pk=user_id)
        except (Group.DoesNotExist, User.DoesNotExist):
            return Response(status=204)
        user.groups.remove(group)
        return Response(status=204)
