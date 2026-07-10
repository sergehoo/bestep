/**
 * AdminModerationPage.tsx — R32.2
 *
 * Modération des avis (`CourseReview`) — remplace le placeholder R28.6.
 * Consomme `GET /api/admin/reviews/`, `PATCH /<id>/`, `DELETE /<id>/`.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Search,
  Filter,
  MessageSquareWarning,
  RefreshCw,
  Star,
  Eye,
  EyeOff,
  Trash2,
  Loader2,
  Flag,
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

interface AdminReview {
  id: number;
  course: number;
  course_title: string;
  course_slug: string;
  user: number;
  user_email: string;
  user_full_name: string;
  rating: number;
  comment: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

interface Page {
  count: number;
  next: string | null;
  previous: string | null;
  results: AdminReview[];
  aggregated: { total: number; hidden: number; low_rating: number };
}

export default function AdminModerationPage() {
  const [q, setQ] = useState('');
  const [rating, setRating] = useState<string>('');
  const [visibility, setVisibility] = useState<'' | 'true' | 'false'>('');
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<AdminReview | null>(null);
  const qc = useQueryClient();

  const { data, isLoading, isFetching, isError, refetch } = useQuery<Page>({
    queryKey: ['admin-moderation', q, rating, visibility, page],
    queryFn: async () => {
      const params: Record<string, string> = { page: String(page) };
      if (q) params.q = q;
      if (rating) params.rating = rating;
      if (visibility) params.is_public = visibility;
      const res = await api.get<Page>('/admin/reviews/', { params });
      return res.data;
    },
    staleTime: 15_000,
  });

  const toggleVisibility = useMutation({
    mutationFn: async ({ id, isPublic }: { id: number; isPublic: boolean }) => {
      await api.patch(`/admin/reviews/${id}/`, { is_public: isPublic });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-moderation'] }),
  });

  const deleteReview = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/admin/reviews/${id}/`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-moderation'] }),
  });

  const rows = data?.results ?? [];
  const agg = data?.aggregated ?? { total: 0, hidden: 0, low_rating: 0 };
  const totalPages = data ? Math.max(1, Math.ceil(data.count / 30)) : 1;

  const columns: DataTableColumn<AdminReview>[] = [
    {
      key: 'rating',
      header: 'Note',
      width: '100px',
      sortAccessor: (r) => r.rating,
      render: (r) => (
        <div className="inline-flex items-center gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className={
                'w-3.5 h-3.5 ' +
                (i < r.rating
                  ? 'fill-accent-500 text-accent-500'
                  : 'text-neutral-300')
              }
            />
          ))}
        </div>
      ),
    },
    {
      key: 'comment',
      header: 'Avis',
      render: (r) => (
        <p className="text-sm text-neutral-700 dark:text-neutral-200 line-clamp-2 max-w-md">
          {r.comment || (
            <span className="text-neutral-400 italic">Sans commentaire</span>
          )}
        </p>
      ),
    },
    {
      key: 'user',
      header: 'Auteur',
      render: (r) => (
        <div className="min-w-0">
          <p className="font-semibold text-neutral-900 dark:text-white truncate max-w-[160px]">
            {r.user_full_name || r.user_email}
          </p>
          <p className="text-[11px] text-neutral-500 truncate max-w-[160px]">
            {r.user_email}
          </p>
        </div>
      ),
    },
    {
      key: 'course',
      header: 'Cours',
      render: (r) => (
        <Link
          to={`/courses/${r.course_slug}`}
          target="_blank"
          className="text-sm font-semibold text-primary-700 dark:text-primary-400 hover:underline truncate block max-w-[180px]"
        >
          {r.course_title}
        </Link>
      ),
    },
    {
      key: 'visibility',
      header: 'Visibilité',
      width: '110px',
      render: (r) =>
        r.is_public ? (
          <StatusBadge status="active">Publié</StatusBadge>
        ) : (
          <StatusBadge status="warning">Masqué</StatusBadge>
        ),
    },
    {
      key: 'created',
      header: 'Date',
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
        title="Modération des avis"
        subtitle={`${agg.total.toLocaleString('fr-FR')} avis — ${agg.hidden} masqués, ${agg.low_rating} notes ≤ 2`}
        breadcrumbs={[
          { label: 'Administration', to: '/dashboard/admin' },
          { label: 'Plateforme' },
          { label: 'Modération' },
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
          Icon={MessageSquareWarning}
          label="Total avis"
          value={agg.total.toLocaleString('fr-FR')}
          tone="primary"
        />
        <StatCard
          Icon={EyeOff}
          label="Masqués"
          value={agg.hidden.toLocaleString('fr-FR')}
          tone="rose"
          deltaLabel={`${agg.total > 0 ? Math.round((agg.hidden / agg.total) * 100) : 0}% du total`}
        />
        <StatCard
          Icon={Flag}
          label="Notes ≤ 2"
          value={agg.low_rating.toLocaleString('fr-FR')}
          tone="accent"
        />
        <StatCard
          Icon={Eye}
          label="Publiés"
          value={(agg.total - agg.hidden).toLocaleString('fr-FR')}
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <Input
                placeholder="Commentaire, email, titre cours…"
                value={q}
                onChange={(e) => {
                  setPage(1);
                  setQ(e.target.value);
                }}
                className="pl-10"
              />
            </div>
            <select
              value={rating}
              onChange={(e) => {
                setPage(1);
                setRating(e.target.value);
              }}
              className="border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Toutes les notes</option>
              <option value="1">1 étoile</option>
              <option value="2">2 étoiles</option>
              <option value="3">3 étoiles</option>
              <option value="4">4 étoiles</option>
              <option value="5">5 étoiles</option>
            </select>
            <select
              value={visibility}
              onChange={(e) => {
                setPage(1);
                setVisibility(e.target.value as '' | 'true' | 'false');
              }}
              className="border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Publiés + masqués</option>
              <option value="true">Publiés seulement</option>
              <option value="false">Masqués seulement</option>
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
              Icon={MessageSquareWarning}
              title="Aucun avis"
              description="Aucun avis ne correspond aux filtres."
            />
          }
          rowActions={(r) => (
            <div className="flex items-center justify-end gap-1">
              <button
                type="button"
                onClick={() =>
                  toggleVisibility.mutate({ id: r.id, isPublic: !r.is_public })
                }
                disabled={toggleVisibility.isPending}
                className={
                  'p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-40 ' +
                  (r.is_public
                    ? 'text-neutral-500 hover:text-amber-600'
                    : 'text-neutral-500 hover:text-emerald-600')
                }
                title={r.is_public ? 'Masquer' : 'Rendre visible'}
              >
                {toggleVisibility.isPending &&
                toggleVisibility.variables?.id === r.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : r.is_public ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setDeleteTarget(r)}
                disabled={deleteReview.isPending}
                className="p-1.5 rounded-lg text-neutral-500 hover:text-rose-600 hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-40"
                title="Supprimer définitivement"
              >
                {deleteReview.isPending &&
                deleteReview.variables === r.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </button>
            </div>
          )}
        />
      )}

      {data && data.count > 30 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <p className="text-neutral-500">
            Page {page} / {totalPages} — {data.count} avis
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
            await deleteReview.mutateAsync(deleteTarget.id);
            setDeleteTarget(null);
          } catch (err) {
            alert(extractApiError(err, 'Impossible de supprimer.'));
          }
        }}
        title="Supprimer définitivement cet avis ?"
        description={
          deleteTarget
            ? `L'avis de ${deleteTarget.user_email} (${deleteTarget.rating}★) sera supprimé de manière irréversible. Préférez « Masquer » si vous voulez pouvoir revenir en arrière.`
            : ''
        }
        confirmLabel="Supprimer"
        destructive
        loading={deleteReview.isPending}
      />
    </AdminShell>
  );
}
