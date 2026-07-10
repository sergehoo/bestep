/**
 * AdminAuditLogPage.tsx — R28.4
 *
 * Journal d'audit lifecycle des cours (source de vérité : `CourseLifecycleEvent`
 * backend, endpoint `/api/admin/audit/course-lifecycle/`).
 *
 * Fonctionnalités :
 *   - Table paginée (30 par page)
 *   - Filtre par action (CREATED, PUBLISHED, UNPUBLISHED, ARCHIVED, RESTORED…)
 *   - Filtre par acteur (id user) et cours (id course)
 *   - Filtre depuis une date (ISO)
 *
 * Roadmap R29+ : élargir l'audit à toutes les actions sensibles (user
 * disable, role change, refunds, etc.) — endpoint générique
 * `/api/admin/audit/` à créer.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ScrollText,
  Filter,
  User,
  BookOpen,
  Clock,
  RefreshCw,
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
} from '@/components/admin/primitives';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface AuditEvent {
  id: number;
  course_id: number | null;
  course_title: string;
  actor_id: number | null;
  actor_name: string;
  actor_email: string;
  action: string;
  action_label: string;
  from_status: string;
  to_status: string;
  note: string;
  created_at: string;
}

interface Page {
  count: number;
  next: string | null;
  previous: string | null;
  results: AuditEvent[];
}

interface Filters {
  action: string;
  course_id: string;
  actor_id: string;
  since: string;
}

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const ACTIONS = [
  { value: '', label: 'Toutes actions' },
  { value: 'CREATED', label: 'Création' },
  { value: 'UPDATED', label: 'Modification' },
  { value: 'SUBMITTED', label: 'Soumis en validation' },
  { value: 'PUBLISHED', label: 'Publié' },
  { value: 'UNPUBLISHED', label: 'Dépublié' },
  { value: 'ARCHIVED', label: 'Archivé' },
  { value: 'RESTORED', label: 'Restauré' },
  { value: 'DELETED', label: 'Supprimé' },
];

/** Convertit une action backend en `StatusKind` pour le rendu badge. */
function actionToStatus(action: string): StatusKind {
  switch (action) {
    case 'PUBLISHED':
    case 'RESTORED':
      return 'success';
    case 'UNPUBLISHED':
    case 'ARCHIVED':
      return 'warning';
    case 'DELETED':
      return 'failed';
    case 'SUBMITTED':
      return 'pending';
    case 'CREATED':
    case 'UPDATED':
      return 'info';
    default:
      return 'info';
  }
}

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────

export default function AdminAuditLogPage() {
  const [filters, setFilters] = useState<Filters>({
    action: '',
    course_id: '',
    actor_id: '',
    since: '',
  });
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching, isError, refetch } = useQuery<Page>({
    queryKey: ['admin-audit-course-lifecycle', filters, page],
    queryFn: async () => {
      const params: Record<string, string> = { page: String(page) };
      if (filters.action) params.action = filters.action;
      if (filters.course_id) params.course_id = filters.course_id;
      if (filters.actor_id) params.actor_id = filters.actor_id;
      if (filters.since) params.since = filters.since;
      const res = await api.get<Page>('/admin/audit/course-lifecycle/', {
        params,
      });
      return res.data;
    },
    staleTime: 15_000,
  });

  const rows = data?.results ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.count / 30)) : 1;

  const columns: DataTableColumn<AuditEvent>[] = [
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
      key: 'action',
      header: 'Action',
      width: '160px',
      render: (r) => (
        <StatusBadge status={actionToStatus(r.action)}>
          {r.action_label}
        </StatusBadge>
      ),
    },
    {
      key: 'course',
      header: 'Cours',
      render: (r) => (
        <div className="min-w-0">
          <p className="font-semibold text-neutral-900 dark:text-white truncate max-w-xs">
            {r.course_title}
          </p>
          <p className="text-[11px] text-neutral-500">
            ID #{r.course_id ?? '—'}
          </p>
        </div>
      ),
    },
    {
      key: 'actor',
      header: 'Acteur',
      render: (r) => (
        <div className="min-w-0">
          <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-100 truncate">
            {r.actor_name}
          </p>
          {r.actor_email && (
            <p className="text-[11px] text-neutral-500 truncate">
              {r.actor_email}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'transition',
      header: 'Transition',
      render: (r) =>
        r.from_status || r.to_status ? (
          <span className="text-xs font-mono text-neutral-600 dark:text-neutral-300">
            {r.from_status || '—'}
            <span className="mx-1 text-neutral-400">→</span>
            {r.to_status || '—'}
          </span>
        ) : (
          <span className="text-xs text-neutral-400">—</span>
        ),
    },
    {
      key: 'note',
      header: 'Note',
      render: (r) => (
        <span className="text-xs text-neutral-600 dark:text-neutral-300">
          {r.note || <span className="text-neutral-400">—</span>}
        </span>
      ),
    },
  ];

  return (
    <AdminShell>
      <PageHeader
        title="Journal système"
        subtitle="Audit du cycle de vie des cours (création, publication, archivage, restauration)."
        breadcrumbs={[
          { label: 'Administration', to: '/dashboard/admin' },
          { label: 'Journal système' },
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
              value={filters.action}
              onChange={(e) => {
                setPage(1);
                setFilters((f) => ({ ...f, action: e.target.value }));
              }}
              className="border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {ACTIONS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
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
                placeholder="ID acteur…"
                value={filters.actor_id}
                onChange={(e) => {
                  setPage(1);
                  setFilters((f) => ({ ...f, actor_id: e.target.value }));
                }}
                className="pl-10"
              />
            </div>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <Input
                type="datetime-local"
                value={filters.since}
                onChange={(e) => {
                  setPage(1);
                  setFilters((f) => ({ ...f, since: e.target.value }));
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
              Icon={ScrollText}
              title="Aucun événement d'audit"
              description="Aucun événement ne correspond aux filtres. Élargissez la période ou changez d'action."
            />
          }
        />
      )}

      {/* Pagination */}
      {data && data.count > 30 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <p className="text-neutral-500">
            Page {page} / {totalPages} — {data.count} événements
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
