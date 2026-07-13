"""ai.permissions — RBAC pour le module Best-AI.

**IMPORTANT — Best-AI est réservé aux utilisateurs authentifiés.**

Aucune personne non-connectée ne peut utiliser l'assistant ni ses
sous-fonctions (KB, tools, recos, image gen, admin center). Cette
garantie est appliquée à trois niveaux :

    1. Backend — chaque vue DRF a ``permission_classes=[IsAuthenticated]``
       ET appelle ``user_can_use_assistant()`` avant tout traitement.
    2. RBAC fin — chaque tool/action déclare son propre ``allowed_roles``
       et le dispatcher vérifie avant exécution.
    3. Frontend — le bouton flottant, le panel et toutes les pages IA
       sont conditionnés à ``useIsAuthenticated()`` + wrappé en
       ``ProtectedRoute`` côté router.

Cette fonction est le point unique de vérité de la première couche.
Toute modification ici doit préserver le principe : ``guest → False``.
"""
from __future__ import annotations


def user_can_use_assistant(user) -> bool:
    """Vrai si l'utilisateur peut ouvrir/utiliser Best-AI.

    Règles cumulatives (SECURITE-05) :
        - Objet ``user`` valide (pas ``None``, pas ``AnonymousUser``)
        - ``is_authenticated`` True (session/JWT valide)
        - ``is_active`` True (compte non désactivé par l'admin)
        - ``is_email_verified`` True (e-mail vérifié)

    Les administrateurs plateforme (``is_platform_admin``) sont
    exemptés de la vérification e-mail pour ne pas casser le support
    technique (leur compte est créé via ``createsuperuser`` avant
    l'ajout du champ).

    Retourne systématiquement ``False`` pour tout accès anonyme, même
    si d'autres champs du user existent — c'est intentionnel : Best-AI
    ne doit PAS être exposé au grand public.
    """
    if user is None:
        return False
    # AnonymousUser a is_authenticated = False.
    if not getattr(user, "is_authenticated", False):
        return False
    if not getattr(user, "is_active", False):
        return False
    if getattr(user, "is_platform_admin", False):
        return True
    if not getattr(user, "is_email_verified", True):
        return False
    return True


def user_can_access_conversation(user, conversation) -> bool:
    if not user_can_use_assistant(user):
        return False
    if conversation.user_id == user.id:
        return True
    return bool(getattr(user, "is_platform_admin", False))


def user_can_delete_conversation(user, conversation) -> bool:
    """Seul le propriétaire peut supprimer (l'admin voit mais ne supprime pas)."""
    return bool(
        user_can_use_assistant(user)
        and conversation.user_id == user.id
    )


def role_bundle(user) -> dict:
    """Petit dict envoyé au contexte système du prompt.

    Renvoie explicitement ``role="guest"`` si l'utilisateur n'est pas
    autorisé — la vue appelante doit refuser dans ce cas, mais le
    prompt système reste défensif.
    """
    if not user_can_use_assistant(user):
        return {"role": "guest"}
    return {
        "role": "platform_admin"
        if getattr(user, "is_platform_admin", False)
        else ("instructor" if getattr(user, "is_instructor", False)
              else ("learner" if getattr(user, "is_learner", False) else "user")),
        "user_id": user.id,
        "email": user.email,
    }
