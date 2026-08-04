"""Régression : les imports « optionnels » ne doivent pas masquer une faute.

Contexte (QA du 2026-08-04, branche chore/audit-remediation-2026-05).

``best_epargne/apis/views.py`` utilise le motif suivant à plusieurs endroits :

    try:
        from reviews.models import CourseReview, Review
    except Exception:
        Review = None
        CourseReview = None

L'intention est de tolérer un module absent. L'effet réel était tout autre :
``Review`` n'existe pas dans ``reviews.models`` (le modèle s'appelle
``CourseReview``), l'``ImportError`` était avalée, et **les deux** noms
tombaient à ``None``. Conséquences :

* ``InstructorReviewsView`` appelait ``CourseReview.objects`` sur ``None`` →
  ``AttributeError`` → 500 sur ``/api/instructor/reviews/`` ;
* le garde ``if CourseReview:`` des KPI passait à ``False``, donc le tableau
  de bord formateur affichait **0 avis** sans erreur, sans log, sans test
  rouge. Une donnée fausse et silencieuse est plus coûteuse qu'un 500 : rien
  ne la signale.

Ce test échoue si l'un de ces symboles retombe à ``None``. Il ne teste pas
« l'import fonctionne » dans l'absolu, il teste que le repli défensif ne
s'active pas en conditions normales — c'est exactement ce qui n'était vu par
personne.

Lancer : `pytest tests/test_optional_imports_integrity.py -v`
"""
from __future__ import annotations

import pytest

# Symboles chargés via un try/except ... = None dans apis/views.py.
# Ajouter ici tout nouveau symbole protégé par ce motif.
SYMBOLES_ATTENDUS = [
    "CourseReview",
    "Review",
    "Enrollment",
    "LessonProgress",
    "Payment",
    "Notification",
]


@pytest.mark.parametrize("nom", SYMBOLES_ATTENDUS)
def test_symbole_optionnel_est_resolu(nom):
    """Un symbole à None signifie que le try/except a avalé une vraie faute."""
    import best_epargne.apis.views as views

    assert hasattr(views, nom), (
        f"{nom} a disparu de apis/views.py — retirer aussi son entrée ici"
    )
    valeur = getattr(views, nom)
    assert valeur is not None, (
        f"apis/views.py: {nom} vaut None. Le try/except a masqué une erreur "
        f"d'import réelle. Reproduire à la main pour voir la cause :\n"
        f"    python -c \"import django;django.setup();from ... import {nom}\""
    )


def test_le_modele_avis_expose_les_champs_utilises():
    """`CourseReview` est requêté sur `course__instructor`, `is_public` et
    `rating`. Un renommage silencieux de l'un d'eux casserait les deux
    endpoints formateur sans que rien ne le signale au build."""
    from reviews.models import CourseReview

    champs = {f.name for f in CourseReview._meta.get_fields()}
    for attendu in ("course", "user", "rating", "is_public", "created_at"):
        assert attendu in champs, f"CourseReview.{attendu} a disparu"


def test_le_modele_notification_na_pas_de_champ_is_read():
    """Garde-fou sur la confusion d'origine : deux modèles Notification
    coexistent. `notifications_app.Notification` porte `read_at`,
    `catalog.Notification` porte `is_read`. Le filtre des KPI avait été écrit
    contre le schéma du mauvais modèle, d'où un FieldError en 500.

    Si ce test devient rouge parce que `is_read` est apparu, vérifier que le
    filtre de `InstructorKpisView` cible bien le bon modèle."""
    from notifications.models import Notification

    champs = {f.name for f in Notification._meta.get_fields()}
    assert "read_at" in champs
    assert "is_read" not in champs, (
        "notifications_app.Notification expose maintenant is_read : revoir "
        "le filtre de InstructorKpisView, qui utilise read_at__isnull=True"
    )
