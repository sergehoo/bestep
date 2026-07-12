/**
 * AITextTransformMenu.tsx — Menu d'actions IA sur du texte (Phase 3).
 *
 * Utilisation type dans un éditeur WYSIWYG :
 *   const { text, replaceSelection } = useEditorSelection();
 *   <AITextTransformMenu
 *     selectedText={text}
 *     context={{ course_title, lesson_title, level }}
 *     onInsert={(newText) => replaceSelection(newText)}
 *   />
 *
 * Le composant est autonome — il gère l'appel API + l'aperçu du
 * résultat + les 3 actions (Insérer / Régénérer / Annuler).
 */
import { useMemo, useState } from 'react';
import {
  Sparkles,
  Loader2,
  Check,
  X,
  RefreshCw,
  ChevronDown,
} from 'lucide-react';

import {
  useAITextTransformActions,
  useTextTransform,
} from '@/hooks/ai';
import type {
  AITextAction,
  AITextTransformResult,
} from '@/lib/ai-types';
import { AIMessageRenderer } from './AIMessageRenderer';

interface Props {
  selectedText: string;
  context?: Record<string, unknown>;
  onInsert: (newText: string) => void;
  compact?: boolean;
}

// Regroupement UX des actions
const GROUPS: Array<{
  label: string;
  actions: AITextAction[];
}> = [
  {
    label: 'Rédaction',
    actions: ['write', 'continue', 'expand', 'summarize'],
  },
  {
    label: 'Améliorer',
    actions: ['improve', 'correct', 'reformulate', 'simplify', 'professional'],
  },
  {
    label: 'Format',
    actions: ['to_list', 'to_table'],
  },
  {
    label: 'Pédagogie',
    actions: ['example', 'case_study', 'exercise'],
  },
  {
    label: 'Adapter',
    actions: ['adapt_beginner', 'adapt_intermediate', 'adapt_advanced', 'translate'],
  },
];

export function AITextTransformMenu({
  selectedText,
  context,
  onInsert,
  compact = false,
}: Props) {
  const { data: actions } = useAITextTransformActions();
  const transform = useTextTransform();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<AITextTransformResult | null>(null);
  const [lastAction, setLastAction] = useState<AITextAction | null>(null);
  const [targetLang, setTargetLang] = useState('en');

  const labelByAction = useMemo(() => {
    const m = new Map<AITextAction, string>();
    (actions || []).forEach((a) => m.set(a.key, a.label));
    return m;
  }, [actions]);

  async function run(action: AITextAction) {
    setLastAction(action);
    setOpen(false);
    try {
      const res = await transform.mutateAsync({
        action,
        text: selectedText,
        context: context ?? {},
        target_language: action === 'translate' ? targetLang : undefined,
      });
      setPreview(res);
    } catch {
      setPreview(null);
    }
  }

  function insertAndClose() {
    if (!preview) return;
    onInsert(preview.result);
    setPreview(null);
    setLastAction(null);
  }

  const disabled = !selectedText.trim();

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled || transform.isPending}
        className={
          'inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold transition ' +
          (disabled
            ? 'opacity-40 cursor-not-allowed bg-neutral-100 dark:bg-neutral-800 text-neutral-500'
            : 'bg-primary-600 hover:bg-primary-700 text-white shadow-sm')
        }
        title={
          disabled
            ? 'Sélectionnez du texte pour activer l\'IA'
            : 'Actions IA sur la sélection'
        }
      >
        {transform.isPending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Sparkles className="w-3.5 h-3.5" />
        )}
        {compact ? 'IA' : 'Actions IA'}
        <ChevronDown className="w-3 h-3" />
      </button>

      {open && (
        <div className="absolute z-40 mt-1 right-0 w-64 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl overflow-hidden">
          <div className="max-h-80 overflow-y-auto py-1">
            {GROUPS.map((g) => (
              <div key={g.label}>
                <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                  {g.label}
                </p>
                <ul>
                  {g.actions.map((key) => (
                    <li key={key}>
                      <button
                        type="button"
                        onClick={() => run(key)}
                        className="w-full text-left px-3 py-1.5 text-xs text-neutral-800 dark:text-neutral-200 hover:bg-primary-50 dark:hover:bg-primary-900/30 transition"
                      >
                        {labelByAction.get(key) || key}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="px-3 py-2 border-t border-neutral-100 dark:border-neutral-800 flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase text-neutral-500 dark:text-neutral-400">
                Traduire →
              </span>
              <select
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value)}
                className="text-xs px-1 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
              >
                <option value="en">Anglais</option>
                <option value="fr">Français</option>
                <option value="es">Espagnol</option>
                <option value="de">Allemand</option>
                <option value="ar">Arabe</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-700 overflow-hidden max-h-[85vh] flex flex-col">
            <header className="flex items-center gap-2 px-5 py-3 border-b border-neutral-100 dark:border-neutral-800">
              <Sparkles className="w-4 h-4 text-primary-600" />
              <p className="text-sm font-extrabold text-neutral-900 dark:text-white">
                Aperçu — {preview.label}
              </p>
              <span className="ml-2 text-[10px] text-neutral-500">
                {preview.model_used} · {preview.output_tokens} tokens
              </span>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="ml-auto p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
                aria-label="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <p className="text-[11px] font-bold uppercase text-neutral-500 mb-1">
                  Texte source
                </p>
                <div className="text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700 rounded-lg p-3 text-neutral-700 dark:text-neutral-300 max-h-40 overflow-y-auto">
                  {selectedText}
                </div>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase text-primary-700 dark:text-primary-300 mb-1">
                  Résultat IA
                </p>
                <div className="rounded-lg border border-primary-100 dark:border-primary-800 bg-primary-50/40 dark:bg-primary-900/20 p-3">
                  <AIMessageRenderer content={preview.result} />
                </div>
              </div>
            </div>
            <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-neutral-100 dark:border-neutral-800">
              <button
                type="button"
                onClick={() => lastAction && run(lastAction)}
                disabled={transform.isPending}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition disabled:opacity-60"
              >
                <RefreshCw className={`w-4 h-4 ${transform.isPending ? 'animate-spin' : ''}`} />
                Régénérer
              </button>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={insertAndClose}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold transition"
              >
                <Check className="w-4 h-4" />
                Insérer
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
