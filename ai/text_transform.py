"""ai.text_transform — Actions IA de transformation de texte (Phase 3).

12 actions couvertes par l'éditeur WYSIWYG :

    write, continue, improve, correct, reformulate, summarize,
    expand, simplify, professional, to_list, to_table, example,
    case_study, exercise, translate, adapt_beginner, adapt_intermediate,
    adapt_advanced.

Chaque action génère une consigne LLM structurée. On accepte un
``context`` optionnel (titre de leçon, section, cours) pour ancrer la
génération. Fallback synthétique déterministe si le LLM échoue ou
retourne du vide.
"""
from __future__ import annotations

from typing import Optional

from .providers import ChatMessage, get_provider_for_purpose


# Action → (label FR, prompt instruction)
ACTIONS = {
    "write": (
        "Rédiger",
        "Rédige un paragraphe pédagogique clair et structuré à partir de la "
        "consigne fournie. Style pédagogique, français correct, phrases courtes.",
    ),
    "continue": (
        "Continuer la rédaction",
        "Poursuis naturellement le texte fourni sans le répéter, sur 2 à 3 "
        "paragraphes maximum.",
    ),
    "improve": (
        "Améliorer",
        "Améliore la qualité rédactionnelle du texte (clarté, fluidité, "
        "concision) sans changer le sens ni ajouter de nouveaux faits.",
    ),
    "correct": (
        "Corriger",
        "Corrige uniquement l'orthographe, la grammaire et la ponctuation. "
        "Ne modifie pas le style ni le sens.",
    ),
    "reformulate": (
        "Reformuler",
        "Reformule le texte en gardant strictement le même sens, avec des "
        "mots et une structure différents.",
    ),
    "summarize": (
        "Résumer",
        "Produis un résumé fidèle en 3 à 5 phrases maximum.",
    ),
    "expand": (
        "Développer",
        "Développe le texte en ajoutant des exemples concrets et des "
        "explications complémentaires (2-3 paragraphes).",
    ),
    "simplify": (
        "Simplifier",
        "Simplifie le vocabulaire et la structure pour rendre le texte "
        "accessible à un public débutant.",
    ),
    "professional": (
        "Rendre professionnel",
        "Rends le texte plus professionnel, formel et adapté à un contexte "
        "d'entreprise, sans jargon inutile.",
    ),
    "to_list": (
        "Transformer en liste",
        "Convertis le texte en liste à puces claire (Markdown) avec 4-8 "
        "éléments essentiels.",
    ),
    "to_table": (
        "Transformer en tableau",
        "Convertis les informations clés du texte en tableau Markdown (2-4 "
        "colonnes selon la nature des données).",
    ),
    "example": (
        "Générer un exemple",
        "Propose un exemple concret et parlant qui illustre le concept du "
        "texte fourni.",
    ),
    "case_study": (
        "Générer une étude de cas",
        "Rédige une étude de cas courte (contexte, problématique, solution, "
        "résultat) en lien avec le texte fourni.",
    ),
    "exercise": (
        "Générer un exercice",
        "Propose un exercice pratique (énoncé + consignes) permettant de "
        "s'entraîner sur le contenu du texte.",
    ),
    "translate": (
        "Traduire",
        "Traduis fidèlement le texte dans la langue cible fournie en "
        "``target_language``. Préserve le sens et la structure.",
    ),
    "adapt_beginner": (
        "Adapter au niveau débutant",
        "Adapte le texte à un public totalement débutant : vocabulaire "
        "simple, phrases courtes, exemples élémentaires.",
    ),
    "adapt_intermediate": (
        "Adapter au niveau intermédiaire",
        "Adapte le texte à un public intermédiaire : équilibre entre rigueur "
        "et accessibilité.",
    ),
    "adapt_advanced": (
        "Adapter au niveau avancé",
        "Adapte le texte à un public avancé : introduis des nuances, "
        "références et détails techniques.",
    ),
}


def _fallback(action: str, text: str, target_language: Optional[str] = None) -> str:
    """Réponse synthétique déterministe si le LLM ne fournit rien."""
    text = (text or "").strip()
    if not text:
        return "*(Sélection vide — impossible d'appliquer cette action.)*"
    if action == "summarize":
        # Prend les 2 premières phrases + points clés
        first = ".".join(text.split(".")[:2]).strip() + "."
        return f"**Résumé :** {first}"
    if action == "to_list":
        parts = [p.strip() for p in text.replace(";", ".").split(".") if p.strip()]
        parts = parts[:6] or [text]
        return "\n".join(f"- {p}" for p in parts)
    if action == "to_table":
        return (
            "| Élément | Description |\n"
            "|---|---|\n"
            f"| Concept | {text[:80]} |\n"
            "| Portée | À préciser |\n"
            "| Cas d'usage | À préciser |"
        )
    if action == "translate":
        lang = (target_language or "en").upper()
        return f"*(Traduction {lang} indisponible en mode local — texte inchangé.)*\n\n{text}"
    if action in ("adapt_beginner", "simplify"):
        return f"**Version simplifiée.** {text[:400]}"
    if action == "professional":
        return f"**Version professionnelle.** {text[:400]}"
    return f"{text}\n\n_(Action « {ACTIONS.get(action, (action,))[0]} » — mode local.)_"


def transform_text(
    *,
    action: str,
    text: str,
    context: Optional[dict] = None,
    target_language: Optional[str] = None,
) -> dict:
    """Applique une action IA sur un texte.

    Retourne ``{action, result, model_used, input_tokens, output_tokens}``.
    """
    if action not in ACTIONS:
        raise ValueError(f"Action inconnue: {action!r}")

    label, instruction = ACTIONS[action]
    ctx_bits = []
    if context:
        for k in ("course_title", "section_title", "lesson_title", "level"):
            v = context.get(k)
            if v:
                ctx_bits.append(f"- {k} : {v}")
    ctx_block = "\n".join(ctx_bits)

    system = (
        "Tu es un rédacteur pédagogique senior. Tu réponds uniquement avec "
        "le contenu transformé, en Markdown propre, sans phrases méta comme "
        "« voici le texte ». Pas de préambule, pas de conclusion superflue."
    )

    user_prompt_parts = [f"Action : {label}", f"Consigne : {instruction}"]
    if ctx_block:
        user_prompt_parts.append(f"Contexte de la leçon :\n{ctx_block}")
    if target_language:
        user_prompt_parts.append(f"Langue cible : {target_language}")
    user_prompt_parts.append(f"Texte source :\n\"\"\"\n{text.strip()}\n\"\"\"")
    user_prompt = "\n\n".join(user_prompt_parts)

    resolved = get_provider_for_purpose("chat_fast")
    result_text = ""
    input_tokens = 0
    output_tokens = 0
    model_used = resolved.model_name

    try:
        result = resolved.provider.chat(
            model=resolved.model_name,
            messages=[
                ChatMessage(role="system", content=system),
                ChatMessage(role="user", content=user_prompt),
            ],
            temperature=0.4,
            max_tokens=min(resolved.max_tokens, 1200),
        )
        result_text = (result.content or "").strip()
        input_tokens = result.input_tokens
        output_tokens = result.output_tokens
        model_used = result.model_used or resolved.model_name
    except Exception:
        result_text = ""

    if not result_text:
        result_text = _fallback(action, text, target_language)

    return {
        "action": action,
        "label": label,
        "result": result_text,
        "model_used": model_used,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
    }
