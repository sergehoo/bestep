/**
 * AdminGlossaryPage.tsx — /admin/lexique.
 *
 * Modération : liste tous les termes (tous statuts) avec actions
 * valider / rejeter / fusionner. Filtres par statut, portée, recherche.
 */
import { useMemo, useState } from 'react';
import { CheckCircle2, XCircle, GitMerge, Search, Filter } from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { Spinner } from '@/components/ui/Spinner';
import {
  useAdminGlossaryTerms,
  useMergeGlossaryTerms,
  useRejectGlossaryTerm,
  useValidateGlossaryTerm,
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

export default function AdminGlossaryPage() {
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [scopeFilter, setScopeFilter] = useState('');

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
        <div>
          <h1 className="text-2xl font-extrabold text-neutral-900 dark:text-white">
            Modération du lexique
          </h1>
          <p className="text-sm text-neutral-500">
            Validez les termes en attente, rejetez les propositions
            inappropriées ou fusionnez les doublons.
          </p>
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
    </AdminShell>
  );
}
