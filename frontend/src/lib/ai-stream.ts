/**
 * ai-stream.ts — Client SSE pour /api/ai/conversations/:id/messages/.
 *
 * Utilise `fetch` streamé (ReadableStream) car ``EventSource`` ne
 * permet pas de POST avec body. On lit la réponse ligne à ligne et on
 * parse les évènements ``data: {...}\n\n``.
 *
 * BUG-AI-01 — Le fetch passait par une URL absolue vers http://localhost:8000
 * (VITE_API_URL par défaut), ce qui court-circuitait le proxy Vite et
 * introduisait des problèmes de CORS asymétriques avec le reste du site
 * (axios passe par /api relatif → proxifié → JWT OK). On utilise
 * maintenant l'URL relative en dev par défaut, comme axios.
 */
import type { AIStreamEvent } from './ai-types';

// Si VITE_API_URL est défini explicitement (prod), on l'utilise. Sinon
// URL relative → proxy Vite en dev ('' + '/api' = '/api/…').
const API_URL = import.meta.env.VITE_API_URL || '';
const API_BASE = import.meta.env.VITE_API_BASE || '/api';

// Timeout defensive : si aucun event ne remonte du backend après ce
// délai, on émet un event error pour débloquer l'UI (au lieu de laisser
// "Génération en cours…" tourner à l'infini).
const NO_EVENT_TIMEOUT_MS = 20_000;

// Activable via `localStorage.setItem('best-ai:debug', '1')` pour aider
// au diagnostic (log chaque event SSE reçu).
function debugEnabled(): boolean {
  try {
    return localStorage.getItem('best-ai:debug') === '1';
  } catch {
    return false;
  }
}

function getAccessToken(): string | null {
  try {
    const raw = localStorage.getItem('best-auth');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.state?.access ?? null;
  } catch {
    return null;
  }
}

export interface StreamMessageInput {
  conversationId: number;
  content: string;
  pageContext?: Record<string, unknown>;
  onEvent: (evt: AIStreamEvent) => void;
  signal?: AbortSignal;
}

export async function streamAssistantMessage({
  conversationId,
  content,
  pageContext,
  onEvent,
  signal,
}: StreamMessageInput): Promise<void> {
  const token = getAccessToken();
  const url = `${API_URL}${API_BASE}/ai/conversations/${conversationId}/messages/`;
  const dbg = debugEnabled();

  if (dbg) {
    // eslint-disable-next-line no-console
    console.log('[best-ai] POST', url, { conversationId, contentLen: content.length });
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ content, page_context: pageContext ?? {} }),
      signal,
    });
  } catch (e) {
    if (dbg) {
      // eslint-disable-next-line no-console
      console.error('[best-ai] fetch failed', e);
    }
    onEvent({
      type: 'error',
      detail: `Échec de connexion à Best-AI : ${(e as Error)?.message || 'network error'}`,
    });
    return;
  }

  if (!response.ok || !response.body) {
    // On tente de lire le body d'erreur (JSON ou texte) pour être utile.
    let detail = `HTTP ${response.status} — ${response.statusText}`;
    try {
      const txt = await response.text();
      if (txt) detail += ` · ${txt.slice(0, 200)}`;
    } catch {
      /* ignore */
    }
    if (dbg) {
      // eslint-disable-next-line no-console
      console.error('[best-ai] HTTP error', response.status, detail);
    }
    onEvent({ type: 'error', detail });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let receivedAny = false;

  // Watchdog : si aucun event dans NO_EVENT_TIMEOUT_MS, on abort avec
  // un message explicite. Réarmé à chaque event.
  let watchdog: ReturnType<typeof setTimeout> | null = null;
  const armWatchdog = () => {
    if (watchdog) clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      if (!receivedAny) {
        if (dbg) {
          // eslint-disable-next-line no-console
          console.warn('[best-ai] no SSE event received after', NO_EVENT_TIMEOUT_MS, 'ms');
        }
        onEvent({
          type: 'error',
          detail:
            "Best-AI n'a envoyé aucun événement dans le délai imparti. " +
            'Vérifie que le backend est démarré et que le provider IA est configuré ' +
            '(admin → IA → Providers, ou ANTHROPIC_API_KEY dans .env).',
        });
        try {
          reader.cancel();
        } catch {
          /* ignore */
        }
      }
    }, NO_EVENT_TIMEOUT_MS);
  };
  armWatchdog();

  try {
    // Boucle de lecture
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // Split par double newline (délimiteur SSE)
      let idx = buffer.indexOf('\n\n');
      while (idx >= 0) {
        const rawEvent = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        idx = buffer.indexOf('\n\n');

        // Un event peut contenir plusieurs lignes ; on cherche `data:`
        const dataLines = rawEvent
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trim())
          .filter(Boolean);
        if (!dataLines.length) continue;
        const payload = dataLines.join('\n');
        try {
          const parsed = JSON.parse(payload) as AIStreamEvent;
          receivedAny = true;
          armWatchdog();
          if (dbg) {
            // eslint-disable-next-line no-console
            console.log('[best-ai] event', parsed);
          }
          onEvent(parsed);
        } catch (e) {
          if (dbg) {
            // eslint-disable-next-line no-console
            console.warn('[best-ai] malformed chunk', payload, e);
          }
        }
      }
    }
  } finally {
    if (watchdog) clearTimeout(watchdog);
  }
}
