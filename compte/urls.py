"""URLs de l'espace compte utilisateur (namespace ``compte``).

Inclus dans ``best_epargne.urls`` via :

    path("compte/", include(("compte.urls", "compte"), namespace="compte"))
"""
from __future__ import annotations

from django.urls import path

from compte.views import UserProfileView

app_name = "compte"

urlpatterns = [
    path("profile/", UserProfileView.as_view(), name="profile"),
]
