"""glossary — Module lexique pédagogique de Best-Épargne.

Fournit un dictionnaire interne : termes globaux + termes spécifiques à
une formation, détection automatique dans les leçons, tooltip côté
learner, favoris, notes personnelles, suggestions.

Modèles (11 entités relationnelles) :
    - GlossaryCategory   : arborescence de catégories.
    - GlossaryTerm       : entrée principale du dictionnaire.
    - GlossaryVariant    : synonyme / acronyme / pluriel / variante orthographique.
    - GlossaryExample    : exemple d'utilisation.
    - GlossaryAssociation: rattache un terme à un cours / section / leçon.
    - GlossaryRelation   : relations sémantiques entre termes.
    - GlossarySuggestion : propositions apprenants / formateurs.
    - GlossaryFavorite   : favoris apprenant.
    - GlossaryUserNote   : notes personnelles apprenant (privées).
    - GlossaryView       : historique de consultation apprenant.
    - GlossaryRevision   : audit trail des modifications.

Statuts (GlossaryTerm.status) :
    draft → pending → validated ↔ archived (rejected en état terminal).
"""
default_app_config = "glossary.apps.GlossaryConfig"
