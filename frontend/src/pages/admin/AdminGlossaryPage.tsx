/**
 * AdminGlossaryPage.tsx — /admin/lexique.
 *
 * Modération : liste tous les termes (tous statuts) avec actions
 * valider / rejeter / fusionner. Filtres par statut, portée, recherche.
 */
import { useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  GitMerge,
  Search,
  Filter,
  Download,
  Upload,
  X,
} from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { Spinner } from '@/components/ui/Spinner';
import {
  useAdminGlossaryTerms,
  useImportGlossary,
  useMergeGlossaryTerms,
  useRejectGlossaryTerm,
  useValidateGlossaryTerm,
  buildExportUrl,
  type ImportReport,
} from '@/hooks/glossary';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Brouillon',
  pending: 'En attente',
  validated: 'Validé',
  rejected: 'Rejeté',
  archived: 'Archivé',
};
const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-neutral-200 text-neutral-700',
  pending: 'bg-amber-100 text-amber-800',
  validated: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-rose-100 text-rose-800',
  archived: 'bg-neutral-100 text-neutral-500',
};

interface ImportDialogState {
  open: boolean;
  file: File | null;
  format: 'csv' | 'json';
  step: 'select' | 'preview' | 'done';
  report: ImportReport | null;
}

function ImportDialog({
  state,
  setState,
}: {
  state: ImportDialogState;
  setState: (updater: (s: ImportDialogState) => ImportDialogState) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importMut = useImportGlossary();

  const close = () => setState((s) => ({ ...s, open: false, step: 'select', report: null, file: null }));

  const runDryRun = async () => {
    if (!state.file) return;
    const data = await importMut.mutateAsync({
      file: state.file,
      format: state.format,
      dryRun: true,
    });
    setState((s) => ({ ...s, step: 'preview', report: data.report }));
  };

  const runImport = async () => {
    if (!state.file) return;
    const data = await importMut.mutateAsync({
      file: state.file,
      format: state.format,
      dryRun: false,
    });
    setState((s) => ({ ...s, step: 'done', report: data.report }));
  };

  if (!state.open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/60 p-4"
      role="dialog"
      aria-modal="true"
      onClick={close}
    >
      <div
        className="w-full max-w-3xl bg-white dark:bg-neutral-900 rounded-2xl shadow-lift overflow-y-auto max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-4 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-neutral-900 dark:text-white flex items-center gap-2">
            <Upload className="w-5 h-5 text-primary-600" /> Importer des termes
          </h2>
          <button onClick={close} className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800" aria-label="Fermer">
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className="p-5 text-sm space-y-4">
          {state.step === 'select' && (
            <>
              <p className="text-neutral-600 dark:text-neutral-400 text-xs">
                Format CSV : colonnes <code className="text-[11px]">Terme; Définition
                courte; Définition complète; Catégorie; Synonymes; Exemple; Portée;
                Statut; Domaine; Niveau</code>. Format JSON : liste d'objets ou
                <code className="text-[11px]"> {'{"terms": [...]}'}</code>.
              </p>
              <div className="flex items-center gap-3">
                <select
                  value={state.format}
                  onChange={(e) =>
                    setState((s) => ({ ...s, format: e.target.value as 'csv' | 'json' }))
                  }
                  className="px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 dark:text-white text-sm"
                >
                  <option value="csv">CSV</option>
                  <option value="json">JSON</option>
                </select>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={state.format === 'csv' ? '.csv,text/csv' : '.json,application/json'}
                  onChange={(e) =>
                    setState((s) => ({ ...s, file: e.target.files?.[0] ?? null }))
                  }
                  className="flex-1 text-sm"
                />
              </div>
              <button
                onClick={runDryRun}
                disabled={!state.file || importMut.isPending}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-bold"
              >
                {importMut.isPending ? 'Analyse…' : 'Analyser le fichier (dry-run)'}
              </button>
            </>
          )}

          {state.step === 'preview' && state.report && (
            <>
              <div className="grid grid-cols-4 gap-3 text-center">
                <div className="p-3 rounded-lg bg-neutral-100 dark:bg-neutral-800">
                  <p className="text-2xl font-extrabold">{state.report.total_rows}</p>
                  <p className="text-xs text-neutral-500">Lignes</p>
                </div>
                <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300">
                  <p className="text-2xl font-extrabold">{state.report.created}</p>
                  <p className="text-xs">À créer</p>
                </div>
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300">
                  <p className="text-2xl font-extrabold">{state.report.skipped}</p>
                  <p className="text-xs">Doublons</p>
                </div>
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300">
                  <p className="text-2xl font-extrabold">{state.report.errors}</p>
                  <p className="text-xs">Erreurs</p>
                </div>
              </div>

              <div className="max-h-72 overflow-y-auto border border-neutral-200 dark:border-neutral-800 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-neutral-50 dark:bg-neutral-800/50 sticky top-0">
                    <tr>
                      <th className="text-left px-2 py-1.5">Ligne</th>
                      <th className="text-left px-2 py-1.5">Terme</th>
                      <th className="text-left px-2 py-1.5">Action</th>
                      <th className="text-left px-2 py-1.5">Détail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.report.rows.slice(0, 300).map((r, i) => (
                      <tr key={i} className="border-t border-neutral-100 dark:border-neutral-800">
                        <td className="px-2 py-1 text-neutral-400">{r.line}</td>
                        <td className="px-2 py-1 font-semibold">{r.word || '—'}</td>
                        <td className="px-2 py-1">
                          <span
                            className={
                              'px-1.5 py-0.5 rounded text-[10px] font-bold ' +
                              (r.action === 'created'
                                ? 'bg-emerald-100 text-emerald-700'
                                : r.action === 'skipped_duplicate'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-rose-100 text-rose-700')
                            }
                          >
                            {r.action}
                          </span>
                        </td>
                        <td className="px-2 py-1 text-neutral-500">{r.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={() =>
                    setState((s) => ({ ...s, step: 'select', report: null }))
                  }
                  className="px-4 py-2 rounded-lg text-sm text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  Revenir
                </button>
                <button
                  onClick={runImport}
                  disabled={importMut.isPending || state.report.created === 0}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold"
                >
                  Importer réellement {state.report.created} terme(s)
                </button>
              </div>
            </>
          )}

          {state.step === 'done' && state.report && (
            <div className="text-center py-8">
              <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500 mb-3" />
              <p className="text-lg font-extrabold">
                {state.report.created} terme(s) importé(s).
              </p>
              <p className="text-sm text-neutral-500 mt-1">
                {state.report.skipped} doublon(s) · {state.report.errors} erreur(s)
              </p>
              <button
                onClick={close}
                className="mt-4 px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-bold"
              >
                Fermer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminGlossaryPage() {
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [scopeFilter, setScopeFilter] = useState('');
  const [importState, setImportState] = useState<ImportDialogState>({
    open: false,
    file: null,
    format: 'csv',
    step: 'select',
    report: null,
  });

  const filters = useMemo(
    () => ({
      q: q.trim() || undefined,
      status: statusFilter || undefined,
      scope: scopeFilter || undefined,
    }),
    [q, statusFilter, scopeFilter],
  );

  const { data, isLoading } = useAdminGlossaryTerms(filters);
  const validateMut = useValidateGlossaryTerm();
  const rejectMut = useRejectGlossaryTerm();
  const mergeMut = useMergeGlossaryTerms();

  const handleMerge = (sourceId: number, sourceWord: string) => {
    const raw = window.prompt(
      `Fusionner « ${sourceWord} » dans quel terme cible ?\n\nSaisissez l'ID du terme cible (visible dans la colonne ID).`,
    );
    if (!raw) return;
    const targetId = Number(raw);
    if (!Number.isFinite(targetId) || targetId <= 0) return;
    if (
      !window.confirm(
        `Confirmer la fusion ? « ${sourceWord} » sera archivé et ses associations transférées vers le terme #${targetId}.`,
      )
    ) {
      return;
    }
    mergeMut.mutate({ sourceId, targetId });
  };

  return (
    <AdminShell title="Lexique">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-neutral-900 dark:text-white">
              Modération du lexique
            </h1>
            <p className="text-sm text-neutral-500">
              Validez les termes en attente, rejetez les propositions
              inappropriées ou fusionnez les doublons.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={buildExportUrl('csv')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-sm font-bold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800"
            >
              <Download className="w-4 h-4" /> Exporter CSV
            </a>
            <a
              href={buildExportUrl('json')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-sm font-bold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800"
            >
              <Download className="w-4 h-4" /> JSON
            </a>
            <button
              onClick={() =>
                setImportState((s) => ({ ...s, open: true, step: 'select' }))
              }
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold"
            >
              <Upload className="w-4 h-4" /> Importer
            </button>
          </div>
        </div>

        {/* Filtres */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher un terme…"
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-sm dark:text-white"
            />
          </div>
          <Filter className="w-4 h-4 text-neutral-500" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-sm px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 dark:text-white"
          >
            <option value="">Tous statuts</option>
            <option value="pending">En attente</option>
            <option value="validated">Validé</option>
            <option value="draft">Brouillon</option>
            <option value="rejected">Rejeté</option>
            <option value="archived">Archivé</option>
          </select>
          <select
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value)}
            className="text-sm px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 dark:text-white"
          >
            <option value="">Toutes portées</option>
            <option value="global">Global</option>
            <option value="course">Spécifique cours</option>
            <option value="section">Spécifique section</option>
            <option value="lesson">Spécifique leçon</option>
          </select>
          {data && (
            <span className="ml-auto text-xs text-neutral-500">
              {data.count} terme{data.count > 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          {isLoading && !data && (
            <div className="py-16 flex justify-center">
              <Spinner />
            </div>
          )}
          {data && data.results.length === 0 && (
            <div className="py-16 text-center text-sm text-neutral-500">
              Aucun terme dans cet état.
            </div>
          )}
          {data && data.results.length > 0 && (
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 dark:bg-neutral-800/50 text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="text-left px-3 py-3 w-14">ID</th>
                  <th className="text-left px-3 py-3">Terme</th>
                  <th className="text-left px-3 py-3">Définition</th>
                  <th className="text-left px-3 py-3">Catégorie</th>
                  <th className="text-left px-3 py-3">Portée</th>
                  <th className="text-left px-3 py-3">Statut</th>
                  <th className="text-right px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.results.map((t) => {
                  const s =
                    (t as unknown as { status?: string }).status || 'draft';
                  return (
                    <tr
                      key={t.id}
                      className="border-t border-neutral-100 dark:border-neutral-800"
                    >
                      <td className="px-3 py-3 text-neutral-400 font-mono text-xs">
                        #{t.id}
                      </td>
                      <td className="px-3 py-3 font-semibold text-neutral-900 dark:text-white">
                        {t.word}
                      </td>
                      <td className="px-3 py-3 text-neutral-600 dark:text-neutral-400 max-w-sm truncate">
                        {t.short_definition}
                      </td>
                      <td className="px-3 py-3 text-neutral-500">
                        {t.category_name || '—'}
                      </td>
                      <td className="px-3 py-3 text-neutral-500 text-xs">
                        {t.scope}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={
                            'px-2 py-0.5 rounded-full text-[11px] font-bold ' +
                            (STATUS_COLOR[s] || STATUS_COLOR.draft)
                          }
                        >
                          {STATUS_LABEL[s] || 'Brouillon'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          {s !== 'validated' && (
                            <button
                              onClick={() => validateMut.mutate(t.id)}
                              className="p-1.5 rounded-md hover:bg-emerald-50 text-emerald-600 dark:hover:bg-emerald-900/20"
                              title="Valider et publier"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                          )}
                          {s !== 'rejected' && (
                            <button
                              onClick={() => rejectMut.mutate(t.id)}
                              className="p-1.5 rounded-md hover:bg-rose-50 text-rose-600 dark:hover:bg-rose-900/20"
                              title="Rejeter"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleMerge(t.id, t.word)}
                            className="p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600"
                            title="Fusionner avec un autre terme"
                          >
                            <GitMerge className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <ImportDialog state={importState} setState={setImportState} />
    </AdminShell>
  );
}
