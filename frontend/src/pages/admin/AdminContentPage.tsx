/**
 * AdminContentPage.tsx — R35.2
 *
 * Vue transverse des leçons plateforme. Consomme
 * `GET /api/admin/content/lessons/`.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Search,
  Filter,
  Library,
  RefreshCw,
  Video,
  FileText,
  File,
  Radio,
  MessageSquareWarning,
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

interface AdminLesson {
  id: number;
  title: string;
  order: number;
  lesson_type: 'VIDEO' | 'TEXT' | 'FILE' | 'QUIZ' | 'LIVE';
  lesson_type_label: string;
  is_preview: boolean;
  duration_sec: number;
  course_id: number;
  course_title: string;
  course_slug: string;
  section_title: string;
  section_order: number;
}

interface Page {
  count: number;
  next: string | null;
  previous: string | null;
  results: AdminLesson[];
  aggregated: {
    total: number;
    by_type: Partial<Record<AdminLesson['lesson_type'], number>>;
  };
}

const TYPE_ICON: Record<AdminLesson['lesson_type'], typeof Video> = {
  VIDEO: Video,
  TEXT: FileText,
  FILE: File,
  QUIZ: MessageSquareWarning,
  LIVE: Radio,
};

const TYPES = [
  { value: '', label: 'Tous types' },
  { value: 'VIDEO', label: 'Vidéo' },
  { value: 'TEXT', label: 'Texte' },
  { value: 'FILE', label: 'Fichier' },
  { value: 'QUIZ', label: 'Quiz' },
  { value: 'LIVE', label: 'Live' },
];

function formatDuration(seconds: number): string {
  if (!seconds) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`;
  return `${m}m`;
}

export default function AdminContentPage() {
  const [q, setQ] = useState('');
  const [lessonType, setLessonType] = useState('');
  const [courseId, setCourseId] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching, isError, refetch } = useQuery<Page>({
    queryKey: ['admin-content-lessons', q, lessonType, courseId, page],
    queryFn: async () => {
      const params: Record<string, string> = { page: String(page) };
      if (q) params.q = q;
      if (lessonType) params.lesson_type = lessonType;
      if (courseId) params.course_id = courseId;
      const res = await api.get<Page>('/admin/content/lessons/', { params });
      return res.data;
    },
    staleTime: 30_000,
  });

  const rows = data?.results ?? [];
  const agg = data?.aggregated ?? { total: 0, by_type: {} };
  const totalPages = data ? Math.max(1, Math.ceil(data.count / 40)) : 1;

  const columns: DataTableColumn<AdminLesson>[] = [
    {
      key: 'type',
      header: 'Type',
      width: '120px',
      render: (r) => {
        const Icon = TYPE_ICON[r.lesson_type] || FileText;
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-700 dark:text-neutral-200">
            <Icon className="w-3.5 h-3.5 text-primary-600" />
            {r.lesson_type_label}
          </span>
        );
      },
    },
    {
      key: 'title',
      header: 'Leçon',
      render: (r) => (
        <div className="min-w-0">
          <p className="font-bold text-neutral-900 dark:text-white truncate max-w-xs">
            {r.title}
          </p>
          {r.is_preview && (
            <StatusBadge status="info" size="sm">Preview</StatusBadge>
          )}
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
      key: 'section',
      header: 'Section',
      render: (r) => (
        <div>
          <p className="text-xs text-neutral-600 dark:text-neutral-300 truncate max-w-[160px]">
            §{r.section_order} · {r.section_title}
          </p>
          <p className="text-[11px] text-neutral-400">
            #{r.order} dans la section
          </p>
        </div>
      ),
    },
    {
      key: 'duration',
      header: 'Durée',
      align: 'right',
      width: '90px',
      sortAccessor: (r) => r.duration_sec,
      render: (r) => (
        <span className="text-xs text-neutral-600 dark:text-neutral-300">
          {formatDuration(r.duration_sec)}
        </span>
      ),
    },
  ];

  return (
    <AdminShell>
      <PageHeader
        title="Contenu pédagogique"
        subtitle={`${agg.total.toLocaleString('fr-FR')} leçons plateforme — vue transverse cross-cours`}
        breadcrumbs={[
          { label: 'Administration', to: '/dashboard/admin' },
          { label: 'Catalogue' },
          { label: 'Contenu pédagogique' },
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
          Icon={Library}
          label="Total leçons"
          value={agg.total.toLocaleString('fr-FR')}
          tone="primary"
        />
        <StatCard
          Icon={Video}
          label="Vidéos"
          value={(agg.by_type.VIDEO ?? 0).toLocaleString('fr-FR')}
          tone="rose"
        />
        <StatCard
          Icon={FileText}
          label="Textes"
          value={(agg.by_type.TEXT ?? 0).toLocaleString('fr-FR')}
          tone="sky"
        />
        <StatCard
          Icon={MessageSquareWarning}
          label="Quiz"
          value={(agg.by_type.QUIZ ?? 0).toLocaleString('fr-FR')}
          tone="accent"
        />
        <StatCard
          Icon={File}
          label="Fichiers"
          value={(agg.by_type.FILE ?? 0).toLocaleString('fr-FR')}
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
                placeholder="Titre leçon, section, cours…"
                value={q}
                onChange={(e) => {
                  setPage(1);
                  setQ(e.target.value);
                }}
                className="pl-10"
              />
            </div>
            <select
              value={lessonType}
              onChange={(e) => {
                setPage(1);
                setLessonType(e.target.value);
              }}
              className="border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <Input
              placeholder="ID cours…"
              value={courseId}
              onChange={(e) => {
                setPage(1);
                setCourseId(e.target.value);
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
              Icon={Library}
              title="Aucune leçon"
              description="Aucune leçon ne correspond aux filtres."
            />
          }
        />
      )}

      {data && data.count > 40 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <p className="text-neutral-500">
            Page {page} / {totalPages} — {data.count} leçons
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
