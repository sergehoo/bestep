/**
 * AIToolApprovalModal.tsx — Modal de confirmation d'action IA (Phase 4).
 *
 * Affiche l'aperçu structuré :
 *   - Summary + level badge (SIMPLE / RENFORCÉE)
 *   - Impact (texte descriptif)
 *   - Éléments concernés (JSON lisible)
 *   - Permissions utilisées (chips)
 *   - Boutons Confirmer / Annuler
 *
 * Utilisation :
 *   <AIToolApprovalModal
 *     approval={approval}
 *     onClose={() => setApproval(null)}
 *     onDone={(res) => afterAction(res)}
 *   />
 */
import { useState } from 'react';
import {
  X,
  ShieldAlert,
  ShieldCheck,
  Check,
  Loader2,
  AlertTriangle,
} from 'lucide-react';

import {
  useAIToolApprovalCancel,
  useAIToolApprovalConfirm,
} from '@/hooks/ai';
import type {
  AIActionApproval,
  AIToolExecuteResponse,
} from '@/lib/ai-types';

interface Props {
  approval: AIActionApproval;
  onClose: () => void;
  onDone?: (result: AIToolExecuteResponse) => void;
}

const LEVEL_META = {
  1: {
    label: 'Confirmation simple',
    tone: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200',
    Icon: ShieldCheck,
  },
  2: {
    label: 'Confirmation renforcée',
    tone: 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200',
    Icon: ShieldAlert,
  },
};

export function AIToolApprovalModal({ approval, onClose, onDone }: Props) {
  const confirmMut = useAIToolApprovalConfirm();
  const cancelMut = useAIToolApprovalCancel();
  const [error, setError] = useState<string>('');

  const level = approval.level as 1 | 2;
  const meta = LEVEL_META[level] || LEVEL_META[1];

  async function handleConfirm() {
    setError('');
    try {
      const res = await confirmMut.mutateAsync(approval.id);
      onDone?.(res);
      onClose();
    } catch (exc) {
      setError((exc as Error).message || 'Échec de la confirmation.');
    }
  }

  async function handleCancel() {
    setError('');
    try {
      const res = await cancelMut.mutateAsync(approval.id);
      onDone?.(res);
      onClose();
    } catch {
      setError('Impossible d’annuler l’approbation.');
    }
  }

  const running = confirmMut.isPending || cancelMut.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-700 overflow-hidden max-h-[90vh] flex flex-col">
        <header className={'flex items-center gap-3 px-5 py-3 border-b border-neutral-100 dark:border-neutral-800 ' + meta.tone}>
          <meta.Icon className="w-5 h-5" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase font-bold tracking-wider opacity-80">
              {meta.label}
            </p>
            <p className="text-sm font-extrabold truncate">
              {approval.summary || approval.tool_key}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-white/40 dark:hover:bg-neutral-900/40 transition"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {approval.impact && (
            <section>
              <p className="text-[11px] font-bold uppercase text-neutral-500 dark:text-neutral-400 mb-1">
                Impact
              </p>
              <p className="text-sm text-neutral-800 dark:text-neutral-200 whitespace-pre-line">
                {approval.impact}
              </p>
            </section>
          )}

          {approval.affected_items?.length > 0 && (
            <section>
              <p className="text-[11px] font-bold uppercase text-neutral-500 dark:text-neutral-400 mb-1">
                Éléments concernés ({approval.affected_items.length})
              </p>
              <ul className="space-y-2">
                {approval.affected_items.map((item, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-neutral-100 dark:border-neutral-800 p-2 bg-neutral-50 dark:bg-neutral-800/50"
                  >
                    <pre className="text-[11px] font-mono text-neutral-700 dark:text-neutral-300 overflow-x-auto whitespace-pre-wrap">
                      {JSON.stringify(item, null, 2)}
                    </pre>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {approval.permissions_used?.length > 0 && (
            <section>
              <p className="text-[11px] font-bold uppercase text-neutral-500 dark:text-neutral-400 mb-1">
                Permissions utilisées
              </p>
              <div className="flex flex-wrap gap-1.5">
                {approval.permissions_used.map((p) => (
                  <code
                    key={p}
                    className="text-[10px] font-mono px-2 py-0.5 rounded bg-primary-50 dark:bg-primary-900/30 text-primary-800 dark:text-primary-200 border border-primary-100 dark:border-primary-800"
                  >
                    {p}
                  </code>
                ))}
              </div>
            </section>
          )}

          {level === 2 && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-900/20 dark:border-rose-800 p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <p className="text-xs text-rose-800 dark:text-rose-200">
                <strong>Action sensible.</strong> Prenez le temps de vérifier
                les éléments concernés ci-dessus avant de confirmer. Cette
                action est journalisée avec votre identité et votre IP.
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-900/20 p-2 text-xs text-rose-800 dark:text-rose-200">
              {error}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-neutral-100 dark:border-neutral-800">
          <button
            type="button"
            onClick={handleCancel}
            disabled={running}
            className="px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition disabled:opacity-60"
          >
            {cancelMut.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'Annuler'
            )}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={running}
            className={
              'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-bold transition disabled:opacity-60 ' +
              (level === 2
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-primary-600 hover:bg-primary-700')
            }
          >
            {confirmMut.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            Confirmer et exécuter
          </button>
        </footer>
      </div>
    </div>
  );
}
