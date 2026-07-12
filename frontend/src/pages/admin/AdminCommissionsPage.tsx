/**
 * AdminCommissionsPage.tsx — R41.3
 *
 * Gestion des règles de commission plateforme (`commerce.CommissionRule`).
 * Consomme `GET /api/admin/commissions/`, POST, PATCH, DELETE et
 * `POST /api/admin/commissions/simulate/`.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  Filter,
  Coins,
  RefreshCw,
  Plus,
  Trash2,
  Loader2,
  Percent,
  UserCheck,
  UserX,
  Calculator,
  Info,
} from 'lucide-react';

import api from '@/lib/api';
import { AdminShell } from '@/components/admin/AdminShell';
import { Card, CardBody } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import {
  DataTable,
  type DataTableColumn,
  EmptyState,
  ErrorState,
  StatusBadge,
  PageHeader,
  StatCard,
  ConfirmDialog,
} from '@/components/admin/primitives';
import { extractApiError } from '@/lib/utils';

type Scope = 'DEFAULT' | 'INSTRUCTOR' | 'CATEGORY' | 'COURSE';

interface CommissionRule {
  id: number;
  name: string;
  scope: Scope;
  scope_label: string;
  percent: string;
  instructor: number | null;
  instructor_email: string | null;
  instructor_name: string | null;
  category: number | null;
  category_name: string | null;
  course: number | null;
  course_title: string | null;
  course_slug: string | null;
  is_active: boolean;
  note: string;
  created_at: string;
}

interface Page {
  count: number;
  next: string | null;
  previous: string | null;
  results: CommissionRule[];
  aggregated: {
    total: number;
    active: number;
    default_percent: number | null;
    by_scope: Record<Scope, number>;
  };
}

interface SimulateResponse {
  rule: CommissionRule;
  amount: string;
  percent: string;
  platform_share: string;
  instructor_share: string;
}

const SCOPES: Array<{ value: '' | Scope; label: string }> = [
  { value: '', label: 'Tous scopes' },
  { value: 'DEFAULT', label: 'Défaut' },
  { value: 'INSTRUCTOR', label: 'Par formateur' },
  { value: 'CATEGORY', label: 'Par catégorie' },
  { value: 'COURSE', label: 'Par cours' },
];

export default function AdminCommissionsPage() {
  const [scope, setScope] = useState<'' | Scope>('');
  const [active, setActive] = useState<'' | 'true' | 'false'>('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [showSimulate, setShowSimulate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CommissionRule | null>(null);
  const qc = useQueryClient();

  const { data, isLoading, isFetching, isError, refetch } = useQuery<Page>({
    queryKey: ['admin-commissions', scope, active, page],
    queryFn: async () => {
      const params: Record<string, string> = { page: String(page) };
      if (scope) params.scope = scope;
      if (active) params.is_active = active;
      const res = await api.get<Page>('/admin/commissions/', { params });
      return res.data;
    },
    staleTime: 30_000,
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      await api.patch(`/admin/commissions/${id}/`, { is_active: isActive });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-commissions'] }),
  });

  const deleteRule = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/admin/commissions/${id}/`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-commissions'] }),
  });

  const rows = data?.results ?? [];
  const agg = data?.aggregated ?? {
    total: 0,
    active: 0,
    default_percent: null,
    by_scope: { DEFAULT: 0, INSTRUCTOR: 0, CATEGORY: 0, COURSE: 0 },
  };
  const totalPages = data ? Math.max(1, Math.ceil(data.count / 30)) : 1;

  const columns: DataTableColumn<CommissionRule>[] = [
    {
      key: 'name',
      header: 'Règle',
      render: (r) => (
        <div className="min-w-0">
          <p className="font-bold text-neutral-900 dark:text-white truncate max-w-[220px]">
            {r.name}
          </p>
          {r.note && (
            <p className="text-[11px] text-neutral-500 truncate max-w-[220px] italic">
              {r.note}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'scope',
      header: 'Scope',
      width: '150px',
      render: (r) => (
        <div>
          <StatusBadge
            status={
              r.scope === 'DEFAULT'
                ? 'info'
                : r.scope === 'COURSE'
                  ? 'warning'
                  : 'active'
            }
            size="sm"
          >
            {r.scope_label}
          </StatusBadge>
          {r.scope === 'INSTRUCTOR' && r.instructor_name && (
            <p className="mt-1 text-[11px] text-neutral-500 truncate max-w-[140px]">
              {r.instructor_name}
            </p>
          )}
          {r.scope === 'CATEGORY' && r.category_name && (
            <p className="mt-1 text-[11px] text-neutral-500 truncate max-w-[140px]">
              {r.category_name}
            </p>
          )}
          {r.scope === 'COURSE' && r.course_title && (
            <p className="mt-1 text-[11px] text-neutral-500 truncate max-w-[140px]">
              {r.course_title}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'percent',
      header: 'Commission',
      align: 'right',
      width: '120px',
      sortAccessor: (r) => Number(r.percent),
      render: (r) => (
        <span className="inline-flex items-center gap-1 font-bold text-primary-700 dark:text-primary-400 text-lg">
          {Number(r.percent).toFixed(1)}
          <Percent className="w-4 h-4" />
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      width: '110px',
      render: (r) =>
        r.is_active ? (
          <StatusBadge status="active" />
        ) : (
          <StatusBadge status="inactive" />
        ),
    },
    {
      key: 'created',
      header: 'Créée le',
      width: '110px',
      render: (r) => (
        <span className="text-xs text-neutral-500">
          {new Date(r.created_at).toLocaleDateString('fr-FR')}
        </span>
      ),
    },
  ];

  return (
    <AdminShell>
      <PageHeader
        title="Commissions"
        subtitle={`${agg.total} règle${agg.total > 1 ? 's' : ''} définie${agg.total > 1 ? 's' : ''} — commission par défaut : ${agg.default_percent != null ? `${agg.default_percent}%` : 'aucune'}`}
        breadcrumbs={[
          { label: 'Administration', to: '/dashboard/admin' },
          { label: 'Finance' },
          { label: 'Commissions' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSimulate(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition"
            >
              <Calculator className="w-4 h-4" />
              Simuler
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold transition"
            >
              <Plus className="w-4 h-4" />
              Nouvelle règle
            </button>
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <StatCard
          Icon={Coins}
          label="Commission défaut"
          value={agg.default_percent != null ? `${agg.default_percent}%` : '—'}
          tone="primary"
        />
        <StatCard
          Icon={Percent}
          label="Défaut"
          value={agg.by_scope.DEFAULT ?? 0}
          tone="primary"
        />
        <StatCard
          Icon={UserCheck}
          label="Par formateur"
          value={agg.by_scope.INSTRUCTOR ?? 0}
          tone="emerald"
        />
        <StatCard
          Icon={Filter}
          label="Par catégorie"
          value={agg.by_scope.CATEGORY ?? 0}
          tone="accent"
        />
        <StatCard
          Icon={Search}
          label="Par cours"
          value={agg.by_scope.COURSE ?? 0}
          tone="violet"
        />
      </div>

      <Card className="mb-5">
        <CardBody>
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-neutral-500" />
            <span className="text-xs font-bold uppercase tracking-wide text-neutral-700 dark:text-neutral-300">
              Filtres
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select
              value={scope}
              onChange={(e) => {
                setPage(1);
                setScope(e.target.value as '' | Scope);
              }}
              className="border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {SCOPES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <select
              value={active}
              onChange={(e) => {
                setPage(1);
                setActive(e.target.value as '' | 'true' | 'false');
              }}
              className="border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Actives + inactives</option>
              <option value="true">Actives seulement</option>
              <option value="false">Inactives seulement</option>
            </select>
          </div>
        </CardBody>
      </Card>

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          loading={isLoading}
          emptyState={
            <EmptyState
              Icon={Coins}
              title="Aucune règle définie"
              description="Créez une règle DEFAULT en priorité (commission plateforme fallback)."
              action={
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold"
                >
                  <Plus className="w-4 h-4" />
                  Nouvelle règle
                </button>
              }
            />
          }
          rowActions={(r) => (
            <div className="flex items-center justify-end gap-1">
              <button
                type="button"
                onClick={() =>
                  toggleActive.mutate({ id: r.id, isActive: !r.is_active })
                }
                disabled={toggleActive.isPending}
                className={
                  'p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-40 ' +
                  (r.is_active
                    ? 'text-neutral-500 hover:text-amber-600'
                    : 'text-neutral-500 hover:text-emerald-600')
                }
                title={r.is_active ? 'Désactiver' : 'Activer'}
              >
                {toggleActive.isPending && toggleActive.variables?.id === r.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : r.is_active ? (
                  <UserX className="w-4 h-4" />
                ) : (
                  <UserCheck className="w-4 h-4" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setDeleteTarget(r)}
                disabled={deleteRule.isPending}
                className="p-1.5 rounded-lg text-neutral-500 hover:text-rose-600 hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-40"
                title="Supprimer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        />
      )}

      {data && data.count > 30 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <p className="text-neutral-500">
            Page {page} / {totalPages} — {data.count} règles
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || isFetching}
              className="px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-600 hover:bg-neutral-50 dark:hover:bg-neutral-700 disabled:opacity-40"
            >
              Précédent
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={!data.next || isFetching}
              className="px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-600 hover:bg-neutral-50 dark:hover:bg-neutral-700 disabled:opacity-40"
            >
              Suivant
            </button>
          </div>
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-primary-200 bg-primary-50/40 dark:bg-primary-900/20 dark:border-primary-800 p-4 text-xs text-neutral-700 dark:text-neutral-300 flex items-start gap-2">
        <Info className="w-4 h-4 text-primary-600 shrink-0 mt-0.5" />
        <p>
          <strong>Ordre de résolution</strong> : pour un paiement donné, la
          commission appliquée est cherchée dans cet ordre : règle
          spécifique COURSE → INSTRUCTOR → CATEGORY → DEFAULT. Le calcul
          effectif est appliqué lors du reversement (module R42).
        </p>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            await deleteRule.mutateAsync(deleteTarget.id);
            setDeleteTarget(null);
          } catch (err) {
            alert(extractApiError(err, 'Impossible de supprimer.'));
          }
        }}
        title="Supprimer cette règle ?"
        description={
          deleteTarget
            ? `La règle "${deleteTarget.name}" sera supprimée définitivement. ${deleteTarget.scope === 'DEFAULT' ? 'ATTENTION : c\'est une règle DEFAULT — s\'il n\'y en a qu\'une, la suppression sera refusée.' : ''}`
            : ''
        }
        confirmLabel="Supprimer"
        destructive
        loading={deleteRule.isPending}
      />

      {showCreate && (
        <CreateRuleModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            qc.invalidateQueries({ queryKey: ['admin-commissions'] });
          }}
        />
      )}

      {showSimulate && (
        <SimulateModal onClose={() => setShowSimulate(false)} />
      )}
    </AdminShell>
  );
}

// ─────────────────────────────────────────────────────────────
// CreateRuleModal
// ─────────────────────────────────────────────────────────────

function CreateRuleModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [scope, setScope] = useState<Scope>('DEFAULT');
  const [percent, setPercent] = useState('30');
  const [instructorId, setInstructorId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [courseId, setCourseId] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        scope,
        percent: Number(percent),
        note: note.trim(),
      };
      if (scope === 'INSTRUCTOR') body.instructor = Number(instructorId);
      if (scope === 'CATEGORY') body.category = Number(categoryId);
      if (scope === 'COURSE') body.course = Number(courseId);
      await api.post('/admin/commissions/', body);
      onCreated();
    } catch (err) {
      setError(extractApiError(err, 'Erreur lors de la création.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] bg-neutral-900/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white dark:bg-neutral-800 rounded-2xl shadow-lift p-6 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <h2 className="text-lg font-extrabold text-neutral-900 dark:text-white">
          Nouvelle règle de commission
        </h2>

        {error && (
          <p className="text-sm text-rose-700 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        <div>
          <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase mb-1">
            Nom
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex : Formateur premium"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase mb-1">
            Scope
          </label>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as Scope)}
            className="w-full border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="DEFAULT">Défaut (fallback)</option>
            <option value="INSTRUCTOR">Par formateur</option>
            <option value="CATEGORY">Par catégorie</option>
            <option value="COURSE">Par cours</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase mb-1">
            Commission plateforme (%)
          </label>
          <Input
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
            required
          />
        </div>

        {scope === 'INSTRUCTOR' && (
          <div>
            <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase mb-1">
              ID Formateur
            </label>
            <Input
              type="number"
              value={instructorId}
              onChange={(e) => setInstructorId(e.target.value)}
              required
            />
          </div>
        )}

        {scope === 'CATEGORY' && (
          <div>
            <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase mb-1">
              ID Catégorie
            </label>
            <Input
              type="number"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              required
            />
          </div>
        )}

        {scope === 'COURSE' && (
          <div>
            <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase mb-1">
              ID Cours
            </label>
            <Input
              type="number"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              required
            />
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase mb-1">
            Note (optionnel)
          </label>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Justification, contexte…"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold disabled:opacity-60"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Créer
          </button>
        </div>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SimulateModal
// ─────────────────────────────────────────────────────────────

function SimulateModal({ onClose }: { onClose: () => void }) {
  const [amount, setAmount] = useState('10000');
  const [courseId, setCourseId] = useState('');
  const [instructorId, setInstructorId] = useState('');
  const [result, setResult] = useState<SimulateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const simulate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const body: Record<string, unknown> = { amount: Number(amount) };
      if (courseId) body.course_id = Number(courseId);
      if (instructorId) body.instructor_id = Number(instructorId);
      const res = await api.post<SimulateResponse>(
        '/admin/commissions/simulate/',
        body,
      );
      setResult(res.data);
    } catch (err) {
      setError(extractApiError(err, 'Erreur simulation.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] bg-neutral-900/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <form
        onSubmit={simulate}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white dark:bg-neutral-800 rounded-2xl shadow-lift p-6 space-y-4"
      >
        <h2 className="text-lg font-extrabold text-neutral-900 dark:text-white flex items-center gap-2">
          <Calculator className="w-5 h-5 text-primary-600" />
          Simulateur de commission
        </h2>

        {error && (
          <p className="text-sm text-rose-700 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        <div>
          <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase mb-1">
            Montant (XOF)
          </label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase mb-1">
            ID Cours (optionnel)
          </label>
          <Input
            type="number"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            placeholder="Pour tester COURSE / CATEGORY / DEFAULT"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase mb-1">
            ID Formateur (optionnel)
          </label>
          <Input
            type="number"
            value={instructorId}
            onChange={(e) => setInstructorId(e.target.value)}
            placeholder="Pour tester INSTRUCTOR"
          />
        </div>

        {result && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-800 p-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
              Résultat de la simulation
            </p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-neutral-600 dark:text-neutral-300">Règle appliquée</span>
              <span className="font-semibold text-right">{result.rule.name}</span>
              <span className="text-neutral-600 dark:text-neutral-300">Scope</span>
              <span className="font-semibold text-right">{result.rule.scope_label}</span>
              <span className="text-neutral-600 dark:text-neutral-300">Commission</span>
              <span className="font-semibold text-right">
                {Number(result.percent).toFixed(2)}%
              </span>
              <span className="text-neutral-600 dark:text-neutral-300">Part plateforme</span>
              <span className="font-bold text-rose-700 text-right">
                {Number(result.platform_share).toLocaleString('fr-FR')} XOF
              </span>
              <span className="text-neutral-600 dark:text-neutral-300">Part formateur</span>
              <span className="font-bold text-emerald-700 text-right">
                {Number(result.instructor_share).toLocaleString('fr-FR')} XOF
              </span>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
          >
            Fermer
          </button>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold disabled:opacity-60"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Simuler
          </button>
        </div>
      </form>
    </div>
  );
}
