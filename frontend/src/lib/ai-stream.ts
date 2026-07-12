/**
 * ai-stream.ts — Client SSE pour /api/ai/conversations/:id/messages/.
 *
 * Utilise `fetch` streamé (ReadableStream) car ``EventSource`` ne
 * permet pas de POST avec body. On lit la réponse ligne à ligne et on
 * parse les évènements ``data: {...}\n\n``.
 */
import type { AIStreamEvent } from './ai-types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const API_BASE = import.meta.env.VITE_API_BASE || '/api';

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

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ content, page_context: pageContext ?? {} }),
    signal,
  });

  if (!response.ok || !response.body) {
    onEvent({
      type: 'error',
      detail: `HTTP ${response.status} — ${response.statusText}`,
    });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

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
        onEvent(parsed);
      } catch {
        // ignore malformed chunk
      }
    }
  }
}
