/**
 * AdminSupportPage.tsx — R40
 *
 * MVP support / notifications système. Utilise le modèle `Notification`
 * existant comme proxy en attendant un modèle `Ticket` complet (R41).
 * Consomme `GET /api/admin/notifications/`.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  Filter,
  LifeBuoy,
  RefreshCw,
  Bell,
  CheckCircle2,
  Clock,
  ExternalLink,
  Info,
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

interface AdminNotification {
  id: number;
  user: number;
  user_email: string;
  user_full_name: string;
  kind: string;
  kind_label: string;
  title: string;
  body: string;
  url: string;
  payload: Record<string, unknown>;
  created_at: string;
  read_at: string | null;
  is_read: boolean;
}

interface Page {
  count: number;
  next: string | null;
  previous: string | null;
  results: AdminNotification[];
  aggregated: { total: number; unread: number; system: number };
}

const KINDS = [
  { value: '', label: 'Tous types' },
  { value: 'system', label: 'Système' },
  { value: 'enrollment_assigned', label: 'Cours assigné' },
  { value: 'certificate_issued', label: 'Certificat émis' },
  { value: 'invitation_received', label: 'Invitation reçue' },
  { value: 'course_published', label: 'Cours publié' },
  { value: 'payment_succeeded', label: 'Paiement réussi' },
  { value: 'review_received', label: 'Avis reçu' },
];

export default function AdminSupportPage() {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [unread, setUnread] = useState<'' | 'true' | 'false'>('');
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching, isError, refetch } = useQuery<Page>({
    queryKey: ['admin-notifications', q, kind, unread, page],
    queryFn: async () => {
      const params: Record<string, string> = { page: String(page) };
      if (q) params.q = q;
      if (kind) params.kind = kind;
      if (unread) params.unread = unread;
      const res = await api.get<Page>('/admin/notifications/', { params });
      return res.data;
    },
    staleTime: 15_000,
  });

  const rows = data?.results ?? [];
  const agg = data?.aggregated ?? { total: 0, unread: 0, system: 0 };
  const totalPages = data ? Math.max(1, Math.ceil(data.count / 30)) : 1;

  const columns: DataTableColumn<AdminNotification>[] = [
    {
      key: 'status',
      header: '',
      width: '40px',
      render: (r) => (
        <span
          className={
            'inline-block w-2 h-2 rounded-full ' +
            (r.is_read ? 'bg-neutral-300' : 'bg-primary-600 animate-pulse')
          }
          title={r.is_read ? 'Lu' : 'Non lu'}
        />
      ),
    },
    {
      key: 'kind',
      header: 'Type',
      width: '160px',
      render: (r) => (
        <StatusBadge status={r.kind === 'system' ? 'warning' : 'info'} size="sm">
          {r.kind_label}
        </StatusBadge>
      ),
    },
    {
      key: 'title',
      header: 'Contenu',
      render: (r) => (
        <div className="min-w-0">
          <p className="font-semibold text-neutral-900 dark:text-white truncate max-w-md">
            {r.title}
          </p>
          {r.body && (
            <p className="text-xs text-neutral-500 truncate max-w-md">
              {r.body}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'user',
      header: 'Destinataire',
      render: (r) => (
        <div className="min-w-0">
          <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-100 truncate max-w-[160px]">
            {r.user_full_name || r.user_email}
          </p>
          <p className="text-[11px] text-neutral-500 truncate max-w-[160px]">
            {r.user_email}
          </p>
        </div>
      ),
    },
    {
      key: 'created',
      header: 'Date',
      width: '130px',
      sortAccessor: (r) => r.created_at,
      render: (r) => (
        <span className="text-xs text-neutral-500">
          {new Date(r.created_at).toLocaleString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      ),
    },
  ];

  return (
    <AdminShell>
      <PageHeader
        title="Support"
        subtitle={`${agg.total.toLocaleString('fr-FR')} notifications — ${agg.unread} non-lues, ${agg.system} système`}
        breadcrumbs={[
          { label: 'Administration', to: '/dashboard/admin' },
          { label: 'Plateforme' },
          { label: 'Support' },
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

      {/* Bannière MVP */}
      <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
        <div>
          <p className="font-bold text-amber-900 dark:text-amber-200">
            Module Support — MVP
          </p>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
            Cette vue expose actuellement les notifications système
            plateforme. Un vrai système de tickets (avec fils de messages,
            assignation, catégories, priorité) est planifié en R41 avec un
            modèle <code>Ticket</code> dédié. Les notifications ci-dessous
            couvrent déjà les alertes techniques et les événements
            utilisateurs critiques.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard
          Icon={Bell}
          label="Total notifications"
          value={agg.total.toLocaleString('fr-FR')}
          tone="primary"
        />
        <StatCard
          Icon={Clock}
          label="Non-lues"
          value={agg.unread.toLocaleString('fr-FR')}
          tone="accent"
        />
        <StatCard
          Icon={CheckCircle2}
          label="Lues"
          value={(agg.total - agg.unread).toLocaleString('fr-FR')}
          tone="emerald"
        />
        <StatCard
          Icon={LifeBuoy}
          label="Système"
          value={agg.system.toLocaleString('fr-FR')}
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <Input
                placeholder="Titre, contenu, email…"
                value={q}
                onChange={(e) => {
                  setPage(1);
                  setQ(e.target.value);
                }}
                className="pl-10"
              />
            </div>
            <select
              value={kind}
              onChange={(e) => {
                setPage(1);
                setKind(e.target.value);
              }}
              className="border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
            <select
              value={unread}
              onChange={(e) => {
                setPage(1);
                setUnread(e.target.value as '' | 'true' | 'false');
              }}
              className="border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Lues + non-lues</option>
              <option value="true">Non-lues seulement</option>
              <option value="false">Lues seulement</option>
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
              Icon={Bell}
              title="Aucune notification"
              description="Aucune notification ne correspond aux filtres."
            />
          }
          rowActions={(r) =>
            r.url ? (
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-lg text-neutral-500 hover:text-primary-700 hover:bg-neutral-100 dark:hover:bg-neutral-700 inline-flex"
                title="Ouvrir le lien associé"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            ) : (
              <span />
            )
          }
        />
      )}

      {data && data.count > 30 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <p className="text-neutral-500">
            Page {page} / {totalPages} — {data.count} notifications
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
