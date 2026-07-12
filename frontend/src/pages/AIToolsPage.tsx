/**
 * AIToolsPage.tsx — Atelier de test des tools IA (Phase 4).
 *
 * Vue de test pour instructeur/admin : liste des tools disponibles,
 * formulaire JSON pour saisir les params, exécution + affichage du
 * résultat ou déclenchement du modal d'approbation si niveau > 0.
 *
 * L'agent conversationnel (Phase 4.5) exposera plus tard ces mêmes
 * tools via l'assistant sans passer par cette page.
 */
import { useMemo, useState } from 'react';
import {
  Wrench,
  Sparkles,
  ShieldAlert,
  ShieldCheck,
  Zap,
  Loader2,
  History,
} from 'lucide-react';

import {
  useAIToolExecute,
  useAIToolExecutions,
  useAITools,
} from '@/hooks/ai';
import type {
  AIActionApproval,
  AIToolDescriptor,
  AIToolExecuteResponse,
} from '@/lib/ai-types';
import { useIsAuthenticated, useAuthUser } from '@/stores/auth';
import { Navigate } from 'react-router-dom';

import { AIToolApprovalModal } from '@/components/ai/AIToolApprovalModal';

const LEVEL_ICON = {
  0: { Icon: Zap, tone: 'text-emerald-600 dark:text-emerald-400', label: 'Auto' },
  1: { Icon: ShieldCheck, tone: 'text-amber-600 dark:text-amber-400', label: 'Simple' },
  2: { Icon: ShieldAlert, tone: 'text-rose-600 dark:text-rose-400', label: 'Renforcée' },
} as const;

export default function AIToolsPage() {
  const isAuth = useIsAuthenticated();
  const user = useAuthUser();
  const { data: tools, isLoading } = useAITools();
  const { data: history } = useAIToolExecutions();
  const execute = useAIToolExecute();

  const [selected, setSelected] = useState<AIToolDescriptor | null>(null);
  const [paramsJson, setParamsJson] = useState('{}');
  const [approval, setApproval] = useState<AIActionApproval | null>(null);
  const [lastResult, setLastResult] = useState<AIToolExecuteResponse | null>(null);
  const [parseError, setParseError] = useState('');

  const isInstructorOrAdmin = useMemo(() => {
    if (!user) return false;
    return (
      user.is_platform_admin ||
      (user.roles && user.roles.some?.((r: string) => r === 'instructor'))
    );
  }, [user]);

  if (!isAuth) return <Navigate to="/login" replace />;
  if (!isInstructorOrAdmin) return <Navigate to="/dashboard" replace />;

  async function runTool() {
    if (!selected) return;
    setParseError('');
    let params: Record<string, unknown> = {};
    try {
      params = JSON.parse(paramsJson || '{}');
    } catch {
      setParseError('JSON invalide.');
      return;
    }
    const res = await execute.mutateAsync({
      tool_key: selected.key,
      params,
    });
    setLastResult(res);
    if (res.status === 'pending_approval' && res.approval) {
      setApproval(res.approval);
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      <header className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300">
          <Wrench className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold text-neutral-900 dark:text-white">
            Atelier des outils Best-AI
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Testez les tools de l'agent Best-AI en direct. Les actions
            sensibles demandent une confirmation.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Liste des tools */}
        <section className="rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-primary-600" />
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-neutral-500">
              Outils disponibles ({tools?.length ?? 0})
            </h2>
          </div>
          {isLoading ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-primary-600" />
            </div>
          ) : (tools?.length ?? 0) === 0 ? (
            <p className="text-sm text-neutral-500 py-6 text-center">
              Aucun tool disponible pour votre rôle.
            </p>
          ) : (
            <ul className="space-y-2">
              {tools!.map((t) => {
                const meta = LEVEL_ICON[t.confirmation_level as 0 | 1 | 2] || LEVEL_ICON[0];
                const active = selected?.key === t.key;
                return (
                  <li key={t.key}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(t);
                        setParamsJson(defaultParamsFor(t));
                      }}
                      className={
                        'w-full text-left rounded-xl p-3 border transition ' +
                        (active
                          ? 'bg-primary-50 dark:bg-primary-900/30 border-primary-300 dark:border-primary-700'
                          : 'bg-white dark:bg-neutral-900 border-neutral-100 dark:border-neutral-800 hover:border-primary-300')
                      }
                    >
                      <div className="flex items-center gap-2">
                        <meta.Icon className={`w-4 h-4 ${meta.tone}`} />
                        <span className="text-sm font-bold text-neutral-900 dark:text-white flex-1">
                          {t.title}
                        </span>
                        <code className="text-[10px] font-mono text-neutral-500 dark:text-neutral-400">
                          {t.key}
                        </code>
                      </div>
                      <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                        {t.description}
                      </p>
                      <div className="mt-1.5 flex items-center gap-1 text-[10px] font-semibold text-neutral-500">
                        {t.allowed_roles.map((r) => (
                          <span
                            key={r}
                            className="px-1.5 rounded bg-neutral-100 dark:bg-neutral-800"
                          >
                            {r}
                          </span>
                        ))}
                        <span className="ml-auto">
                          Confirmation : {meta.label}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Zone d'exécution */}
        <section className="rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-primary-600" />
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-neutral-500">
              Exécution
            </h2>
          </div>

          {!selected ? (
            <p className="text-sm text-neutral-500 py-6 text-center">
              Sélectionnez un outil à gauche.
            </p>
          ) : (
            <>
              <div className="mb-3">
                <p className="text-sm font-bold text-neutral-900 dark:text-white">
                  {selected.title}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  {selected.description}
                </p>
              </div>

              <label className="text-[11px] font-bold uppercase text-neutral-500 dark:text-neutral-400">
                Paramètres (JSON)
              </label>
              <textarea
                value={paramsJson}
                onChange={(e) => setParamsJson(e.target.value)}
                rows={8}
                className="mt-1 w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-mono text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                spellCheck={false}
              />
              {parseError && (
                <p className="mt-1 text-xs text-rose-600">{parseError}</p>
              )}

              <button
                type="button"
                onClick={runTool}
                disabled={execute.isPending}
                className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold transition disabled:opacity-60"
              >
                {execute.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4" />
                )}
                Exécuter
              </button>

              {lastResult && (
                <div className="mt-4 rounded-lg border border-neutral-100 dark:border-neutral-800 p-3 bg-neutral-50 dark:bg-neutral-800/50 text-xs">
                  <p className="text-[10px] font-bold uppercase text-neutral-500 mb-1">
                    Dernier résultat — statut : {lastResult.status}
                  </p>
                  <pre className="font-mono text-neutral-700 dark:text-neutral-300 overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(
                      lastResult.result ?? lastResult.approval ?? lastResult,
                      null,
                      2,
                    )}
                  </pre>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {/* Historique */}
      <section className="rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4">
        <div className="flex items-center gap-2 mb-3">
          <History className="w-4 h-4 text-primary-600" />
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-neutral-500">
            Historique récent
          </h2>
        </div>
        {(history?.results?.length ?? 0) === 0 ? (
          <p className="text-sm text-neutral-500 py-4 text-center">
            Aucune exécution pour l'instant.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {history!.results.slice(0, 10).map((e) => (
              <li key={e.id} className="py-2 flex items-center gap-3 text-xs">
                <code className="font-mono text-neutral-500">#{e.id}</code>
                <span className="font-semibold text-neutral-900 dark:text-white">
                  {e.tool_key}
                </span>
                <StatusBadge status={e.status} />
                <span className="ml-auto text-neutral-500">
                  {new Date(e.created_at).toLocaleString('fr-FR')}
                  {e.latency_ms > 0 && ` · ${e.latency_ms} ms`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {approval && (
        <AIToolApprovalModal
          approval={approval}
          onClose={() => setApproval(null)}
          onDone={(res) => setLastResult(res)}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    SUCCESS: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
    FAILED: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
    CANCELLED: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
    DENIED: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
    PENDING_APPROVAL: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
    RUNNING: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
  };
  return (
    <span
      className={
        'text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ' +
        (map[status] || 'bg-neutral-100 text-neutral-700')
      }
    >
      {status}
    </span>
  );
}

function defaultParamsFor(tool: AIToolDescriptor): string {
  const out: Record<string, unknown> = {};
  const schema = (tool.params_schema || {}) as Record<
    string,
    { type?: string; default?: unknown; required?: boolean }
  >;
  for (const [key, def] of Object.entries(schema)) {
    if (def.default !== undefined) {
      out[key] = def.default;
    } else if (def.required) {
      out[key] = def.type === 'integer' ? 0 : '';
    }
  }
  return JSON.stringify(out, null, 2);
}
