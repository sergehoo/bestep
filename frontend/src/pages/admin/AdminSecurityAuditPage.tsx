/**
 * AdminSecurityAuditPage.tsx — SECURITE-06
 *
 * Journal unifié des événements de sécurité admin (source de vérité :
 * `AIAuditLog` backend, endpoint `/api/admin/audit/security/`).
 *
 * Kinds affichés :
 *   - INSTRUCTOR_APPROVED / INSTRUCTOR_REJECTED
 *   - USER_SUSPENDED / USER_REACTIVATED / USER_ROLE_CHANGED
 *   - EMAIL_FORCE_VERIFIED
 *
 * Fonctionnalités :
 *   - Table paginée (25 par page)
 *   - Filtres kind + admin_id + fenêtre days
 *   - Compteurs by-kind dans le header (StatCard réutilisés)
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ShieldAlert,
  Filter,
  User,
  Clock,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AtSign,
  Ban,
  RotateCcw,
  ShieldCheck,
  Download,
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

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type SecurityKind =
  | 'INSTRUCTOR_APPROVED'
  | 'INSTRUCTOR_REJECTED'
  | 'USER_SUSPENDED'
  | 'USER_REACTIVATED'
  | 'USER_ROLE_CHANGED'
  | 'EMAIL_FORCE_VERIFIED';

interface SecurityEvent {
  id: number;
  kind: SecurityKind;
  created_at: string;
  admin: { id: number | null; email: string | null };
  target: { user_id: number | null; email: string | null };
  payload: Record<string, unknown>;
}

interface Page {
  count: number;
  next: string | null;
  previous: string | null;
  results: SecurityEvent[];
  aggregated: {
    total: number;
    by_kind: Record<SecurityKind, number>;
  };
  window_days: number;
}

interface Filters {
  kind: '' | SecurityKind;
  admin_id: string;
  days: string;
}

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const KIND_OPTIONS: { value: '' | SecurityKind; label: string }[] = [
  { value: '', label: 'Tous les événements' },
  { value: 'INSTRUCTOR_APPROVED', label: 'Approbation formateur' },
  { value: 'INSTRUCTOR_REJECTED', label: 'Refus formateur' },
  { value: 'USER_SUSPENDED', label: 'Suspension user' },
  { value: 'USER_REACTIVATED', label: 'Réactivation user' },
  { value: 'USER_ROLE_CHANGED', label: 'Changement de rôle' },
  { value: 'EMAIL_FORCE_VERIFIED', label: 'E-mail forcé (support)' },
];

const KIND_LABEL: Record<SecurityKind, string> = {
  INSTRUCTOR_APPROVED: 'Approbation formateur',
  INSTRUCTOR_REJECTED: 'Refus formateur',
  USER_SUSPENDED: 'Suspension',
  USER_REACTIVATED: 'Réactivation',
  USER_ROLE_CHANGED: 'Changement de rôle',
  EMAIL_FORCE_VERIFIED: 'E-mail forcé',
};

function kindToStatus(kind: SecurityKind): StatusKind {
  switch (kind) {
    case 'INSTRUCTOR_APPROVED':
    case 'USER_REACTIVATED':
      return 'success';
    case 'INSTRUCTOR_REJECTED':
    case 'USER_SUSPENDED':
      return 'failed';
    case 'USER_ROLE_CHANGED':
      return 'warning';
    case 'EMAIL_FORCE_VERIFIED':
      return 'info';
    default:
      return 'info';
  }
}

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────

export default function AdminSecurityAuditPage() {
  const [filters, setFilters] = useState<Filters>({
    kind: '',
    admin_id: '',
    days: '90',
  });
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching, isError, refetch } = useQuery<Page>({
    queryKey: ['admin-audit-security', filters, page],
    queryFn: async () => {
      const params: Record<string, string> = { page: String(page) };
      if (filters.kind) params.kind = filters.kind;
      if (filters.admin_id) params.admin_id = filters.admin_id;
      if (filters.days) params.days = filters.days;
      const res = await api.get<Page>('/admin/audit/security/', { params });
      return res.data;
    },
    staleTime: 15_000,
  });

  const rows = data?.results ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.count / 25)) : 1;
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const params: Record<string, string> = {};
      if (filters.kind) params.kind = filters.kind;
      if (filters.admin_id) params.admin_id = filters.admin_id;
      if (filters.days) params.days = filters.days;
      const res = await api.get<Blob>('/admin/audit/security/export/', {
        params,
        responseType: 'blob',
      });
      // Récupère le filename du header ou fallback
      const cd = String(res.headers?.['content-disposition'] ?? '');
      const match = cd.match(/filename="?([^";]+)"?/i);
      const filename = match?.[1] ?? 'audit-security.csv';
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // Silencieux — l'interceptor axios gère déjà 401/403.
    } finally {
      setExporting(false);
    }
  }
  const agg = data?.aggregated ?? {
    total: 0,
    by_kind: {
      INSTRUCTOR_APPROVED: 0,
      INSTRUCTOR_REJECTED: 0,
      USER_SUSPENDED: 0,
      USER_REACTIVATED: 0,
      USER_ROLE_CHANGED: 0,
      EMAIL_FORCE_VERIFIED: 0,
    },
  };

  const columns: DataTableColumn<SecurityEvent>[] = [
    {
      key: 'created_at',
      header: 'Date',
      width: '160px',
      sortAccessor: (r) => r.created_at,
      render: (r) => (
        <span className="text-xs text-neutral-700 dark:text-neutral-200 whitespace-nowrap inline-flex items-center gap-1">
          <Clock className="w-3 h-3 text-neutral-400" />
          {new Date(r.created_at).toLocaleString('fr-FR')}
        </span>
      ),
    },
    {
      key: 'kind',
      header: 'Type',
      width: '200px',
      render: (r) => (
        <StatusBadge status={kindToStatus(r.kind)}>
          {KIND_LABEL[r.kind] || r.kind}
        </StatusBadge>
      ),
    },
    {
      key: 'target',
      header: 'Cible',
      render: (r) => (
        <div className="min-w-0">
          <p className="text-sm font-semibold text-neutral-900 dark:text-white truncate max-w-xs">
            {r.target.email || '—'}
          </p>
          {r.target.user_id != null && (
            <p className="text-[11px] text-neutral-500">
              ID #{r.target.user_id}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'admin',
      header: 'Par',
      render: (r) => (
        <div className="min-w-0">
          <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-100 truncate">
            {r.admin.email || '—'}
          </p>
          {r.admin.id != null && (
            <p className="text-[11px] text-neutral-500">
              ID #{r.admin.id}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'payload',
      header: 'Détail',
      render: (r) => {
        // Extraction utile selon le kind
        const p = r.payload || {};
        if (r.kind === 'INSTRUCTOR_REJECTED' && p.reason) {
          return (
            <span
              className="text-xs italic text-neutral-600 dark:text-neutral-300"
              title={String(p.reason)}
            >
              « {String(p.reason).slice(0, 60)}
              {String(p.reason).length > 60 ? '…' : ''} »
            </span>
          );
        }
        if (r.kind === 'USER_ROLE_CHANGED') {
          return (
            <span className="text-xs font-mono text-neutral-600 dark:text-neutral-300">
              {String(p.previous_role || '—')}
              <span className="mx-1 text-neutral-400">→</span>
              {String(p.new_role || '—')}
            </span>
          );
        }
        if (r.kind === 'USER_SUSPENDED' || r.kind === 'USER_REACTIVATED') {
          return (
            <span className="text-xs text-neutral-500">
              is_active : {String(p.previous_is_active)} →{' '}
              {String(p.new_is_active)}
            </span>
          );
        }
        return <span className="text-xs text-neutral-400">—</span>;
      },
    },
  ];

  return (
    <AdminShell>
      <PageHeader
        title="Audit sécurité"
        subtitle="Journal des décisions admin sensibles (approbations, suspensions, changements de rôle)."
        breadcrumbs={[
          { label: 'Administration', to: '/dashboard/admin' },
          { label: 'Plateforme' },
          { label: 'Audit sécurité' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting || isFetching}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition disabled:opacity-60"
              title="Exporter les événements filtrés au format CSV (max 10 000 lignes)"
            >
              <Download
                className={`w-4 h-4 ${exporting ? 'animate-pulse' : ''}`}
              />
              {exporting ? 'Export en cours…' : 'Exporter CSV'}
            </button>
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition disabled:opacity-60"
            >
              <RefreshCw
                className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`}
              />
              Rafraîchir
            </button>
          </div>
        }
      />

      {/* KPIs — 6 cards for the 6 kinds */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
        <StatCard
          Icon={CheckCircle2}
          label="Approbations"
          value={agg.by_kind.INSTRUCTOR_APPROVED.toLocaleString('fr-FR')}
          tone="emerald"
        />
        <StatCard
          Icon={XCircle}
          label="Refus"
          value={agg.by_kind.INSTRUCTOR_REJECTED.toLocaleString('fr-FR')}
          tone="rose"
        />
        <StatCard
          Icon={Ban}
          label="Suspensions"
          value={agg.by_kind.USER_SUSPENDED.toLocaleString('fr-FR')}
          tone="rose"
        />
        <StatCard
          Icon={RotateCcw}
          label="Réactivations"
          value={agg.by_kind.USER_REACTIVATED.toLocaleString('fr-FR')}
          tone="emerald"
        />
        <StatCard
          Icon={ShieldCheck}
          label="Rôles modifiés"
          value={agg.by_kind.USER_ROLE_CHANGED.toLocaleString('fr-FR')}
          tone="violet"
        />
        <StatCard
          Icon={AtSign}
          label="E-mails forcés"
          value={agg.by_kind.EMAIL_FORCE_VERIFIED.toLocaleString('fr-FR')}
          tone="primary"
        />
      </div>

      {/* Filtres */}
      <Card className="mb-5">
        <CardBody>
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-neutral-500" />
            <span className="text-xs font-bold uppercase tracking-wide text-neutral-700 dark:text-neutral-300">
              Filtres
            </span>
            {data?.window_days && (
              <span className="text-[11px] text-neutral-500">
                Fenêtre : {data.window_days} jours
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <select
              value={filters.kind}
              onChange={(e) => {
                setPage(1);
                setFilters((f) => ({
                  ...f,
                  kind: e.target.value as Filters['kind'],
                }));
              }}
              className="border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <Input
                placeholder="ID admin auteur…"
                value={filters.admin_id}
                onChange={(e) => {
                  setPage(1);
                  setFilters((f) => ({ ...f, admin_id: e.target.value }));
                }}
                className="pl-10"
              />
            </div>
            <select
              value={filters.days}
              onChange={(e) => {
                setPage(1);
                setFilters((f) => ({ ...f, days: e.target.value }));
              }}
              className="border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="7">7 derniers jours</option>
              <option value="30">30 derniers jours</option>
              <option value="90">90 derniers jours</option>
              <option value="180">180 derniers jours</option>
              <option value="365">365 derniers jours</option>
            </select>
          </div>
        </CardBody>
      </Card>

      {/* Table */}
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
              Icon={ShieldAlert}
              title="Aucun événement de sécurité"
              description="Aucun événement ne correspond aux filtres. Élargissez la fenêtre ou changez le type."
            />
          }
        />
      )}

      {/* Pagination */}
      {data && data.count > 25 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <p className="text-neutral-500">
            Page {page} / {totalPages} — {data.count} événement
            {data.count > 1 ? 's' : ''}
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
    </AdminShell>
  );
}
