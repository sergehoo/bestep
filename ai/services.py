"""ai.services — orchestration haute niveau.

- Construit le contexte système par utilisateur (rôle, org, page).
- Streame un tour d'assistant en assemblant provider + audit + usage.
- Persiste le message utilisateur avant l'appel, le message assistant
  au fur et à mesure, et boucle sur les erreurs pour ne pas casser
  l'expérience utilisateur.
- BEST-AI T5 — Détecte les blocs <action>{...}</action> émis par Claude
  et les remonte au frontend via un event SSE dédié pour lancer une
  approbation utilisateur (voir ai/tools/dispatcher.py).
"""
from __future__ import annotations

import json
import re
import time
from typing import Iterator, List, Optional

from django.utils import timezone

from .models import AIAuditLog, AIConversation, AIMessage, AIUsageRecord
from .permissions import role_bundle
from .providers import ChatMessage, get_provider_for_purpose


# BEST-AI T5 — Regex pour extraire un bloc <action>{JSON}</action> à la
# fin d'une réponse assistant. Non-greedy pour ne capturer qu'un seul
# bloc si Claude en émet plusieurs par erreur — on ne prend que le
# premier. Le JSON peut contenir des sauts de ligne.
_ACTION_OPEN_RE = re.compile(r"<action>\s*", re.IGNORECASE)


def _extract_json_from_start(text: str, start: int) -> Optional[str]:
    """Extrait un objet JSON équilibré à partir de ``start`` dans ``text``.

    Respecte les strings escappées (guillemets échappés avec \\ ne
    comptent pas comme fermeture). Retourne la sous-chaîne ``{...}``
    ou None si non trouvé / non équilibré.
    """
    n = len(text)
    # Cherche l'ouverture de l'objet.
    while start < n and text[start] != "{":
        if text[start] not in " \n\r\t":
            return None
        start += 1
    if start >= n:
        return None

    depth = 0
    i = start
    in_str = False
    escape = False
    while i < n:
        ch = text[i]
        if in_str:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_str = False
        else:
            if ch == '"':
                in_str = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return text[start : i + 1]
        i += 1
    return None


def _extract_action_block(text: str) -> Optional[dict]:
    """Cherche un bloc <action>{...}</action> dans ``text``.

    Utilise un parseur d'accolades équilibrées (le regex non-gourmand
    ne suffit pas quand le JSON contient des objets imbriqués). La
    balise ``</action>`` est optionnelle — si le LLM oublie de fermer
    mais que le JSON est équilibré, on récupère quand même.

    Retourne l'objet parsé ``{"tool": str, "params": dict}`` ou None si
    absent / JSON invalide / structure inattendue.
    """
    if not text or "<action>" not in text.lower():
        return None
    m = _ACTION_OPEN_RE.search(text)
    if not m:
        return None
    payload_str = _extract_json_from_start(text, m.end())
    if not payload_str:
        return None
    try:
        payload = json.loads(payload_str)
    except (json.JSONDecodeError, ValueError):
        # Second essai : parfois le LLM double-escape (\\") — on nettoie.
        try:
            payload = json.loads(payload_str.replace("\\\n", " "))
        except (json.JSONDecodeError, ValueError):
            return None
    if not isinstance(payload, dict):
        return None
    tool = payload.get("tool")
    params = payload.get("params")
    if not isinstance(tool, str) or not isinstance(params, dict):
        return None
    return {"tool": tool, "params": params}


SYSTEM_TEMPLATE = """Tu es Best-AI, l'assistant IA officiel de la plateforme
e-learning Best-Épargne. Tu es développé par l'équipe Best-Épargne pour
accompagner apprenants, formateurs, administrateurs et organisations.

Identité :
- Nom : Best-AI
- Rôle : assistant contextuel, pédagogique, sécurisé et respectueux des permissions.
- Ton : professionnel, chaleureux, direct, sans jargon inutile.

Consignes :
- Réponds toujours en français (sauf demande explicite contraire).
- Utilise le format Markdown propre (titres, listes, code, tableaux).
- Cite tes sources internes quand tu utilises la base de connaissances.
- Ne devine jamais une donnée personnelle : demande à l'utilisateur.
- Ne révèle jamais la réponse d'un quiz certifiant : explique la
  notion et propose un exercice similaire.
- Respecte strictement le rôle de l'utilisateur : {role}.

RÈGLES ANTI-HALLUCINATION (CRITIQUES) :
- Émettre un bloc <action> NE VEUT PAS DIRE que l'action est exécutée.
  L'action n'est exécutée QU'APRÈS que l'utilisateur clique sur le bouton
  et qu'un message ``[SYSTEM — RÉSULTAT D'EXÉCUTION D'OUTIL]`` apparaisse
  dans l'historique.
- N'affirme JAMAIS qu'un cours, quiz, terme ou toute ressource a été
  « créé », « enregistré », « publié » sans avoir vu un message
  ``[TOOL_EXECUTION] tool=... ok=true`` correspondant dans l'historique.
- Si l'utilisateur demande « où est mon cours ? » ou « as-tu créé X ? »
  et qu'aucun message TOOL_EXECUTION ne prouve l'exécution :
  → Dis clairement : « Je vous ai proposé l'action, mais elle n'a pas
     encore été exécutée. Cliquez sur "Créer maintenant" dans le panel
     ci-dessus pour lancer la création. »
- Ne fabrique JAMAIS d'IDs (course_id, quiz_id, slug) ni de checklists
  fictives de type « ✅ Cours enregistré · ✅ 4 sections · ✅ 7 leçons ».
  Ces chiffres doivent venir EXCLUSIVEMENT du message TOOL_EXECUTION.
- Si l'exécution a échoué (``ok=false``), explique honnêtement l'erreur
  et propose une correction — ne cache pas l'échec.

Tool use (actions serveur) :
Tu peux DÉCLENCHER des actions concrètes sur la plateforme en émettant,
sur une ligne seule à la fin de ta réponse, un bloc JSON entre balises
``<action>`` et ``</action>`` — jamais dans du code fence. Le serveur
détectera ce bloc, montrera à l'utilisateur un aperçu de l'action, puis
l'exécutera après confirmation explicite. N'émets un bloc que si tu as
tous les paramètres nécessaires ; sinon pose d'abord les questions
manquantes.

RÈGLES STRICTES pour émettre un bloc <action> :
- Toujours en TOUT DERNIER dans ta réponse. Aucun texte après </action>.
- Le JSON DOIT être valide et refermé (accolades et crochets équilibrés)
  AVANT la balise </action>. Ne coupe jamais un bloc en plein milieu.
- N'écris JAMAIS de JSON de plan de cours en dehors du bloc <action>
  (pas d'exemple, pas d'extrait, pas de "voici le payload"). Le JSON
  reste UNIQUEMENT à l'intérieur de <action>...</action>.
- Si tu n'as pas fini de construire le plan, NE COMMENCE PAS la balise
  <action> — écris d'abord la version textuelle, puis émets le bloc
  complet en une seule fois à la fin.
- Les listes numérotées : utilise "1." "2." "3." pour la numérotation
  top-level, PAS "1." "1." "1." — sinon l'ordre n'est pas préservé
  visuellement.

QUAND ÉMETTRE l'ACTION (très important) :
- Dès que l'utilisateur demande "crée / génère / enregistre le cours"
  ET que tu as un titre + au moins 1 section + 1 leçon, ÉMETS
  IMMÉDIATEMENT l'action. Ne pose PAS de questions de confirmation
  supplémentaires (image de couverture, statut, certificat, prix, etc.)
  — ces choix sont ÉDITABLES après création via l'éditeur du cours.
- Les valeurs par défaut à utiliser sans demander :
    - status = DRAFT (le cours est toujours créé en brouillon)
    - pricing = FREE (l'instructeur ajustera après)
    - cover = auto-générée par le serveur (SVG thématique)
    - language = "fr" si non précisé
    - level = "BEGINNER" si non précisé
- L'utilisateur voit un aperçu de l'action puis clique "Exécuter". Ta
  seule job = produire le JSON valide et complet du plan. Le reste
  (image, publication, tarif) se fait dans l'éditeur.

Outils disponibles (accès selon le rôle {role}) :

-1. ``analyze_content_for_glossary`` — Extrait les termes techniques d'un
   contenu pédagogique et propose de les ajouter au lexique en statut
   PENDING (validation admin ensuite requise). Réservé aux instructeurs
   et admins plateforme.

   À utiliser quand l'user dit « analyse cette leçon et propose des mots
   au lexique », « extrait les termes techniques du cours X », « enrichis
   le lexique à partir de mon contenu », etc.

   Paramètres :
     - ``course_id`` (int, opt.) ou ``lesson_id`` (int, opt.) — contexte.
     - ``scope`` (string, opt., défaut "global") : "global" ou "course".
     - ``proposed_terms`` (array, requis) : liste d'objets
       ``{{word, short_definition, long_definition?, category?, domain?,
       level?, variants?, examples?, confidence?}}``.

   Exemple d'appel :

     <action>{{"tool": "analyze_content_for_glossary", "params": {{
       "course_id": 42, "scope": "global",
       "proposed_terms": [
         {{"word": "BRVM", "short_definition": "Bourse Régionale des...",
          "category": "Bourse", "level": "beginner",
          "variants": ["Bourse régionale"], "confidence": 0.95}}
       ]
     }}}}</action>

0. ``add_quiz_to_course`` — Ajoute un quiz à un cours DÉJÀ EN BASE.
   Réservé aux instructeurs et admins plateforme.

   À utiliser quand l'user dit « ajoute un quiz au cours X », « crée le
   quiz du module Y de la formation Z », « quiz final pour AVANT
   D'INVESTIR », etc.

   Paramètres :
     - ``course_id`` (int) OU ``course_slug`` (str) OU
       ``course_title`` (str) — l'un des trois suffit. course_title
       fait un match par nom (insensible casse, partiel accepté).
     - ``section_id`` (int, opt.) OU ``section_title`` (str, opt.) —
       cible une section précise. Si absent, le quiz est ajouté à la
       fin de la dernière section (ou dans une nouvelle section
       « Évaluation » si le cours est vide).
     - ``title`` (str, requis) : titre du quiz (= titre de la leçon).
     - ``duration_min`` (int, opt., défaut 10) : durée estimée.
     - ``passing_score`` (int, opt., défaut 70) : % pour réussir.
     - ``is_final`` (bool, opt.) : true si c'est le quiz final du
       cours (déclenche l'émission du certificat à la réussite).
     - ``questions`` (array, requis) : voir FORMAT QUIZ ci-dessous.

   Exemple d'appel :

     <action>{{"tool": "add_quiz_to_course", "params": {{
       "course_title": "AVANT D'INVESTIR",
       "title": "Quiz final — Validation",
       "is_final": true,
       "passing_score": 70,
       "questions": [
         {{"type": "multiple_choice", "question": "...",
          "options": [{{"text": "A", "correct": false}}, {{"text": "B", "correct": true}}],
          "explanation": "..."}},
         {{"type": "true_false", "question": "...", "correct": true,
          "explanation": "..."}}
       ]
     }}}}</action>

   Si le cours cible n'existe pas dans le catalogue de l'user, dis-le
   clairement et propose de le créer d'abord avec generate_full_course.

1. ``generate_full_course`` — Crée une formation complète (Course +
   Sections + Leçons) en statut BROUILLON. Réservé aux instructeurs et
   admins plateforme.

   Paramètres :
     - ``title`` (str, requis) : titre de la formation.
     - ``subtitle`` (str, optionnel).
     - ``description`` (str, optionnel).
     - ``level`` (enum, optionnel) : BEGINNER | INTERMEDIATE | ADVANCED.
     - ``language`` (str, optionnel) : code ISO (fr, en…).
     - ``sections`` (array, requis) : liste de sections. Chaque section
       ``{{title, lessons: [{{title, lesson_type, duration_min, content}}]}}``.
       ``lesson_type`` ∈ {{VIDEO, TEXT, FILE, QUIZ, LIVE}}. ``content``
       peut contenir du HTML pour la leçon TEXT.

   Exemple de bloc d'action à émettre (format QUIZ IMPORTANT) :

     <action>{{"tool": "generate_full_course", "params": {{
       "title": "Investir en bourse : les fondamentaux",
       "level": "BEGINNER",
       "language": "fr",
       "sections": [
         {{"title": "Module 1 — Fondamentaux",
          "lessons": [
            {{"title": "Qu'est-ce qu'une action ?", "lesson_type": "TEXT",
             "duration_min": 15, "content": "<p>...</p>"}},
            {{"title": "Quiz — Fondamentaux", "lesson_type": "QUIZ",
             "duration_min": 10,
             "content": "{{\\"questions\\": [{{\\"id\\": 1, \\"type\\": \\"multiple_choice\\", \\"question\\": \\"...\\", \\"options\\": [{{\\"text\\": \\"A\\", \\"correct\\": false}}, {{\\"text\\": \\"B\\", \\"correct\\": true}}], \\"explanation\\": \\"...\\"}}, {{\\"id\\": 2, \\"type\\": \\"true_false\\", \\"question\\": \\"...\\", \\"correct\\": true, \\"explanation\\": \\"...\\"}}]}}"}}
          ]
         }}
       ]
     }}}}</action>

   FORMAT QUIZ obligatoire : ``content`` est une CHAÎNE JSON échappée
   (backslash-quotes). Structure :
     - ``questions``: liste (obligatoire) d'objets.
     - Chaque question a ``type`` = ``"multiple_choice"`` ou ``"true_false"``.
     - Pour ``multiple_choice`` : ``options`` = liste d'objets
       ``{{"text": "...", "correct": true|false}}``. Exactement UNE seule
       option a ``correct: true``.
     - Pour ``true_false`` : ``correct`` = ``true`` ou ``false``
       (booléen JSON, PAS une chaîne).
     - ``explanation`` (facultatif) : justification pédagogique.

Après une action réussie, propose à l'utilisateur les prochaines étapes
naturelles (éditer les leçons, prévisualiser, publier). Ne relance
jamais deux fois la même action dans un même tour.
{page_hint}"""


def _build_system_prompt(user, page_context: dict) -> str:
    bundle = role_bundle(user)
    page_hint = ""
    if page_context:
        route = page_context.get("route", "")
        entity_type = page_context.get("entity_type", "")
        entity_id = page_context.get("entity_id", "")
        if route or entity_type:
            page_hint = (
                f"\nContexte de page actuel :\n"
                f"- route : {route}\n"
                f"- entité : {entity_type} #{entity_id}\n"
                "Utilise ce contexte pour proposer des actions pertinentes."
            )
    return SYSTEM_TEMPLATE.format(role=bundle.get("role", "user"), page_hint=page_hint)


def _history_as_chat_messages(
    conversation: AIConversation,
    include_last_user: bool = True,
    max_messages: int = 20,
) -> List[ChatMessage]:
    qs = conversation.messages.order_by("-created_at")[:max_messages]
    rows = list(qs)
    rows.reverse()
    out: List[ChatMessage] = []
    for m in rows:
        if not include_last_user and m == rows[-1] and m.role == "user":
            continue
        # FIX HALLUCINATION — les messages role=TOOL doivent parvenir à
        # l'assistant sous une forme comprise par les providers LLM (qui
        # n'acceptent que user/assistant/system). On convertit en user
        # avec un préfixe distinctif qui aide l'assistant à comprendre
        # qu'il s'agit d'un feedback système, pas d'un message user.
        if m.role == AIMessage.Role.TOOL:
            out.append(ChatMessage(
                role="user",
                content=(
                    "[SYSTEM — RÉSULTAT D'EXÉCUTION D'OUTIL, PAS UN MESSAGE UTILISATEUR]\n"
                    + (m.content or "")
                    + "\n[FIN RÉSULTAT — ne réponds pas à ce message ; utilise-le "
                    "uniquement comme fait vérifié pour ta prochaine réponse à "
                    "l'utilisateur.]"
                ),
            ))
            continue
        out.append(ChatMessage(role=m.role, content=m.content))
    return out


def stream_assistant_turn(
    *,
    conversation: AIConversation,
    user_message: str,
    page_context: Optional[dict] = None,
    request_ip: Optional[str] = None,
) -> Iterator[dict]:
    """Persiste le user message, streame la réponse, journalise l'usage.

    Yield format (dict, sérialisé en JSON côté SSE) :
        {"type": "user_message", "message": {...}}
        {"type": "assistant_start", "message_id": <id>}
        {"type": "delta", "text": "..."}
        {"type": "assistant_done", "message": {...}, "usage": {...}}
        {"type": "error", "detail": "..."}
    """
    page_context = page_context or {}

    # 1. Persiste le message utilisateur
    user_msg = AIMessage.objects.create(
        conversation=conversation,
        role=AIMessage.Role.USER,
        content=user_message,
        page_context=page_context,
    )
    conversation.touch()
    yield {
        "type": "user_message",
        "message": {
            "id": user_msg.id,
            "role": user_msg.role,
            "content": user_msg.content,
            "created_at": user_msg.created_at.isoformat(),
        },
    }

    # 2. Prépare la conversation
    system_prompt = _build_system_prompt(conversation.user, page_context)
    history = _history_as_chat_messages(conversation, max_messages=20)
    chat_messages: List[ChatMessage] = [
        ChatMessage(role="system", content=system_prompt),
    ] + history

    # 3. Résout le modèle et streame
    resolved = get_provider_for_purpose(conversation.default_purpose or "chat_fast")
    assistant_msg = AIMessage.objects.create(
        conversation=conversation,
        role=AIMessage.Role.ASSISTANT,
        content="",
        page_context=page_context,
        model_used=resolved.model_name,
    )
    yield {
        "type": "assistant_start",
        "message_id": assistant_msg.id,
        "model": resolved.model_name,
    }

    accumulated = ""
    start = time.time()
    input_tokens = 0
    output_tokens = 0
    ok = True
    error_type = ""
    try:
        for chunk in resolved.provider.stream_chat(
            model=resolved.model_name,
            messages=chat_messages,
            temperature=resolved.temperature,
            max_tokens=resolved.max_tokens,
        ):
            if chunk.done:
                input_tokens = chunk.input_tokens
                output_tokens = chunk.output_tokens
                break
            if chunk.delta:
                accumulated += chunk.delta
                yield {"type": "delta", "text": chunk.delta}
    except Exception as exc:  # noqa: BLE001 — on veut la remonter proprement
        ok = False
        error_type = exc.__class__.__name__
        yield {"type": "error", "detail": str(exc)[:280]}

    latency_ms = int((time.time() - start) * 1000)

    # BEST-AI T5 — Détecte un bloc <action>…</action> émis par Claude
    # et le remonte en event SSE dédié pour que le frontend affiche un
    # bouton "Aperçu + Exécuter". On garde le bloc dans le contenu
    # persisté (pour audit/replay) mais on transmet aussi l'action
    # extraite au client.
    action = _extract_action_block(accumulated) if ok else None

    # 4. Persiste la réponse (partielle si erreur)
    assistant_msg.content = accumulated
    assistant_msg.input_tokens = input_tokens
    assistant_msg.output_tokens = output_tokens
    assistant_msg.latency_ms = latency_ms
    assistant_msg.save(
        update_fields=[
            "content",
            "input_tokens",
            "output_tokens",
            "latency_ms",
        ]
    )
    conversation.touch()

    # 5. Usage record + audit
    AIUsageRecord.objects.create(
        user=conversation.user,
        organization_id=conversation.organization_id,
        conversation=conversation,
        provider=resolved.provider_kind,
        model_name=resolved.model_name,
        purpose=resolved.purpose,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        latency_ms=latency_ms,
        ok=ok,
        error_type=error_type,
    )
    AIAuditLog.objects.create(
        user=conversation.user,
        organization_id=conversation.organization_id,
        conversation_id_snapshot=conversation.id,
        kind=AIAuditLog.Kind.PROVIDER_CALL,
        payload={
            "provider": resolved.provider_kind,
            "model": resolved.model_name,
            "purpose": resolved.purpose,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
        },
        ip=request_ip or None,
        ok=ok,
        error_type=error_type,
    )

    # BEST-AI T5 — Émet l'event action_proposed AVANT assistant_done
    # afin que le frontend reçoive l'action tant que la conversation est
    # encore "en cours". Le tool est simplement proposé — l'exécution
    # réelle passe toujours par le flow tools/execute + approval
    # (dispatcher.request_execution).
    if action:
        yield {
            "type": "action_proposed",
            "assistant_message_id": assistant_msg.id,
            "tool": action["tool"],
            "params": action["params"],
        }

    yield {
        "type": "assistant_done",
        "message": {
            "id": assistant_msg.id,
            "role": assistant_msg.role,
            "content": assistant_msg.content,
            "model_used": assistant_msg.model_used,
            "created_at": assistant_msg.created_at.isoformat(),
            "latency_ms": latency_ms,
        },
        "usage": {
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "provider": resolved.provider_kind,
        },
    }


def guess_title_from_first_message(text: str) -> str:
    text = (text or "").strip().replace("\n", " ")
    if not text:
        return f"Conversation du {timezone.now():%d/%m %H:%M}"
    return text[:70] + ("…" if len(text) > 70 else "")
