/**
 * AdminQuizzesPage.tsx — R33
 *
 * Vue transverse des quiz plateforme. Consomme `GET /api/admin/quizzes/`.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Search,
  Filter,
  MessageSquareWarning,
  RefreshCw,
  Award,
  ClipboardList,
  Target,
  BarChart3,
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
} from '@/components/admin/primitives';

interface AdminQuiz {
  id: number;
  title: string;
  slug: string | null;
  course: number | null;
  course_title: string | null;
  course_slug: string | null;
  section_title: string | null;
  is_onboarding: boolean;
  is_active: boolean;
  is_final: boolean;
  passing_score: number;
  max_attempts: number;
  questions_count: number;
  attempts_count: number;
  avg_score: number | null;
  passing_rate: number | null;
}

interface Page {
  count: number;
  next: string | null;
  previous: string | null;
  results: AdminQuiz[];
  aggregated: { total: number; active: number; final: number; onboarding: number };
}

export default function AdminQuizzesPage() {
  const [q, setQ] = useState('');
  const [isFinal, setIsFinal] = useState<'' | 'true' | 'false'>('');
  const [isActive, setIsActive] = useState<'' | 'true' | 'false'>('');
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching, isError, refetch } = useQuery<Page>({
    queryKey: ['admin-quizzes', q, isFinal, isActive, page],
    queryFn: async () => {
      const params: Record<string, string> = { page: String(page) };
      if (q) params.q = q;
      if (isFinal) params.is_final = isFinal;
      if (isActive) params.is_active = isActive;
      const res = await api.get<Page>('/admin/quizzes/', { params });
      return res.data;
    },
    staleTime: 30_000,
  });

  const rows = data?.results ?? [];
  const agg = data?.aggregated ?? { total: 0, active: 0, final: 0, onboarding: 0 };
  const totalPages = data ? Math.max(1, Math.ceil(data.count / 25)) : 1;

  const columns: DataTableColumn<AdminQuiz>[] = [
    {
      key: 'title',
      header: 'Quiz',
      render: (r) => (
        <div className="min-w-0">
          <p className="font-bold text-neutral-900 dark:text-white truncate max-w-xs">
            {r.title}
          </p>
          <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
            {r.is_final && (
              <StatusBadge status="success" size="sm">Final</StatusBadge>
            )}
            {r.is_onboarding && (
              <StatusBadge status="info" size="sm">Onboarding</StatusBadge>
            )}
            {!r.is_active && (
              <StatusBadge status="inactive" size="sm">Inactif</StatusBadge>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'course',
      header: 'Cours / Section',
      render: (r) =>
        r.course_slug && r.course_title ? (
          <div>
            <Link
              to={`/courses/${r.course_slug}`}
              target="_blank"
              className="text-sm font-semibold text-primary-700 dark:text-primary-400 hover:underline truncate block max-w-[200px]"
            >
              {r.course_title}
            </Link>
            {r.section_title && (
              <p className="text-[11px] text-neutral-500 truncate max-w-[200px]">
                {r.section_title}
              </p>
            )}
          </div>
        ) : (
          <span className="text-xs text-neutral-400 italic">Standalone</span>
        ),
    },
    {
      key: 'questions',
      header: 'Questions',
      align: 'right',
      width: '100px',
      sortAccessor: (r) => r.questions_count,
      render: (r) => (
        <span className="font-semibold text-neutral-800 dark:text-neutral-100">
          {r.questions_count}
        </span>
      ),
    },
    {
      key: 'attempts',
      header: 'Tentatives',
      align: 'right',
      width: '100px',
      sortAccessor: (r) => r.attempts_count,
      render: (r) => (
        <span className="font-semibold text-neutral-800 dark:text-neutral-100">
          {r.attempts_count}
        </span>
      ),
    },
    {
      key: 'avg_score',
      header: 'Score moyen',
      align: 'right',
      width: '110px',
      sortAccessor: (r) => r.avg_score ?? 0,
      render: (r) =>
        r.avg_score != null ? (
          <span className="font-bold text-neutral-900 dark:text-white">
            {r.avg_score.toFixed(0)}%
          </span>
        ) : (
          <span className="text-xs text-neutral-400">—</span>
        ),
    },
    {
      key: 'passing_score',
      header: 'Seuil',
      align: 'right',
      width: '80px',
      render: (r) => (
        <span className="text-xs text-neutral-600 dark:text-neutral-300">
          {r.passing_score}%
        </span>
      ),
    },
    {
      key: 'max_attempts',
      header: 'Max ess.',
      align: 'right',
      width: '90px',
      render: (r) => (
        <span className="text-xs text-neutral-600 dark:text-neutral-300">
          {r.max_attempts}
        </span>
      ),
    },
  ];

  return (
    <AdminShell>
      <PageHeader
        title="Quiz plateforme"
        subtitle={`${agg.total.toLocaleString('fr-FR')} quiz — ${agg.active} actifs, ${agg.final} finaux, ${agg.onboarding} onboarding`}
        breadcrumbs={[
          { label: 'Administration', to: '/dashboard/admin' },
          { label: 'Certifications' },
          { label: 'Quiz' },
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
          label="Total quiz"
          value={agg.total.toLocaleString('fr-FR')}
          tone="primary"
        />
        <StatCard
          Icon={ClipboardList}
          label="Actifs"
          value={agg.active.toLocaleString('fr-FR')}
          tone="emerald"
        />
        <StatCard
          Icon={Award}
          label="Finaux (certif.)"
          value={agg.final.toLocaleString('fr-FR')}
          tone="accent"
        />
        <StatCard
          Icon={Target}
          label="Onboarding"
          value={agg.onboarding.toLocaleString('fr-FR')}
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <Input
                placeholder="Titre quiz, titre cours…"
                value={q}
                onChange={(e) => {
                  setPage(1);
                  setQ(e.target.value);
                }}
                className="pl-10"
              />
            </div>
            <select
              value={isFinal}
              onChange={(e) => {
                setPage(1);
                setIsFinal(e.target.value as '' | 'true' | 'false');
              }}
              className="border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Tous types</option>
              <option value="true">Quiz finaux (certif.)</option>
              <option value="false">Quiz non-finaux</option>
            </select>
            <select
              value={isActive}
              onChange={(e) => {
                setPage(1);
                setIsActive(e.target.value as '' | 'true' | 'false');
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
              Icon={BarChart3}
              title="Aucun quiz"
              description="Aucun quiz ne correspond aux filtres."
            />
          }
        />
      )}

      {data && data.count > 25 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <p className="text-neutral-500">
            Page {page} / {totalPages} — {data.count} quiz
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
