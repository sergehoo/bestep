/**
 * AIAssistantPanel.tsx — Panneau IA global (Phase 1).
 *
 * - Side panel à droite en mode compact, plein écran en mode expandu.
 * - Liste des conversations + composition + streaming des deltas.
 * - Contexte de page envoyé automatiquement à chaque message.
 * - Feedback +/- sur chaque réponse assistant.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  X,
  Maximize2,
  Minimize2,
  Send,
  Plus,
  Trash2,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  Copy,
  Check,
  Sparkles,
  Loader2,
  StopCircle,
} from 'lucide-react';

import { useQueryClient } from '@tanstack/react-query';
import {
  useAIConfig,
  useAIConversationDetail,
  useAIConversations,
  useAIFeedback,
  useCreateAIConversation,
  useDeleteAIConversation,
} from '@/hooks/ai';
import { streamAssistantMessage } from '@/lib/ai-stream';
import type { AIMessage, AIStreamEvent } from '@/lib/ai-types';
import { useAIPanel } from '@/stores/ai';
import { useAuthUser, useIsAuthenticated } from '@/stores/auth';
import { AIMessageRenderer } from './AIMessageRenderer';

// ─────────────────────────────────────────────────────────────
// Root panel
// ─────────────────────────────────────────────────────────────

export function AIAssistantPanel() {
  const isAuth = useIsAuthenticated();
  const user = useAuthUser();
  const isActive = user?.is_active !== false;
  const { isOpen, isFullscreen, activeConversationId, close, setFullscreen, setActiveConversation } =
    useAIPanel();

  const qc = useQueryClient();
  const { data: config } = useAIConfig();
  const { data: convList } = useAIConversations();
  const { data: active } = useAIConversationDetail(activeConversationId ?? null);
  const createMut = useCreateAIConversation();
  const deleteMut = useDeleteAIConversation();

  const location = useLocation();
  const pageContext = useMemo(
    () => ({
      route: location.pathname,
      search: location.search || '',
    }),
    [location.pathname, location.search],
  );

  // Streaming state (transient, hors TanStack)
  const [streaming, setStreaming] = useState<{
    assistantMessageId: number | null;
    text: string;
    running: boolean;
  }>({ assistantMessageId: null, text: '', running: false });
  const [error, setError] = useState<string>('');
  const abortRef = useRef<AbortController | null>(null);
  // BEST-AI T5 — Actions proposées par Claude (tool use). Keyed par
  // assistant_message_id pour associer le CTA à la bonne bulle.
  const [pendingActions, setPendingActions] = useState<
    Record<number, { tool: string; params: Record<string, unknown> }>
  >({});
  // Feedback UI par action (loading / ok / erreur).
  const [actionFlash, setActionFlash] = useState<
    Record<number, { kind: 'loading' | 'ok' | 'err'; msg: string }>
  >({});

  // Sélectionne automatiquement la conversation la plus récente à l'ouverture.
  useEffect(() => {
    if (!isOpen || activeConversationId) return;
    const first = convList?.results?.[0];
    if (first) setActiveConversation(first.id);
  }, [isOpen, activeConversationId, convList, setActiveConversation]);

  async function handleNewConversation() {
    const created = await createMut.mutateAsync({
      title: 'Nouvelle conversation',
      default_purpose: config?.default_purpose ?? 'chat_fast',
      context: pageContext,
    });
    setActiveConversation(created.id);
  }

  async function handleDelete(id: number) {
    if (!confirm('Supprimer cette conversation ?')) return;
    await deleteMut.mutateAsync(id);
    if (activeConversationId === id) setActiveConversation(null);
  }

  async function handleSend(content: string) {
    if (!content.trim() || streaming.running) return;
    setError('');
    let conversationId = activeConversationId;
    if (!conversationId) {
      const created = await createMut.mutateAsync({
        title: content.slice(0, 60),
        default_purpose: config?.default_purpose ?? 'chat_fast',
        context: pageContext,
      });
      conversationId = created.id;
      setActiveConversation(created.id);
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming({ assistantMessageId: null, text: '', running: true });

    // BUG-AI-04 — Injection optimiste du message utilisateur dans le
    // cache TanStack pour un rendu immédiat (avant même que le stream
    // remonte le premier event). Sans ça, l'utilisateur ne voit rien
    // pendant plusieurs secondes ("chat qui n'affiche rien").
    const tempUserId = -Date.now(); // id transitoire négatif
    const nowIso = new Date().toISOString();
    qc.setQueryData(['ai-conversation', conversationId], (prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        messages: [
          ...(prev.messages ?? []),
          {
            id: tempUserId,
            role: 'user',
            content,
            created_at: nowIso,
            page_context: pageContext,
            model_used: '',
            input_tokens: 0,
            output_tokens: 0,
            latency_ms: 0,
            feedback_score: 0,
            feedback_note: '',
          },
        ],
      };
    });

    // Ref locale pour accumuler le texte assistant tout au long du
    // stream (setStreaming state est trop lent pour être lisible
    // depuis onEvent — on lit s.text via callback à chaque delta).
    await streamAssistantMessage({
      conversationId: conversationId!,
      content,
      pageContext,
      signal: controller.signal,
      onEvent: (evt: AIStreamEvent) => {
        if (evt.type === 'assistant_start') {
          setStreaming({
            assistantMessageId: evt.message_id,
            text: '',
            running: true,
          });
        } else if (evt.type === 'delta') {
          setStreaming((s) => ({ ...s, text: s.text + evt.text }));
        } else if (evt.type === 'action_proposed') {
          // BEST-AI T5 — Claude propose l'exécution d'un tool. On mémorise
          // l'action ; le rendu s'active dans MessageBubble via pendingActions.
          setPendingActions((prev) => ({
            ...prev,
            [evt.assistant_message_id]: { tool: evt.tool, params: evt.params },
          }));
        } else if (evt.type === 'assistant_done') {
          setStreaming({ assistantMessageId: null, text: '', running: false });
          // BUG-AI-04 — On invalide la conversation détail pour que le
          // dernier message assistant persisté (avec model_used,
          // input_tokens, latency_ms…) remplace notre placeholder.
          qc.invalidateQueries({
            queryKey: ['ai-conversation', conversationId],
          });
          // La liste des conversations aussi (titre auto-généré,
          // last_message_at, unread_count, etc.).
          qc.invalidateQueries({ queryKey: ['ai-conversations'] });
        } else if (evt.type === 'error') {
          setError(evt.detail || 'Erreur lors de la génération.');
          setStreaming({ assistantMessageId: null, text: '', running: false });
          // En cas d'erreur, invalider aussi pour resynchroniser le
          // cache avec ce que le backend a réellement persisté.
          qc.invalidateQueries({
            queryKey: ['ai-conversation', conversationId],
          });
        }
      },
    }).catch((err) => {
      if (err?.name !== 'AbortError') {
        setError('Connexion interrompue.');
      }
      setStreaming({ assistantMessageId: null, text: '', running: false });
      // Best-effort resync même en cas d'exception.
      qc.invalidateQueries({
        queryKey: ['ai-conversation', conversationId],
      });
    });

    abortRef.current = null;
  }

  // BEST-AI T5 — Exécute un tool proposé par Claude. On enchaîne :
  //   1) POST /api/ai/tools/execute/ → crée une AIActionApproval
  //      (le dispatcher préview → détermine si approval requise)
  //   2) POST /api/ai/tools/approvals/<id>/confirm/ → exécute vraiment
  //
  // Pour l'utilisateur, le flow est atomique : un clic sur "Exécuter"
  // lance l'action ; l'approbation est immédiatement confirmée par le
  // même user (déjà authentifié) — c'est l'équivalent d'un "confirm
  // now" dans le modal d'approbation existant.
  async function handleExecuteAction(assistantMessageId: number) {
    const action = pendingActions[assistantMessageId];
    if (!action) return;
    setActionFlash((p) => ({
      ...p,
      [assistantMessageId]: { kind: 'loading', msg: 'Exécution en cours…' },
    }));
    try {
      const { data: exec } = await (
        await import('@/lib/api')
      ).default.post<{
        status?: string;
        approval_id?: number | null;
        result?: { ok: boolean; detail: string; data?: Record<string, unknown> } | null;
        requires_approval?: boolean;
      }>(
        '/ai/tools/execute/',
        // Backend attend `tool_key` (voir ExecuteToolInput). On envoie
        // aussi les params + conversation_id pour audit trail.
        {
          tool_key: action.tool,
          params: action.params,
          conversation_id: activeConversationId,
        },
      );
      let ok = exec.result?.ok ?? false;
      let detail = exec.result?.detail || '';
      let data = exec.result?.data || {};
      // Si l'action requiert une approbation explicite, on la confirme
      // immédiatement (le user a déjà cliqué "Exécuter").
      if (exec.requires_approval && exec.approval_id != null) {
        const { data: confirmed } = await (
          await import('@/lib/api')
        ).default.post<{ result: { ok: boolean; detail: string; data?: Record<string, unknown> } }>(
          `/ai/tools/approvals/${exec.approval_id}/confirm/`,
        );
        ok = confirmed.result?.ok ?? false;
        detail = confirmed.result?.detail || detail;
        data = confirmed.result?.data || data;
      }
      setActionFlash((p) => ({
        ...p,
        [assistantMessageId]: {
          kind: ok ? 'ok' : 'err',
          msg: detail || (ok ? 'Action exécutée.' : "Échec de l'exécution."),
        },
      }));
      // Retire l'action pending si succès (pour ne pas re-cliquer).
      if (ok) {
        setPendingActions((p) => {
          const copy = { ...p };
          delete copy[assistantMessageId];
          return copy;
        });
        // Optionnel : si l'action retourne une edit_url, on peut proposer
        // un lien direct — géré dans l'affichage flash.
        if (data?.edit_url) {
          setActionFlash((p) => ({
            ...p,
            [assistantMessageId]: {
              kind: 'ok',
              msg: `${detail} · Voir : ${data.edit_url}`,
            },
          }));
        }
      }
    } catch (e) {
      const anyErr = e as { response?: { data?: { detail?: string } }; message?: string };
      setActionFlash((p) => ({
        ...p,
        [assistantMessageId]: {
          kind: 'err',
          msg:
            anyErr?.response?.data?.detail
            || anyErr?.message
            || "Échec de l'appel serveur.",
        },
      }));
    }
  }

  function handleAbort() {
    abortRef.current?.abort();
    setStreaming({ assistantMessageId: null, text: '', running: false });
    // BUG-AI-04 — Après abort utilisateur, le backend a peut-être
    // persisté une réponse partielle : on resynchronise le cache pour
    // éviter que les messages restent invisibles jusqu'au prochain
    // refresh manuel de la page.
    if (activeConversationId) {
      qc.invalidateQueries({
        queryKey: ['ai-conversation', activeConversationId],
      });
    }
  }

  // Best-AI est strictement réservé aux utilisateurs authentifiés + actifs.
  if (!isAuth || !isActive || !isOpen) return null;

  return (
    <div
      // UX-08 — Élargi de 420 → 520px en mode réduit pour que les
      // tableaux markdown ne débordent plus (overflow-x-auto reste pour
      // les tables très larges). Max 92vw sur petits écrans.
      className={
        'fixed z-50 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xl flex flex-col ' +
        (isFullscreen
          ? 'inset-4 rounded-2xl'
          : 'right-4 bottom-4 top-16 w-[min(520px,92vw)] rounded-2xl')
      }
      role="dialog"
      aria-label="Best-AI"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-100 dark:border-neutral-800">
        <Sparkles className="w-5 h-5 text-primary-600" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-extrabold text-neutral-900 dark:text-white truncate">
            Best-AI
          </p>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
            {active?.title ?? 'Nouvelle conversation'}
            {pageContext.route ? ` · ${pageContext.route}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFullscreen(!isFullscreen)}
          className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
          aria-label={isFullscreen ? 'Réduire' : 'Agrandir'}
        >
          {isFullscreen ? (
            <Minimize2 className="w-4 h-4" />
          ) : (
            <Maximize2 className="w-4 h-4" />
          )}
        </button>
        <button
          type="button"
          onClick={close}
          className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
          aria-label="Fermer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className={'flex-1 min-h-0 flex ' + (isFullscreen ? 'flex-row' : 'flex-col')}>
        {/* Liste des conversations */}
        {isFullscreen && (
          <aside className="w-64 border-r border-neutral-100 dark:border-neutral-800 flex flex-col">
            <ConversationSidebar
              activeId={activeConversationId}
              onSelect={(id) => setActiveConversation(id)}
              onNew={handleNewConversation}
              onDelete={handleDelete}
            />
          </aside>
        )}

        {/* Zone conversation */}
        <div className="flex-1 min-w-0 flex flex-col">
          {!isFullscreen && (
            <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-100 dark:border-neutral-800">
              <button
                type="button"
                onClick={handleNewConversation}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                Nouvelle
              </button>
              <select
                value={activeConversationId ?? ''}
                onChange={(e) =>
                  setActiveConversation(
                    e.target.value ? Number(e.target.value) : null,
                  )
                }
                className="text-xs bg-transparent text-neutral-700 dark:text-neutral-300 focus:outline-none max-w-[220px] truncate"
              >
                <option value="">— Historique —</option>
                {(convList?.results ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title.slice(0, 40)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <MessagesArea
            active={active}
            streamingText={streaming.text}
            streamingRunning={streaming.running}
            error={error}
            pendingActions={pendingActions}
            actionFlash={actionFlash}
            onExecuteAction={handleExecuteAction}
          />

          <Composer
            onSend={handleSend}
            onAbort={handleAbort}
            running={streaming.running}
          />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sidebar conversations
// ─────────────────────────────────────────────────────────────

function ConversationSidebar({
  activeId,
  onSelect,
  onNew,
  onDelete,
}: {
  activeId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
  onDelete: (id: number) => void;
}) {
  const { data } = useAIConversations();
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const list = data?.results ?? [];
    if (!q.trim()) return list;
    const needle = q.toLowerCase();
    return list.filter((c) => c.title.toLowerCase().includes(needle));
  }, [data, q]);

  return (
    <>
      <div className="p-2 border-b border-neutral-100 dark:border-neutral-800 flex flex-col gap-1">
        <button
          type="button"
          onClick={onNew}
          className="w-full inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold transition"
        >
          <Plus className="w-3.5 h-3.5" />
          Nouvelle conversation
        </button>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher…"
          className="w-full px-2 py-1.5 text-xs rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>
      <ul className="flex-1 overflow-y-auto py-2 space-y-0.5">
        {filtered.length === 0 && (
          <li className="px-3 py-4 text-xs text-neutral-500 text-center">
            Aucune conversation.
          </li>
        )}
        {filtered.map((c) => (
          <li
            key={c.id}
            className={
              'group flex items-center gap-1 px-2 mx-1 rounded-lg cursor-pointer ' +
              (c.id === activeId
                ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-800 dark:text-primary-200'
                : 'hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300')
            }
          >
            <button
              type="button"
              onClick={() => onSelect(c.id)}
              className="flex-1 min-w-0 text-left py-1.5 flex items-center gap-2"
            >
              <MessageSquare className="w-3.5 h-3.5 shrink-0" />
              <span className="text-xs font-semibold truncate">{c.title}</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(c.id);
              }}
              className="p-1 rounded hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 opacity-0 group-hover:opacity-100 transition"
              aria-label="Supprimer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Messages area
// ─────────────────────────────────────────────────────────────

function MessagesArea({
  active,
  streamingText,
  streamingRunning,
  error,
  pendingActions,
  actionFlash,
  onExecuteAction,
}: {
  active: ReturnType<typeof useAIConversationDetail>['data'];
  streamingText: string;
  streamingRunning: boolean;
  error: string;
  pendingActions: Record<number, { tool: string; params: Record<string, unknown> }>;
  actionFlash: Record<number, { kind: 'loading' | 'ok' | 'err'; msg: string }>;
  onExecuteAction: (assistantMessageId: number) => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [active?.messages?.length, streamingText, error]);

  const messages = active?.messages ?? [];

  if (messages.length === 0 && !streamingRunning) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <div className="rounded-xl border border-dashed border-neutral-200 dark:border-neutral-700 p-4">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Bonjour ! Je suis <strong>Best-AI</strong>, l'assistant officiel
            de Best-Épargne. Posez-moi une question sur la page actuelle,
            demandez un plan de formation, une explication ou une
            recommandation.
          </p>
        </div>
        <div ref={bottomRef} />
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
      {messages.map((m) => (
        <MessageBubble
          key={m.id}
          message={m}
          conversationId={active?.id ?? 0}
          pendingAction={pendingActions[m.id]}
          actionFlash={actionFlash[m.id]}
          onExecuteAction={() => onExecuteAction(m.id)}
        />
      ))}
      {streamingRunning && (
        <div className="rounded-xl bg-neutral-50 dark:bg-neutral-800/60 p-3">
          <div className="flex items-center gap-2 mb-1 text-[11px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
            <Sparkles className="w-3.5 h-3.5" />
            Best-AI
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          </div>
          {streamingText ? (
            <AIMessageRenderer content={streamingText} />
          ) : (
            <p className="text-xs text-neutral-400 italic">
              Génération en cours…
            </p>
          )}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-900/20 dark:border-rose-800 p-3 text-sm text-rose-800 dark:text-rose-200">
          {error}
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Bubble unique
// ─────────────────────────────────────────────────────────────

function MessageBubble({
  message,
  conversationId,
  pendingAction,
  actionFlash,
  onExecuteAction,
}: {
  message: AIMessage;
  conversationId: number;
  pendingAction?: { tool: string; params: Record<string, unknown> };
  actionFlash?: { kind: 'loading' | 'ok' | 'err'; msg: string };
  onExecuteAction?: () => void;
}) {
  const feedback = useAIFeedback();
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  async function copy() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard indispo */
    }
  }

  return (
    <div
      className={
        'rounded-xl p-3 ' +
        // UX-08 — Marge gauche/droite réduite pour laisser plus de largeur
        // aux tableaux et blocs de code dans le panel compact.
        (isUser
          ? 'bg-primary-50 dark:bg-primary-900/20 ml-4'
          : 'bg-neutral-50 dark:bg-neutral-800/60 mr-4')
      }
    >
      <div className="flex items-center gap-2 mb-1 text-[11px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
        {isUser ? (
          'Vous'
        ) : (
          <>
            <Sparkles className="w-3.5 h-3.5" />
            Best-AI
            {message.model_used && (
              <span className="ml-1 font-normal normal-case">
                · {message.model_used}
              </span>
            )}
          </>
        )}
      </div>
      <AIMessageRenderer content={message.content} />
      {/* BEST-AI T5 — Action proposée par Claude : bouton d'exécution. */}
      {!isUser && (pendingAction || actionFlash) && (
        <div className="mt-3 rounded-lg border border-primary-200 dark:border-primary-800 bg-primary-50/60 dark:bg-primary-900/20 p-3">
          {pendingAction && !actionFlash?.kind && (
            <>
              <p className="text-xs font-bold text-primary-800 dark:text-primary-200 mb-1">
                Action proposée
              </p>
              <p className="text-xs text-neutral-600 dark:text-neutral-400 mb-2">
                Best-AI peut exécuter directement l'action{' '}
                <code className="text-[11px] px-1 py-0.5 rounded bg-white dark:bg-neutral-800 font-mono">
                  {pendingAction.tool}
                </code>{' '}
                sur le serveur. Vérifiez le contenu proposé, puis cliquez
                pour l'exécuter.
              </p>
              <button
                type="button"
                onClick={() => onExecuteAction?.()}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold transition"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Exécuter l'action
              </button>
            </>
          )}
          {actionFlash?.kind === 'loading' && (
            <p className="inline-flex items-center gap-2 text-xs text-primary-800 dark:text-primary-200">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {actionFlash.msg}
            </p>
          )}
          {actionFlash?.kind === 'ok' && (
            <p className="text-xs text-emerald-700 dark:text-emerald-300">
              <Check className="inline w-3.5 h-3.5 mr-1" />
              {actionFlash.msg}
            </p>
          )}
          {actionFlash?.kind === 'err' && (
            <p className="text-xs text-rose-700 dark:text-rose-300">{actionFlash.msg}</p>
          )}
        </div>
      )}
      {!isUser && (
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={copy}
            className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-500 transition"
            aria-label="Copier"
            title="Copier"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() =>
              feedback.mutate({
                messageId: message.id,
                conversationId,
                score: message.feedback_score === 1 ? 0 : 1,
              })
            }
            className={
              'p-1 rounded transition ' +
              (message.feedback_score === 1
                ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30'
                : 'text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700')
            }
            aria-label="Utile"
            title="Utile"
          >
            <ThumbsUp className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() =>
              feedback.mutate({
                messageId: message.id,
                conversationId,
                score: message.feedback_score === -1 ? 0 : -1,
              })
            }
            className={
              'p-1 rounded transition ' +
              (message.feedback_score === -1
                ? 'text-rose-600 bg-rose-50 dark:bg-rose-900/30'
                : 'text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700')
            }
            aria-label="Pas utile"
            title="Pas utile"
          >
            <ThumbsDown className="w-3.5 h-3.5" />
          </button>
          {typeof message.latency_ms === 'number' && message.latency_ms > 0 && (
            <span className="ml-auto text-[10px] text-neutral-400">
              {message.latency_ms} ms · {message.output_tokens ?? 0} tokens
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Composer
// ─────────────────────────────────────────────────────────────

function Composer({
  onSend,
  onAbort,
  running,
}: {
  onSend: (text: string) => void;
  onAbort: () => void;
  running: boolean;
}) {
  const [text, setText] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);

  function submit() {
    const t = text.trim();
    if (!t || running) return;
    onSend(t);
    setText('');
  }

  return (
    <div className="border-t border-neutral-100 dark:border-neutral-800 p-3">
      <div className="flex items-end gap-2">
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Posez votre question… (Entrée pour envoyer, Shift+Entrée pour retour ligne)"
          rows={2}
          className="flex-1 min-h-[48px] max-h-32 resize-none px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        {running ? (
          <button
            type="button"
            onClick={onAbort}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold transition"
          >
            <StopCircle className="w-4 h-4" />
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!text.trim()}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold transition"
          >
            <Send className="w-4 h-4" />
            Envoyer
          </button>
        )}
      </div>
    </div>
  );
}
