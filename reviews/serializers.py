"""
reviews/serializers.py — CORRECTIF P1.D (audit REV-02, REV-03, REV-09).

1. **XSS stockée (REV-02)** : `comment` n'est plus stocké en HTML brut.
   ``validate_comment`` applique ``bleach.clean(value, tags=[], strip=True)`` :
   on supprime tout HTML, on garde le texte. Limite de longueur = 2000.

2. **Validation rating au niveau modèle ET serializer (REV-03)** : la
   validation côté serializer reste, mais les validators DB sont ajoutés au
   modèle (cf. reviews/models.py.new).

3. **get_user_name plus robuste (REV-09)** : utilise email split au lieu d'un
   ``username`` inexistant sur ``compte.User``.
"""
from __future__ import annotations

import bleach
from rest_framework import serializers

from reviews.models import CourseReview

_MAX_COMMENT_LEN = 2000


class CourseReviewSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()
    is_mine = serializers.SerializerMethodField()

    class Meta:
        model = CourseReview
        fields = [
            "id",
            "course",
            "rating",
            "comment",
            "user_name",
            "is_mine",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "course", "user_name", "is_mine", "created_at", "updated_at"]

    def get_user_name(self, obj) -> str:
        u = obj.user
        # REV-09 : `compte.User` hérite d'`AbstractBaseUser` → pas de
        # méthode `get_full_name()`. On lit le champ `full_name` direct,
        # puis on essaye la méthode standard Django si dispo, puis on
        # tombe sur la partie locale de l'email.
        full = (getattr(u, "full_name", "") or "").strip()
        if not full and hasattr(u, "get_full_name"):
            try:
                full = (u.get_full_name() or "").strip()
            except Exception:
                full = ""
        if full:
            return full
        email = getattr(u, "email", "") or ""
        return email.split("@")[0] if email else "Apprenant"

    def get_is_mine(self, obj) -> bool:
        req = self.context.get("request")
        return bool(req and req.user.is_authenticated and obj.user_id == req.user.id)

    def validate_rating(self, value):
        if value < 1 or value > 5:
            raise serializers.ValidationError("La note doit être comprise entre 1 et 5.")
        return value

    def validate_comment(self, value):
        if value is None:
            return ""
        # 1) Strip HTML (anti-XSS stockée).
        clean = bleach.clean(value, tags=[], attributes={}, strip=True).strip()
        # 2) Borne de longueur (anti-bombe de texte).
        if len(clean) > _MAX_COMMENT_LEN:
            raise serializers.ValidationError(
                f"Le commentaire ne peut pas dépasser {_MAX_COMMENT_LEN} caractères."
            )
        return clean
