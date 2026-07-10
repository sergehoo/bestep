/**
 * AdminEnrollmentsPage.tsx — R28.5
 *
 * Supervision de toutes les inscriptions plateforme.
 * Consomme `/api/admin/enrollments/`.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ClipboardList,
  Filter,
  Search,
  User,
  BookOpen,
  RefreshCw,
  ExternalLink,
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

interface AdminEnrollment {
  id: number;
  user_id: number;
  user_email: string;
  user_full_name: string;
  course_id: number;
  course_slug: string;
  course_title: string;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELED';
  progress_percent: number;
  enrolled_at: string;
  completed_at: string | null;
  updated_at: string;
}

interface Page {
  count: number;
  next: string | null;
  previous: string | null;
  results: AdminEnrollment[];
  aggregated: { total: number };
}

const STATUSES = [
  { value: '', label: 'Tous statuts' },
  { value: 'ACTIVE', label: 'Actif' },
  { value: 'COMPLETED', label: 'Terminé' },
  { value: 'CANCELED', label: 'Annulé' },
];

function statusToKind(s: string): StatusKind {
  return s === 'COMPLETED'
    ? 'success'
    : s === 'CANCELED'
      ? 'inactive'
      : 'active';
}

export default function AdminEnrollmentsPage() {
  const [filters, setFilters] = useState({
    status: '',
    course_id: '',
    user_id: '',
    q: '',
  });
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching, isError, refetch } = useQuery<Page>({
    queryKey: ['admin-enrollments', filters, page],
    queryFn: async () => {
      const params: Record<string, string> = { page: String(page) };
      if (filters.status) params.status = filters.status;
      if (filters.course_id) params.course_id = filters.course_id;
      if (filters.user_id) params.user_id = filters.user_id;
      if (filters.q) params.q = filters.q;
      const res = await api.get<Page>('/admin/enrollments/', { params });
      return res.data;
    },
    staleTime: 15_000,
  });

  const rows = data?.results ?? [];
  const total = data?.aggregated?.total ?? data?.count ?? 0;
  const totalPages = data ? Math.max(1, Math.ceil(data.count / 30)) : 1;

  // Stats page (basées sur les 30 rows visibles pour vue rapide)
  const activeCount = rows.filter((r) => r.status === 'ACTIVE').length;
  const completedCount = rows.filter((r) => r.status === 'COMPLETED').length;
  const canceledCount = rows.filter((r) => r.status === 'CANCELED').length;

  const columns: DataTableColumn<AdminEnrollment>[] = [
    {
      key: 'user',
      header: 'Apprenant',
      render: (r) => (
        <div className="min-w-0">
          <Link
            to={`/admin/users/${r.user_id}`}
            className="font-semibold text-neutral-900 dark:text-white truncate block hover:text-primary-600"
          >
            {r.user_full_name || r.user_email}
          </Link>
          <p className="text-[11px] text-neutral-500 truncate">
            {r.user_email}
          </p>
        </div>
      ),
    },
    {
      key: 'course',
      header: 'Cours',
      render: (r) => (
        <div className="min-w-0">
          <Link
            to={`/courses/${r.course_slug}`}
            target="_blank"
            className="font-semibold text-neutral-900 dark:text-white truncate block max-w-xs hover:text-primary-600"
          >
            {r.course_title}
          </Link>
          <p className="text-[11px] text-neutral-500">
            ID #{r.course_id}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      width: '110px',
      render: (r) => <StatusBadge status={statusToKind(r.status)} />,
    },
    {
      key: 'progress',
      header: 'Progression',
      width: '140px',
      align: 'right',
      sortAccessor: (r) => r.progress_percent,
      render: (r) => (
        <div className="text-right">
          <div className="w-full h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded overflow-hidden">
            <div
              className="h-full bg-primary-500 transition-all"
              style={{ width: `${Math.max(0, Math.min(100, r.progress_percent))}%` }}
            />
          </div>
          <span className="text-[11px] text-neutral-600 dark:text-neutral-400 font-semibold">
            {r.progress_percent}%
          </span>
        </div>
      ),
    },
    {
      key: 'enrolled_at',
      header: 'Inscrit le',
      width: '130px',
      sortAccessor: (r) => r.enrolled_at,
      render: (r) => (
        <span className="text-xs text-neutral-600 dark:text-neutral-400">
          {new Date(r.enrolled_at).toLocaleDateString('fr-FR')}
        </span>
      ),
    },
    {
      key: 'completed_at',
      header: 'Terminé le',
      width: '130px',
      render: (r) => (
        <span className="text-xs text-neutral-600 dark:text-neutral-400">
          {r.completed_at
            ? new Date(r.completed_at).toLocaleDateString('fr-FR')
            : '—'}
        </span>
      ),
    },
  ];

  return (
    <AdminShell>
      <PageHeader
        title="Inscriptions"
        subtitle={`${total.toLocaleString('fr-FR')} inscriptions au total. Vue globale et supervision.`}
        breadcrumbs={[
          { label: 'Administration', to: '/dashboard/admin' },
          { label: 'Catalogue', to: '/admin/courses' },
          { label: 'Inscriptions' },
        ]}
        actions={
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
        }
      />

      {/* KPI rapides (page courante) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard
          Icon={ClipboardList}
          label="Total inscriptions"
          value={total.toLocaleString('fr-FR')}
          tone="primary"
        />
        <StatCard
          Icon={User}
          label="Actives (page)"
          value={activeCount}
          tone="emerald"
        />
        <StatCard
          Icon={BookOpen}
          label="Terminées (page)"
          value={completedCount}
          tone="sky"
        />
        <StatCard
          Icon={ExternalLink}
          label="Annulées (page)"
          value={canceledCount}
          tone="rose"
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
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <select
              value={filters.status}
              onChange={(e) => {
                setPage(1);
                setFilters((f) => ({ ...f, status: e.target.value }));
              }}
              className="border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <div className="relative">
              <BookOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <Input
                placeholder="ID cours…"
                value={filters.course_id}
                onChange={(e) => {
                  setPage(1);
                  setFilters((f) => ({ ...f, course_id: e.target.value }));
                }}
                className="pl-10"
              />
            </div>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <Input
                placeholder="ID user…"
                value={filters.user_id}
                onChange={(e) => {
                  setPage(1);
                  setFilters((f) => ({ ...f, user_id: e.target.value }));
                }}
                className="pl-10"
              />
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <Input
                placeholder="Email apprenant…"
                value={filters.q}
                onChange={(e) => {
                  setPage(1);
                  setFilters((f) => ({ ...f, q: e.target.value }));
                }}
                className="pl-10"
              />
            </div>
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
              Icon={ClipboardList}
              title="Aucune inscription"
              description="Aucune inscription ne correspond aux filtres appliqués."
            />
          }
        />
      )}

      {/* Pagination */}
      {data && data.count > 30 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <p className="text-neutral-500">
            Page {page} / {totalPages} — {data.count} inscriptions
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
