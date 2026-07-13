/**
 * AdminInstructorsPage.tsx
 *
 * Vue d'ensemble des formateurs plateforme.
 * Consomme `GET /api/admin/instructors/`.
 *
 * Fonctionnalités :
 *   - Table paginée avec DataTable (sort sur note/inscrits/cours)
 *   - Filtres : recherche, statut vérifié, actif
 *   - KPI : total / vérifiés / actifs
 *   - Actions : voir profil détaillé (/admin/users/:id), toggle actif
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Search,
  Filter,
  GraduationCap,
  BadgeCheck,
  RefreshCw,
  Star,
  BookOpen,
  ExternalLink,
  UserCheck,
  UserX,
  Loader2,
  History,
  X as XIcon,
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

interface AdminInstructor {
  id: number;
  email: string;
  full_name: string;
  phone: string;
  avatar_url: string | null;
  date_joined: string;
  last_login: string | null;
  is_active: boolean;

  headline: string;
  bio: string;
  is_verified: boolean;
  payout_percent: string;

  published_courses: number;
  total_courses: number;
  total_enrollments: number;
  avg_rating: number | null;
  rating_count: number;
}

interface Page {
  count: number;
  next: string | null;
  previous: string | null;
  results: AdminInstructor[];
  aggregated: { total: number; verified: number; active: number };
}

interface Filters {
  q: string;
  verified: '' | 'true' | 'false';
  active: '' | 'true' | 'false';
}

interface HistoryEvent {
  id: number;
  kind: 'INSTRUCTOR_APPROVED' | 'INSTRUCTOR_REJECTED' | 'EMAIL_FORCE_VERIFIED';
  created_at: string;
  admin: { id: number | null; email: string | null };
  target: { user_id: number | null; email: string | null };
  reason: string;
}

interface HistoryPayload {
  events: HistoryEvent[];
  total: number;
}

export default function AdminInstructorsPage() {
  // SECURITE-06 — Auto-application du filtre depuis les query params URL
  // permet au lien /admin/instructors?verified=false (depuis le cockpit
  // ou l'alerte "formateurs en attente") de pré-filtrer la liste.
  const [searchParams] = useSearchParams();
  const initialVerified = searchParams.get('verified');
  const initialActive = searchParams.get('active');
  const [filters, setFilters] = useState<Filters>({
    q: searchParams.get('q') ?? '',
    verified:
      initialVerified === 'true' || initialVerified === 'false'
        ? initialVerified
        : '',
    active:
      initialActive === 'true' || initialActive === 'false'
        ? initialActive
        : '',
  });
  const [page, setPage] = useState(1);
  const [suspendTarget, setSuspendTarget] = useState<AdminInstructor | null>(
    null,
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const qc = useQueryClient();

  // SECURITE-06 — Historique des décisions formateur, ne se déclenche que
  // quand l'utilisateur ouvre le drawer.
  const historyQuery = useQuery<HistoryPayload>({
    queryKey: ['admin-instructors-history'],
    queryFn: async () => {
      const res = await api.get<HistoryPayload>('/admin/instructors/history/');
      return res.data;
    },
    enabled: historyOpen,
    staleTime: 30_000,
  });

  const { data, isLoading, isFetching, isError, refetch } = useQuery<Page>({
    queryKey: ['admin-instructors', filters, page],
    queryFn: async () => {
      const params: Record<string, string> = { page: String(page) };
      if (filters.q) params.q = filters.q;
      if (filters.verified) params.verified = filters.verified;
      if (filters.active) params.active = filters.active;
      const res = await api.get<Page>('/admin/instructors/', { params });
      return res.data;
    },
    staleTime: 30_000,
  });

  // Mutation toggle is_active via l'endpoint admin/users/<id>/ existant (R7)
  const toggleActive = useMutation({
    mutationFn: async ({
      userId,
      isActive,
    }: {
      userId: number;
      isActive: boolean;
    }) => {
      const res = await api.patch(`/admin/users/${userId}/`, {
        is_active: isActive,
      });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-instructors'] });
    },
  });

  // SECURITE-06 — Approbation / Refus formateur.
  const approveInstructor = useMutation({
    mutationFn: async (userId: number) => {
      const res = await api.post(`/admin/instructors/${userId}/approve/`);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-instructors'] });
    },
  });

  const rejectInstructor = useMutation({
    mutationFn: async ({
      userId,
      reason,
    }: {
      userId: number;
      reason: string;
    }) => {
      const res = await api.post(`/admin/instructors/${userId}/reject/`, {
        reason,
      });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-instructors'] });
    },
  });

  function handleApprove(userId: number, email: string) {
    if (
      !window.confirm(
        `Approuver ${email} comme formateur ? Il pourra publier des cours immédiatement.`,
      )
    ) return;
    approveInstructor.mutate(userId);
  }

  function handleReject(userId: number, email: string) {
    const reason = window.prompt(
      `Motif de refus pour ${email} (optionnel) :`,
      '',
    );
    if (reason === null) return; // annulé
    rejectInstructor.mutate({ userId, reason: reason.trim() });
  }

  const rows = data?.results ?? [];
  const agg = data?.aggregated ?? { total: 0, verified: 0, active: 0 };
  const totalPages = data ? Math.max(1, Math.ceil(data.count / 25)) : 1;

  const columns: DataTableColumn<AdminInstructor>[] = [
    {
      key: 'formateur',
      header: 'Formateur',
      render: (r) => (
        <div className="flex items-center gap-3 min-w-0">
          {r.avatar_url ? (
            <img
              src={r.avatar_url}
              alt=""
              className="w-9 h-9 rounded-full object-cover"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold shrink-0">
              {(r.full_name || r.email).charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Link
                to={`/admin/users/${r.id}`}
                className="font-bold text-neutral-900 dark:text-white truncate max-w-[180px] hover:text-primary-600"
              >
                {r.full_name || r.email.split('@')[0]}
              </Link>
              {r.is_verified && (
                <span title="Formateur vérifié" className="shrink-0">
                  <BadgeCheck className="w-4 h-4 text-primary-600" />
                </span>
              )}
            </div>
            <p className="text-[11px] text-neutral-500 truncate max-w-[220px]">
              {r.email}
            </p>
            {r.headline && (
              <p className="text-[11px] text-neutral-500 truncate max-w-[220px] italic">
                {r.headline}
              </p>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      width: '120px',
      render: (r) =>
        r.is_active ? (
          <StatusBadge status="active" />
        ) : (
          <StatusBadge status="inactive" />
        ),
    },
    {
      key: 'courses',
      header: 'Cours',
      align: 'right',
      width: '110px',
      sortAccessor: (r) => r.published_courses,
      render: (r) => (
        <div className="text-right">
          <p className="font-bold text-neutral-900 dark:text-white">
            {r.published_courses}
          </p>
          <p className="text-[11px] text-neutral-500">
            / {r.total_courses} total
          </p>
        </div>
      ),
    },
    {
      key: 'enrollments',
      header: 'Inscrits',
      align: 'right',
      width: '90px',
      sortAccessor: (r) => r.total_enrollments,
      render: (r) => (
        <span className="font-semibold text-neutral-800 dark:text-neutral-100">
          {r.total_enrollments.toLocaleString('fr-FR')}
        </span>
      ),
    },
    {
      key: 'rating',
      header: 'Note',
      align: 'right',
      width: '110px',
      sortAccessor: (r) => r.avg_rating ?? 0,
      render: (r) =>
        r.avg_rating != null ? (
          <div className="text-right">
            <span className="inline-flex items-center gap-1 font-bold text-neutral-900 dark:text-white">
              <Star className="w-3.5 h-3.5 fill-accent-500 text-accent-500" />
              {r.avg_rating.toFixed(2)}
            </span>
            <p className="text-[11px] text-neutral-500">
              {r.rating_count} avis
            </p>
          </div>
        ) : (
          <span className="text-xs text-neutral-400">—</span>
        ),
    },
    {
      key: 'payout',
      header: 'Reversement',
      align: 'right',
      width: '110px',
      sortAccessor: (r) => Number(r.payout_percent),
      render: (r) => (
        <span className="text-sm font-semibold text-primary-700 dark:text-primary-400">
          {Number(r.payout_percent).toFixed(0)}%
        </span>
      ),
    },
    {
      key: 'joined',
      header: 'Inscrit le',
      width: '110px',
      sortAccessor: (r) => r.date_joined,
      render: (r) => (
        <span className="text-xs text-neutral-500">
          {new Date(r.date_joined).toLocaleDateString('fr-FR')}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      width: '180px',
      render: (r) => (
        <div className="flex items-center gap-1.5">
          {!r.is_verified ? (
            <button
              type="button"
              onClick={() => handleApprove(r.id, r.email)}
              disabled={approveInstructor.isPending}
              className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50"
              title="Approuver — le formateur pourra publier des cours"
            >
              Approuver
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleReject(r.id, r.email)}
              disabled={rejectInstructor.isPending}
              className="px-2.5 py-1 rounded-md border border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/50 text-xs font-semibold disabled:opacity-50"
              title="Retirer l'agrément"
            >
              Retirer
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <AdminShell>
      <PageHeader
        title="Formateurs"
        subtitle={`${agg.total.toLocaleString('fr-FR')} formateurs — ${agg.verified} vérifiés, ${agg.active} actifs`}
        breadcrumbs={[
          { label: 'Administration', to: '/dashboard/admin' },
          { label: 'Communauté' },
          { label: 'Formateurs' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition"
              title="Historique des décisions récentes"
            >
              <History className="w-4 h-4" />
              Historique
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

      {historyOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Historique des décisions"
          className="fixed inset-0 z-50 flex justify-end bg-black/40"
          onClick={() => setHistoryOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md h-full bg-white dark:bg-neutral-900 shadow-xl border-l border-neutral-200 dark:border-neutral-800 overflow-y-auto"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
              <div>
                <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-50">
                  Historique
                </h2>
                <p className="text-xs text-neutral-500">
                  50 dernières décisions formateur
                </p>
              </div>
              <button
                type="button"
                aria-label="Fermer"
                onClick={() => setHistoryOpen(false)}
                className="p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4">
              {historyQuery.isLoading && (
                <p className="text-sm text-neutral-500">Chargement…</p>
              )}
              {historyQuery.isError && (
                <p className="text-sm text-rose-600">
                  Impossible de charger l'historique.
                </p>
              )}
              {!historyQuery.isLoading &&
                (historyQuery.data?.events?.length ?? 0) === 0 && (
                  <p className="text-sm text-neutral-500">
                    Aucune décision enregistrée pour le moment.
                  </p>
                )}
              <ul className="space-y-2">
                {(historyQuery.data?.events ?? []).map((ev) => {
                  const isApprove = ev.kind === 'INSTRUCTOR_APPROVED';
                  const isReject = ev.kind === 'INSTRUCTOR_REJECTED';
                  const tone = isApprove
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-900/60 dark:text-emerald-100'
                    : isReject
                      ? 'bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-950/40 dark:border-rose-900/60 dark:text-rose-100'
                      : 'bg-sky-50 border-sky-200 text-sky-900 dark:bg-sky-950/40 dark:border-sky-900/60 dark:text-sky-100';
                  const label = isApprove
                    ? 'Approbation'
                    : isReject
                      ? 'Refus'
                      : 'Vérif e-mail forcée';
                  return (
                    <li
                      key={ev.id}
                      className={`rounded-lg border px-3 py-2 text-xs ${tone}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{label}</span>
                        <time
                          className="opacity-70"
                          dateTime={ev.created_at}
                        >
                          {new Date(ev.created_at).toLocaleString('fr-FR', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </time>
                      </div>
                      <p className="mt-1 truncate" title={ev.target.email ?? ''}>
                        Cible : {ev.target.email ?? '—'}
                      </p>
                      <p className="opacity-70 truncate" title={ev.admin.email ?? ''}>
                        Par : {ev.admin.email ?? '—'}
                      </p>
                      {ev.reason && (
                        <p className="mt-1 italic opacity-90 truncate">
                          « {ev.reason} »
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard
          Icon={GraduationCap}
          label="Total formateurs"
          value={agg.total.toLocaleString('fr-FR')}
          tone="primary"
        />
        <StatCard
          Icon={BadgeCheck}
          label="Vérifiés"
          value={agg.verified.toLocaleString('fr-FR')}
          tone="emerald"
          deltaLabel={`${agg.total > 0 ? Math.round((agg.verified / agg.total) * 100) : 0}% du total`}
        />
        <StatCard
          Icon={UserCheck}
          label="Actifs"
          value={agg.active.toLocaleString('fr-FR')}
          tone="sky"
        />
        <StatCard
          Icon={BookOpen}
          label="Cours publiés (page)"
          value={rows
            .reduce((s, r) => s + r.published_courses, 0)
            .toLocaleString('fr-FR')}
          tone="accent"
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <Input
                placeholder="Nom, email, headline…"
                value={filters.q}
                onChange={(e) => {
                  setPage(1);
                  setFilters((f) => ({ ...f, q: e.target.value }));
                }}
                className="pl-10"
              />
            </div>
            <select
              value={filters.verified}
              onChange={(e) => {
                setPage(1);
                setFilters((f) => ({
                  ...f,
                  verified: e.target.value as Filters['verified'],
                }));
              }}
              className="border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Tous (vérifiés + non)</option>
              <option value="true">Vérifiés seulement</option>
              <option value="false">Non vérifiés</option>
            </select>
            <select
              value={filters.active}
              onChange={(e) => {
                setPage(1);
                setFilters((f) => ({
                  ...f,
                  active: e.target.value as Filters['active'],
                }));
              }}
              className="border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Actifs + inactifs</option>
              <option value="true">Actifs seulement</option>
              <option value="false">Inactifs</option>
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
              Icon={GraduationCap}
              title="Aucun formateur"
              description="Aucun formateur ne correspond aux filtres appliqués."
            />
          }
          rowActions={(r) => (
            <div className="flex items-center justify-end gap-1">
              <Link
                to={`/admin/users/${r.id}`}
                className="p-1.5 rounded-lg text-neutral-500 hover:text-primary-700 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                title="Voir le profil complet"
              >
                <ExternalLink className="w-4 h-4" />
              </Link>
              <button
                type="button"
                onClick={() =>
                  r.is_active
                    ? setSuspendTarget(r)
                    : toggleActive.mutate({ userId: r.id, isActive: true })
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
                {toggleActive.isPending &&
                toggleActive.variables?.userId === r.id ? (
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

      {/* Pagination */}
      {data && data.count > 25 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <p className="text-neutral-500">
            Page {page} / {totalPages} — {data.count} formateurs
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
              userId: suspendTarget.id,
              isActive: false,
            });
            setSuspendTarget(null);
          } catch (err) {
            alert(extractApiError(err, 'Impossible de suspendre.'));
          }
        }}
        title="Suspendre ce formateur ?"
        description={
          suspendTarget
            ? `${suspendTarget.full_name || suspendTarget.email} ne pourra plus se connecter tant que son compte reste suspendu. Ses cours restent visibles mais il ne pourra plus les modifier.`
            : ''
        }
        confirmLabel="Suspendre"
        destructive
        loading={toggleActive.isPending}
      />
    </AdminShell>
  );
}
