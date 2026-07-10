/**
 * AdminOrganizationsPage.tsx — R31.2
 *
 * Supervision des organisations clientes.
 * Consomme `GET /api/admin/organizations/` et `PATCH /<id>/`.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  Filter,
  Building2,
  RefreshCw,
  BookOpen,
  UsersRound,
  UserCheck,
  UserX,
  Loader2,
  MapPin,
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

interface AdminOrg {
  id: number;
  name: string;
  slug: string;
  legal_name: string;
  email: string;
  phone: string;
  country: string;
  city: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  members_count: number;
  active_members_count: number;
  courses_count: number;
}

interface Page {
  count: number;
  next: string | null;
  previous: string | null;
  results: AdminOrg[];
  aggregated: { total: number; active: number };
}

export default function AdminOrganizationsPage() {
  const [q, setQ] = useState('');
  const [active, setActive] = useState<'' | 'true' | 'false'>('');
  const [page, setPage] = useState(1);
  const [suspendTarget, setSuspendTarget] = useState<AdminOrg | null>(null);
  const qc = useQueryClient();

  const { data, isLoading, isFetching, isError, refetch } = useQuery<Page>({
    queryKey: ['admin-organizations', q, active, page],
    queryFn: async () => {
      const params: Record<string, string> = { page: String(page) };
      if (q) params.q = q;
      if (active) params.active = active;
      const res = await api.get<Page>('/admin/organizations/', { params });
      return res.data;
    },
    staleTime: 30_000,
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      await api.patch(`/admin/organizations/${id}/`, { is_active: isActive });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-organizations'] });
    },
  });

  const rows = data?.results ?? [];
  const agg = data?.aggregated ?? { total: 0, active: 0 };
  const totalPages = data ? Math.max(1, Math.ceil(data.count / 25)) : 1;

  const columns: DataTableColumn<AdminOrg>[] = [
    {
      key: 'name',
      header: 'Organisation',
      render: (r) => (
        <div className="min-w-0">
          <p className="font-bold text-neutral-900 dark:text-white truncate max-w-xs">
            {r.name}
          </p>
          {r.legal_name && (
            <p className="text-[11px] text-neutral-500 truncate max-w-xs">
              {r.legal_name}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'location',
      header: 'Localisation',
      render: (r) =>
        r.city || r.country ? (
          <span className="inline-flex items-center gap-1 text-xs text-neutral-600 dark:text-neutral-300">
            <MapPin className="w-3.5 h-3.5" />
            {[r.city, r.country].filter(Boolean).join(', ')}
          </span>
        ) : (
          <span className="text-xs text-neutral-400">—</span>
        ),
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (r) => (
        <div className="text-xs text-neutral-600 dark:text-neutral-300">
          {r.email && <p className="truncate max-w-[180px]">{r.email}</p>}
          {r.phone && <p>{r.phone}</p>}
          {!r.email && !r.phone && <span className="text-neutral-400">—</span>}
        </div>
      ),
    },
    {
      key: 'members',
      header: 'Membres',
      align: 'right',
      width: '110px',
      sortAccessor: (r) => r.members_count,
      render: (r) => (
        <div className="text-right">
          <p className="font-bold text-neutral-900 dark:text-white">
            {r.members_count}
          </p>
          <p className="text-[11px] text-neutral-500">
            {r.active_members_count} actifs
          </p>
        </div>
      ),
    },
    {
      key: 'courses',
      header: 'Cours',
      align: 'right',
      width: '90px',
      sortAccessor: (r) => r.courses_count,
      render: (r) => (
        <span className="font-semibold text-neutral-800 dark:text-neutral-100">
          {r.courses_count}
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
      sortAccessor: (r) => r.created_at,
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
        title="Organisations"
        subtitle={`${agg.total.toLocaleString('fr-FR')} organisations — ${agg.active} actives`}
        breadcrumbs={[
          { label: 'Administration', to: '/dashboard/admin' },
          { label: 'Communauté' },
          { label: 'Organisations' },
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard
          Icon={Building2}
          label="Total organisations"
          value={agg.total.toLocaleString('fr-FR')}
          tone="primary"
        />
        <StatCard
          Icon={UserCheck}
          label="Actives"
          value={agg.active.toLocaleString('fr-FR')}
          tone="emerald"
        />
        <StatCard
          Icon={UsersRound}
          label="Membres (page)"
          value={rows.reduce((s, r) => s + r.members_count, 0).toLocaleString('fr-FR')}
          tone="sky"
        />
        <StatCard
          Icon={BookOpen}
          label="Cours (page)"
          value={rows.reduce((s, r) => s + r.courses_count, 0).toLocaleString('fr-FR')}
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
                placeholder="Nom, raison sociale, email…"
                value={q}
                onChange={(e) => {
                  setPage(1);
                  setQ(e.target.value);
                }}
                className="pl-10"
              />
            </div>
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
              Icon={Building2}
              title="Aucune organisation"
              description="Aucune organisation ne correspond aux filtres appliqués."
            />
          }
          rowActions={(r) => (
            <div className="flex items-center justify-end gap-1">
              <button
                type="button"
                onClick={() =>
                  r.is_active
                    ? setSuspendTarget(r)
                    : toggleActive.mutate({ id: r.id, isActive: true })
                }
                disabled={toggleActive.isPending}
                className={
                  'p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-40 ' +
                  (r.is_active
                    ? 'text-neutral-500 hover:text-rose-600'
                    : 'text-neutral-500 hover:text-emerald-600')
                }
                title={r.is_active ? 'Suspendre' : 'Réactiver'}
              >
                {toggleActive.isPending && toggleActive.variables?.id === r.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : r.is_active ? (
                  <UserX className="w-4 h-4" />
                ) : (
                  <UserCheck className="w-4 h-4" />
                )}
              </button>
            </div>
          )}
        />
      )}

      {data && data.count > 25 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <p className="text-neutral-500">
            Page {page} / {totalPages} — {data.count} organisations
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
        open={!!suspendTarget}
        onClose={() => setSuspendTarget(null)}
        onConfirm={async () => {
          if (!suspendTarget) return;
          try {
            await toggleActive.mutateAsync({
              id: suspendTarget.id,
              isActive: false,
            });
            setSuspendTarget(null);
          } catch (err) {
            alert(extractApiError(err, 'Impossible de suspendre.'));
          }
        }}
        title="Suspendre cette organisation ?"
        description={
          suspendTarget
            ? `${suspendTarget.name} sera désactivée. Ses membres ne pourront plus accéder à ses ressources.`
            : ''
        }
        confirmLabel="Suspendre"
        destructive
        loading={toggleActive.isPending}
      />
    </AdminShell>
  );
}
