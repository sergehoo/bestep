/**
 * AdminPayoutsPage.tsx — R42.2
 *
 * Workflow reversements formateurs (`commerce.Payout`).
 * PENDING → VALIDATED → PAID (ou FAILED/CANCELED).
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Filter,
  Wallet,
  RefreshCw,
  Plus,
  CheckCircle,
  CreditCard,
  XCircle,
  Loader2,
  Clock,
  Info,
  Coins,
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
  ConfirmDialog,
} from '@/components/admin/primitives';
import { extractApiError } from '@/lib/utils';

type PayoutStatus = 'PENDING' | 'VALIDATED' | 'PAID' | 'FAILED' | 'CANCELED';

interface Payout {
  id: number;
  instructor: number;
  instructor_email: string;
  instructor_name: string;
  period_start: string;
  period_end: string;
  currency: string;
  gross_amount: string;
  commission_amount: string;
  tax_amount: string;
  refund_amount: string;
  net_amount: string;
  status: PayoutStatus;
  status_label: string;
  payment_method: string;
  payment_reference: string;
  validated_by_email: string | null;
  validated_at: string | null;
  paid_at: string | null;
  note: string;
  created_at: string;
}

interface Page {
  count: number;
  next: string | null;
  previous: string | null;
  results: Payout[];
  aggregated: {
    total: number;
    by_status: Record<PayoutStatus, number>;
    total_gross: number;
    total_commission: number;
    total_net: number;
  };
}

const STATUSES: Array<{ value: '' | PayoutStatus; label: string }> = [
  { value: '', label: 'Tous statuts' },
  { value: 'PENDING', label: 'En attente' },
  { value: 'VALIDATED', label: 'Validé' },
  { value: 'PAID', label: 'Payé' },
  { value: 'FAILED', label: 'Échoué' },
  { value: 'CANCELED', label: 'Annulé' },
];

function statusToKind(s: PayoutStatus): StatusKind {
  switch (s) {
    case 'PAID':
      return 'success';
    case 'VALIDATED':
      return 'info';
    case 'PENDING':
      return 'pending';
    case 'FAILED':
      return 'failed';
    case 'CANCELED':
      return 'inactive';
    default:
      return 'info';
  }
}

function formatMoney(v: string | number, currency: string): string {
  const n = typeof v === 'string' ? Number(v) : v;
  return `${n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ${currency}`;
}

export default function AdminPayoutsPage() {
  const [statusFilter, setStatusFilter] = useState<'' | PayoutStatus>('');
  const [instructorId, setInstructorId] = useState('');
  const [page, setPage] = useState(1);
  const [payTarget, setPayTarget] = useState<Payout | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Payout | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading, isFetching, isError, refetch } = useQuery<Page>({
    queryKey: ['admin-payouts', statusFilter, instructorId, page],
    queryFn: async () => {
      const params: Record<string, string> = { page: String(page) };
      if (statusFilter) params.status = statusFilter;
      if (instructorId) params.instructor_id = instructorId;
      const res = await api.get<Page>('/admin/payouts/', { params });
      return res.data;
    },
    staleTime: 15_000,
  });

  const validate = useMutation({
    mutationFn: async (id: number) => {
      await api.post(`/admin/payouts/${id}/validate/`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-payouts'] }),
  });

  const cancel = useMutation({
    mutationFn: async (id: number) => {
      await api.post(`/admin/payouts/${id}/cancel/`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-payouts'] }),
  });

  const rows = data?.results ?? [];
  const agg = data?.aggregated ?? {
    total: 0,
    by_status: {
      PENDING: 0, VALIDATED: 0, PAID: 0, FAILED: 0, CANCELED: 0,
    } as Record<PayoutStatus, number>,
    total_gross: 0,
    total_commission: 0,
    total_net: 0,
  };
  const totalPages = data ? Math.max(1, Math.ceil(data.count / 25)) : 1;

  const columns: DataTableColumn<Payout>[] = [
    {
      key: 'instructor',
      header: 'Formateur',
      render: (r) => (
        <div className="min-w-0">
          <p className="font-bold text-neutral-900 dark:text-white truncate max-w-[160px]">
            {r.instructor_name || r.instructor_email}
          </p>
          <p className="text-[11px] text-neutral-500 truncate max-w-[160px]">
            {r.instructor_email}
          </p>
        </div>
      ),
    },
    {
      key: 'period',
      header: 'Période',
      width: '160px',
      render: (r) => (
        <div className="text-xs text-neutral-600 dark:text-neutral-300">
          <p>{new Date(r.period_start).toLocaleDateString('fr-FR')}</p>
          <p className="text-neutral-400">→ {new Date(r.period_end).toLocaleDateString('fr-FR')}</p>
        </div>
      ),
    },
    {
      key: 'gross',
      header: 'Brut',
      align: 'right',
      width: '120px',
      sortAccessor: (r) => Number(r.gross_amount),
      render: (r) => (
        <span className="text-sm text-neutral-600 dark:text-neutral-300">
          {formatMoney(r.gross_amount, r.currency)}
        </span>
      ),
    },
    {
      key: 'commission',
      header: 'Commission',
      align: 'right',
      width: '120px',
      render: (r) => (
        <span className="text-sm text-rose-600">
          -{formatMoney(r.commission_amount, r.currency)}
        </span>
      ),
    },
    {
      key: 'net',
      header: 'Net',
      align: 'right',
      width: '140px',
      sortAccessor: (r) => Number(r.net_amount),
      render: (r) => (
        <span className="font-bold text-emerald-700 dark:text-emerald-400 text-base">
          {formatMoney(r.net_amount, r.currency)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      width: '110px',
      render: (r) => (
        <StatusBadge status={statusToKind(r.status)}>
          {r.status_label}
        </StatusBadge>
      ),
    },
    {
      key: 'paid_at',
      header: 'Payé le',
      width: '110px',
      render: (r) => (
        <span className="text-xs text-neutral-500">
          {r.paid_at
            ? new Date(r.paid_at).toLocaleDateString('fr-FR')
            : '—'}
        </span>
      ),
    },
  ];

  return (
    <AdminShell>
      <PageHeader
        title="Reversements"
        subtitle={`${agg.total} reversements — ${formatMoney(agg.total_net, 'XOF')} net cumulé sur la vue`}
        breadcrumbs={[
          { label: 'Administration', to: '/dashboard/admin' },
          { label: 'Finance' },
          { label: 'Reversements' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold transition"
            >
              <Plus className="w-4 h-4" />
              Créer manuellement
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
          Icon={Wallet}
          label="Net cumulé"
          value={formatMoney(agg.total_net, 'XOF')}
          tone="emerald"
        />
        <StatCard
          Icon={Coins}
          label="Commissions"
          value={formatMoney(agg.total_commission, 'XOF')}
          tone="rose"
        />
        <StatCard
          Icon={Clock}
          label="En attente"
          value={agg.by_status.PENDING ?? 0}
          tone="accent"
        />
        <StatCard
          Icon={CheckCircle}
          label="Validés"
          value={agg.by_status.VALIDATED ?? 0}
          tone="sky"
        />
        <StatCard
          Icon={CreditCard}
          label="Payés"
          value={agg.by_status.PAID ?? 0}
          tone="emerald"
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
              value={statusFilter}
              onChange={(e) => {
                setPage(1);
                setStatusFilter(e.target.value as '' | PayoutStatus);
              }}
              className="border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <Input
              type="number"
              placeholder="ID formateur…"
              value={instructorId}
              onChange={(e) => {
                setPage(1);
                setInstructorId(e.target.value);
              }}
            />
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
              Icon={Wallet}
              title="Aucun reversement"
              description="Créez le premier reversement manuellement ou attendez le batch mensuel (R43)."
              action={
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold"
                >
                  <Plus className="w-4 h-4" />
                  Créer
                </button>
              }
            />
          }
          rowActions={(r) => (
            <div className="flex items-center justify-end gap-1">
              {r.status === 'PENDING' && (
                <button
                  type="button"
                  onClick={() => validate.mutate(r.id)}
                  disabled={validate.isPending}
                  className="p-1.5 rounded-lg text-neutral-500 hover:text-primary-700 hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-40"
                  title="Valider"
                >
                  {validate.isPending && validate.variables === r.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4" />
                  )}
                </button>
              )}
              {r.status === 'VALIDATED' && (
                <button
                  type="button"
                  onClick={() => setPayTarget(r)}
                  className="p-1.5 rounded-lg text-neutral-500 hover:text-emerald-600 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                  title="Marquer comme payé"
                >
                  <CreditCard className="w-4 h-4" />
                </button>
              )}
              {r.status !== 'PAID' && r.status !== 'CANCELED' && (
                <button
                  type="button"
                  onClick={() => setCancelTarget(r)}
                  disabled={cancel.isPending}
                  className="p-1.5 rounded-lg text-neutral-500 hover:text-rose-600 hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-40"
                  title="Annuler"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        />
      )}

      {data && data.count > 25 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <p className="text-neutral-500">
            Page {page} / {totalPages} — {data.count} reversements
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
        <div>
          <p className="font-bold">Workflow reversement</p>
          <p className="mt-1">
            <code>PENDING</code> → <code>VALIDATED</code> (validation admin) →
            <code> PAID</code> (paiement effectué avec référence). L'annulation
            reste possible tant que le paiement n'est pas exécuté. La
            génération automatique mensuelle (batch Celery Beat) et
            l'intégration Wave/Orange Money sont planifiées R43.
          </p>
        </div>
      </div>

      {/* Modal marquer comme payé */}
      {payTarget && (
        <MarkPaidModal
          payout={payTarget}
          onClose={() => setPayTarget(null)}
          onDone={() => {
            setPayTarget(null);
            qc.invalidateQueries({ queryKey: ['admin-payouts'] });
          }}
        />
      )}

      {/* Modal création */}
      {showCreate && (
        <CreatePayoutModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            qc.invalidateQueries({ queryKey: ['admin-payouts'] });
          }}
        />
      )}

      <ConfirmDialog
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={async () => {
          if (!cancelTarget) return;
          try {
            await cancel.mutateAsync(cancelTarget.id);
            setCancelTarget(null);
          } catch (err) {
            alert(extractApiError(err, 'Impossible d\'annuler.'));
          }
        }}
        title="Annuler ce reversement ?"
        description={
          cancelTarget
            ? `Le reversement de ${cancelTarget.instructor_name || cancelTarget.instructor_email} (${formatMoney(cancelTarget.net_amount, cancelTarget.currency)}) sera annulé. Cette action est irréversible.`
            : ''
        }
        confirmLabel="Annuler"
        destructive
        loading={cancel.isPending}
      />
    </AdminShell>
  );
}

// ─────────────────────────────────────────────────────────────
// MarkPaidModal
// ─────────────────────────────────────────────────────────────

function MarkPaidModal({
  payout,
  onClose,
  onDone,
}: {
  payout: Payout;
  onClose: () => void;
  onDone: () => void;
}) {
  const [method, setMethod] = useState('Wave');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post(`/admin/payouts/${payout.id}/mark_paid/`, {
        payment_method: method,
        payment_reference: reference,
      });
      onDone();
    } catch (err) {
      setError(extractApiError(err, 'Erreur.'));
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
          Marquer comme payé
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          {payout.instructor_name || payout.instructor_email} —{' '}
          <span className="font-bold">
            {formatMoney(payout.net_amount, payout.currency)}
          </span>
        </p>

        {error && (
          <p className="text-sm text-rose-700 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        <div>
          <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase mb-1">
            Moyen de paiement
          </label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="w-full border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="Wave">Wave</option>
            <option value="OrangeMoney">Orange Money</option>
            <option value="Stripe">Stripe</option>
            <option value="BankTransfer">Virement bancaire</option>
            <option value="Other">Autre</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase mb-1">
            Référence du paiement
          </label>
          <Input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="ID transaction externe"
            required
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
            disabled={loading || !reference.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-60"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            <CreditCard className="w-4 h-4" />
            Confirmer paiement
          </button>
        </div>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CreatePayoutModal — création manuelle
// ─────────────────────────────────────────────────────────────

function CreatePayoutModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [instructorId, setInstructorId] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [gross, setGross] = useState('');
  const [commission, setCommission] = useState('');
  const [tax, setTax] = useState('0');
  const [refund, setRefund] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post('/admin/payouts/', {
        instructor: Number(instructorId),
        period_start: periodStart,
        period_end: periodEnd,
        gross_amount: gross,
        commission_amount: commission,
        tax_amount: tax || '0',
        refund_amount: refund || '0',
      });
      onCreated();
    } catch (err) {
      setError(extractApiError(err, 'Erreur.'));
    } finally {
      setLoading(false);
    }
  };

  const net =
    Number(gross || 0) -
    Number(commission || 0) -
    Number(tax || 0) -
    Number(refund || 0);

  return (
    <div
      className="fixed inset-0 z-[80] bg-neutral-900/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white dark:bg-neutral-800 rounded-2xl shadow-lift p-6 space-y-3 max-h-[90vh] overflow-y-auto"
      >
        <h2 className="text-lg font-extrabold text-neutral-900 dark:text-white">
          Nouveau reversement
        </h2>

        {error && (
          <p className="text-sm text-rose-700 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl px-3 py-2">
            {error}
          </p>
        )}

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

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase mb-1">
              Début période
            </label>
            <Input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase mb-1">
              Fin période
            </label>
            <Input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase mb-1">
            Brut (XOF)
          </label>
          <Input
            type="number"
            step="0.01"
            value={gross}
            onChange={(e) => setGross(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase mb-1">
            Commission (XOF)
          </label>
          <Input
            type="number"
            step="0.01"
            value={commission}
            onChange={(e) => setCommission(e.target.value)}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase mb-1">
              Taxes (XOF)
            </label>
            <Input
              type="number"
              step="0.01"
              value={tax}
              onChange={(e) => setTax(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase mb-1">
              Remboursements (XOF)
            </label>
            <Input
              type="number"
              step="0.01"
              value={refund}
              onChange={(e) => setRefund(e.target.value)}
            />
          </div>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-800 p-3 flex items-center justify-between">
          <span className="text-xs font-bold uppercase text-emerald-800 dark:text-emerald-300">
            Net à reverser
          </span>
          <span className="font-extrabold text-emerald-800 dark:text-emerald-200 text-lg">
            {net.toLocaleString('fr-FR')} XOF
          </span>
        </div>

        <div className="flex justify-end gap-2 pt-1">
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
