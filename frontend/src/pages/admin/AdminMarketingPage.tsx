/**
 * AdminMarketingPage.tsx — R38
 *
 * Gestion des coupons plateforme (`commerce.Coupon`).
 * Consomme `GET /api/admin/marketing/coupons/`, POST, PATCH, DELETE.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  Filter,
  Tag,
  RefreshCw,
  Percent,
  DollarSign,
  Plus,
  Trash2,
  UserCheck,
  UserX,
  Loader2,
  Ticket,
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

interface Coupon {
  id: number;
  code: string;
  is_active: boolean;
  percent_off: number | null;
  amount_off: string | null;
  currency: string;
  valid_from: string | null;
  valid_to: string | null;
  usage_limit: number | null;
  used_count: number;
  created_at: string;
}

interface Page {
  count: number;
  next: string | null;
  previous: string | null;
  results: Coupon[];
  aggregated: { total: number; active: number; used: number };
}

export default function AdminMarketingPage() {
  const [q, setQ] = useState('');
  const [activeFilter, setActiveFilter] = useState<'' | 'true' | 'false'>('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Coupon | null>(null);
  const qc = useQueryClient();

  const { data, isLoading, isFetching, isError, refetch } = useQuery<Page>({
    queryKey: ['admin-coupons', q, activeFilter, page],
    queryFn: async () => {
      const params: Record<string, string> = { page: String(page) };
      if (q) params.q = q;
      if (activeFilter) params.is_active = activeFilter;
      const res = await api.get<Page>('/admin/marketing/coupons/', { params });
      return res.data;
    },
    staleTime: 15_000,
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      await api.patch(`/admin/marketing/coupons/${id}/`, {
        is_active: isActive,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-coupons'] }),
  });

  const deleteCoupon = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/admin/marketing/coupons/${id}/`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-coupons'] }),
  });

  const rows = data?.results ?? [];
  const agg = data?.aggregated ?? { total: 0, active: 0, used: 0 };
  const totalPages = data ? Math.max(1, Math.ceil(data.count / 25)) : 1;

  const columns: DataTableColumn<Coupon>[] = [
    {
      key: 'code',
      header: 'Code',
      render: (r) => (
        <div className="flex items-center gap-2">
          <Ticket className="w-4 h-4 text-accent-600" />
          <code className="font-bold text-neutral-900 dark:text-white font-mono">
            {r.code}
          </code>
        </div>
      ),
    },
    {
      key: 'discount',
      header: 'Remise',
      render: (r) =>
        r.percent_off ? (
          <span className="inline-flex items-center gap-1 font-bold text-emerald-700 dark:text-emerald-400">
            <Percent className="w-3.5 h-3.5" />
            {r.percent_off}%
          </span>
        ) : r.amount_off ? (
          <span className="inline-flex items-center gap-1 font-bold text-primary-700 dark:text-primary-400">
            <DollarSign className="w-3.5 h-3.5" />
            {Number(r.amount_off).toLocaleString('fr-FR')} {r.currency}
          </span>
        ) : (
          <span className="text-xs text-neutral-400">—</span>
        ),
    },
    {
      key: 'usage',
      header: 'Utilisation',
      align: 'right',
      width: '150px',
      sortAccessor: (r) => r.used_count,
      render: (r) => (
        <div className="text-right">
          <p className="font-semibold text-neutral-900 dark:text-white">
            {r.used_count}
            {r.usage_limit ? (
              <span className="text-neutral-500 font-normal"> / {r.usage_limit}</span>
            ) : (
              <span className="text-neutral-500 font-normal"> / ∞</span>
            )}
          </p>
          {r.usage_limit && (
            <div className="mt-1 h-1 bg-neutral-200 dark:bg-neutral-700 rounded overflow-hidden">
              <div
                className="h-full bg-primary-500"
                style={{
                  width: `${Math.min(100, (r.used_count / r.usage_limit) * 100)}%`,
                }}
              />
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'validity',
      header: 'Validité',
      width: '180px',
      render: (r) => (
        <div className="text-xs text-neutral-600 dark:text-neutral-300">
          {r.valid_from && (
            <p>
              du {new Date(r.valid_from).toLocaleDateString('fr-FR')}
            </p>
          )}
          {r.valid_to && (
            <p>
              au {new Date(r.valid_to).toLocaleDateString('fr-FR')}
            </p>
          )}
          {!r.valid_from && !r.valid_to && (
            <span className="italic text-neutral-400">Sans limite</span>
          )}
        </div>
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
      header: 'Créé le',
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
        title="Marketing — Coupons"
        subtitle={`${agg.total} coupons — ${agg.active} actifs, ${agg.used} utilisations totales`}
        breadcrumbs={[
          { label: 'Administration', to: '/dashboard/admin' },
          { label: 'Finance' },
          { label: 'Marketing' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold transition"
            >
              <Plus className="w-4 h-4" />
              Nouveau coupon
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

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
        <StatCard
          Icon={Tag}
          label="Total coupons"
          value={agg.total.toLocaleString('fr-FR')}
          tone="primary"
        />
        <StatCard
          Icon={UserCheck}
          label="Actifs"
          value={agg.active.toLocaleString('fr-FR')}
          tone="emerald"
        />
        <StatCard
          Icon={Ticket}
          label="Utilisations totales"
          value={agg.used.toLocaleString('fr-FR')}
          tone="accent"
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
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <Input
                placeholder="Code coupon…"
                value={q}
                onChange={(e) => {
                  setPage(1);
                  setQ(e.target.value);
                }}
                className="pl-10"
              />
            </div>
            <select
              value={activeFilter}
              onChange={(e) => {
                setPage(1);
                setActiveFilter(e.target.value as '' | 'true' | 'false');
              }}
              className="border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Actifs + inactifs</option>
              <option value="true">Actifs seulement</option>
              <option value="false">Inactifs seulement</option>
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
              Icon={Tag}
              title="Aucun coupon"
              description="Créez votre premier coupon pour lancer une promotion."
              action={
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold"
                >
                  <Plus className="w-4 h-4" />
                  Nouveau coupon
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
                disabled={deleteCoupon.isPending}
                className="p-1.5 rounded-lg text-neutral-500 hover:text-rose-600 hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-40"
                title="Supprimer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        />
      )}

      {data && data.count > 25 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <p className="text-neutral-500">
            Page {page} / {totalPages} — {data.count} coupons
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

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            await deleteCoupon.mutateAsync(deleteTarget.id);
            setDeleteTarget(null);
          } catch (err) {
            alert(extractApiError(err, 'Impossible de supprimer.'));
          }
        }}
        title="Supprimer ce coupon ?"
        description={
          deleteTarget
            ? `Le coupon "${deleteTarget.code}" sera supprimé définitivement. Cette action n'est possible que sur un coupon non utilisé — sinon désactivez-le à la place.`
            : ''
        }
        confirmLabel="Supprimer"
        destructive
        loading={deleteCoupon.isPending}
      />

      {showCreate && (
        <CreateCouponModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            qc.invalidateQueries({ queryKey: ['admin-coupons'] });
          }}
        />
      )}
    </AdminShell>
  );
}

// ─────────────────────────────────────────────────────────────
// CreateCouponModal — Formulaire simple
// ─────────────────────────────────────────────────────────────

function CreateCouponModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<'percent' | 'amount'>('percent');
  const [percentOff, setPercentOff] = useState('10');
  const [amountOff, setAmountOff] = useState('');
  const [currency, setCurrency] = useState('XOF');
  const [usageLimit, setUsageLimit] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        code: code.trim().toUpperCase(),
        currency,
      };
      if (discountType === 'percent') {
        body.percent_off = Number(percentOff);
      } else {
        body.amount_off = amountOff;
      }
      if (usageLimit) body.usage_limit = Number(usageLimit);
      await api.post('/admin/marketing/coupons/', body);
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
        className="w-full max-w-md bg-white dark:bg-neutral-800 rounded-2xl shadow-lift p-6 space-y-4"
      >
        <h2 className="text-lg font-extrabold text-neutral-900 dark:text-white">
          Nouveau coupon
        </h2>

        {error && (
          <p className="text-sm text-rose-700 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        <div>
          <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase mb-1">
            Code
          </label>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="PROMO2026"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase mb-1">
            Type de remise
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDiscountType('percent')}
              className={
                'flex-1 py-2 rounded-xl text-sm font-semibold border transition ' +
                (discountType === 'percent'
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-200 border-neutral-200 dark:border-neutral-700')
              }
            >
              Pourcentage
            </button>
            <button
              type="button"
              onClick={() => setDiscountType('amount')}
              className={
                'flex-1 py-2 rounded-xl text-sm font-semibold border transition ' +
                (discountType === 'amount'
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-200 border-neutral-200 dark:border-neutral-700')
              }
            >
              Montant fixe
            </button>
          </div>
        </div>

        {discountType === 'percent' ? (
          <div>
            <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase mb-1">
              Pourcentage (1-100)
            </label>
            <Input
              type="number"
              min={1}
              max={100}
              value={percentOff}
              onChange={(e) => setPercentOff(e.target.value)}
              required
            />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase mb-1">
                Montant
              </label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={amountOff}
                onChange={(e) => setAmountOff(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase mb-1">
                Devise
              </label>
              <Input
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                required
              />
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase mb-1">
            Limite d'utilisation (optionnel)
          </label>
          <Input
            type="number"
            min={1}
            value={usageLimit}
            onChange={(e) => setUsageLimit(e.target.value)}
            placeholder="Illimité si vide"
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
