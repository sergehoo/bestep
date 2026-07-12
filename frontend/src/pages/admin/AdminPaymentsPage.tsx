/**
 * AdminPaymentsPage.tsx — R37.2
 *
 * Vue transverse des paiements plateforme. Consomme
 * `GET /api/admin/payments/`.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  Filter,
  Wallet,
  RefreshCw,
  ShoppingBag,
  CheckCircle,
  Clock,
  XCircle,
  RotateCcw,
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
  type StatusKind,
  PageHeader,
  StatCard,
} from '@/components/admin/primitives';

type OrderStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'PAID'
  | 'FAILED'
  | 'CANCELED'
  | 'REFUND_PENDING'
  | 'REFUND_FAILED'
  | 'REFUNDED';

interface AdminOrder {
  id: number;
  user: number | null;
  user_email: string | null;
  user_full_name: string;
  company: number | null;
  company_name: string | null;
  status: OrderStatus;
  status_label: string;
  currency: string;
  subtotal: string;
  discount_total: string;
  total: string;
  coupon: number | null;
  coupon_code: string | null;
  items_count: number;
  created_at: string;
  paid_at: string | null;
}

interface Page {
  count: number;
  next: string | null;
  previous: string | null;
  results: AdminOrder[];
  aggregated: {
    total_orders: number;
    revenue_paid: number;
    by_status: Record<string, { count: number; total: number }>;
  };
}

const STATUSES: Array<{ value: '' | OrderStatus; label: string }> = [
  { value: '', label: 'Tous statuts' },
  { value: 'PAID', label: 'Payées' },
  { value: 'PENDING', label: 'En attente' },
  { value: 'FAILED', label: 'Échouées' },
  { value: 'CANCELED', label: 'Annulées' },
  { value: 'REFUNDED', label: 'Remboursées' },
  { value: 'REFUND_PENDING', label: 'Rembours. en cours' },
  { value: 'REFUND_FAILED', label: 'Rembours. échoué' },
  { value: 'DRAFT', label: 'Brouillons' },
];

function statusToKind(s: OrderStatus): StatusKind {
  switch (s) {
    case 'PAID':
      return 'success';
    case 'PENDING':
    case 'REFUND_PENDING':
      return 'pending';
    case 'FAILED':
    case 'REFUND_FAILED':
      return 'failed';
    case 'CANCELED':
      return 'inactive';
    case 'REFUNDED':
      return 'warning';
    default:
      return 'draft';
  }
}

function formatMoney(v: string | number, currency: string): string {
  const n = typeof v === 'string' ? Number(v) : v;
  if (!Number.isFinite(n)) return '—';
  return `${n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ${currency}`;
}

export default function AdminPaymentsPage() {
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | OrderStatus>('');
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching, isError, refetch } = useQuery<Page>({
    queryKey: ['admin-payments', q, statusFilter, page],
    queryFn: async () => {
      const params: Record<string, string> = { page: String(page) };
      if (q) params.q = q;
      if (statusFilter) params.status = statusFilter;
      const res = await api.get<Page>('/admin/payments/', { params });
      return res.data;
    },
    staleTime: 30_000,
  });

  const rows = data?.results ?? [];
  const agg = data?.aggregated ?? {
    total_orders: 0,
    revenue_paid: 0,
    by_status: {},
  };
  const totalPages = data ? Math.max(1, Math.ceil(data.count / 30)) : 1;
  const paidCount = agg.by_status.PAID?.count ?? 0;
  const pendingCount = agg.by_status.PENDING?.count ?? 0;
  const failedCount = agg.by_status.FAILED?.count ?? 0;

  const columns: DataTableColumn<AdminOrder>[] = [
    {
      key: 'id',
      header: '#',
      width: '70px',
      render: (r) => (
        <span className="font-mono text-xs text-neutral-500">#{r.id}</span>
      ),
    },
    {
      key: 'buyer',
      header: 'Acheteur',
      render: (r) => (
        <div className="min-w-0">
          {r.user_email ? (
            <>
              <p className="font-semibold text-neutral-900 dark:text-white truncate max-w-[180px]">
                {r.user_full_name || r.user_email}
              </p>
              <p className="text-[11px] text-neutral-500 truncate max-w-[180px]">
                {r.user_email}
              </p>
            </>
          ) : r.company_name ? (
            <>
              <p className="font-semibold text-neutral-900 dark:text-white truncate max-w-[180px]">
                {r.company_name}
              </p>
              <p className="text-[11px] text-neutral-500">Organisation</p>
            </>
          ) : (
            <span className="text-xs text-neutral-400">—</span>
          )}
        </div>
      ),
    },
    {
      key: 'items',
      header: 'Items',
      align: 'right',
      width: '80px',
      render: (r) => (
        <span className="font-semibold text-neutral-800 dark:text-neutral-100">
          {r.items_count}
        </span>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      width: '130px',
      sortAccessor: (r) => Number(r.total),
      render: (r) => (
        <div className="text-right">
          <p className="font-bold text-neutral-900 dark:text-white">
            {formatMoney(r.total, r.currency)}
          </p>
          {Number(r.discount_total) > 0 && (
            <p className="text-[11px] text-emerald-600">
              -{formatMoney(r.discount_total, r.currency)}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'coupon',
      header: 'Coupon',
      width: '110px',
      render: (r) =>
        r.coupon_code ? (
          <StatusBadge status="info" size="sm">
            {r.coupon_code}
          </StatusBadge>
        ) : (
          <span className="text-xs text-neutral-400">—</span>
        ),
    },
    {
      key: 'status',
      header: 'Statut',
      width: '150px',
      render: (r) => (
        <StatusBadge status={statusToKind(r.status)}>
          {r.status_label}
        </StatusBadge>
      ),
    },
    {
      key: 'created',
      header: 'Créée le',
      width: '130px',
      sortAccessor: (r) => r.created_at,
      render: (r) => (
        <span className="text-xs text-neutral-500">
          {new Date(r.created_at).toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit',
          })}
        </span>
      ),
    },
    {
      key: 'paid',
      header: 'Payée le',
      width: '130px',
      render: (r) => (
        <span className="text-xs text-neutral-500">
          {r.paid_at
            ? new Date(r.paid_at).toLocaleDateString('fr-FR', {
                day: '2-digit',
                month: '2-digit',
                year: '2-digit',
              })
            : '—'}
        </span>
      ),
    },
  ];

  return (
    <AdminShell>
      <PageHeader
        title="Paiements"
        subtitle={`${agg.total_orders.toLocaleString('fr-FR')} commandes plateforme — ${formatMoney(agg.revenue_paid, 'XOF')} de revenus perçus`}
        breadcrumbs={[
          { label: 'Administration', to: '/dashboard/admin' },
          { label: 'Finance' },
          { label: 'Paiements' },
        ]}
        actions={
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            Rafraîchir
          </button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <StatCard
          Icon={Wallet}
          label="Revenus perçus"
          value={formatMoney(agg.revenue_paid, 'XOF')}
          tone="emerald"
        />
        <StatCard
          Icon={ShoppingBag}
          label="Commandes"
          value={agg.total_orders.toLocaleString('fr-FR')}
          tone="primary"
        />
        <StatCard
          Icon={CheckCircle}
          label="Payées"
          value={paidCount.toLocaleString('fr-FR')}
          tone="emerald"
        />
        <StatCard
          Icon={Clock}
          label="En attente"
          value={pendingCount.toLocaleString('fr-FR')}
          tone="accent"
        />
        <StatCard
          Icon={XCircle}
          label="Échouées"
          value={failedCount.toLocaleString('fr-FR')}
          tone="rose"
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
                placeholder="Email acheteur, org, coupon…"
                value={q}
                onChange={(e) => {
                  setPage(1);
                  setQ(e.target.value);
                }}
                className="pl-10"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setPage(1);
                setStatusFilter(e.target.value as '' | OrderStatus);
              }}
              className="border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
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
              Icon={RotateCcw}
              title="Aucun paiement"
              description="Aucune commande ne correspond aux filtres."
            />
          }
        />
      )}

      {data && data.count > 30 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <p className="text-neutral-500">
            Page {page} / {totalPages} — {data.count} commandes
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

      <p className="mt-6 text-xs text-neutral-500">
        Note : les remboursements se déclenchent depuis l'admin Django &gt;
        Commerce &gt; Order &gt; action « Rembourser ».
      </p>
    </AdminShell>
  );
}
