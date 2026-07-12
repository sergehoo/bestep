"""ai.services — orchestration haute niveau.

- Construit le contexte système par utilisateur (rôle, org, page).
- Streame un tour d'assistant en assemblant provider + audit + usage.
- Persiste le message utilisateur avant l'appel, le message assistant
  au fur et à mesure, et boucle sur les erreurs pour ne pas casser
  l'expérience utilisateur.
"""
from __future__ import annotations

import time
from typing import Iterator, List, Optional

from django.utils import timezone

from .models import AIAuditLog, AIConversation, AIMessage, AIUsageRecord
from .permissions import role_bundle
from .providers import ChatMessage, get_provider_for_purpose


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
