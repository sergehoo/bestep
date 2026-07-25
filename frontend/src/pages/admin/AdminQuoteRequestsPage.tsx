import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  CheckCircle2,
  Clock3,
  Eye,
  FileText,
  Mail,
  Phone,
  RefreshCw,
  Search,
  Send,
  UsersRound,
  X,
} from 'lucide-react';

import api from '@/lib/api';
import { extractApiError } from '@/lib/utils';
import { AdminShell } from '@/components/admin/AdminShell';
import { Card, CardBody } from '@/components/ui/Card';
import { Input, Textarea } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import {
  DataTable,
  type DataTableColumn,
  EmptyState,
  ErrorState,
  PageHeader,
  StatCard,
  StatusBadge,
  type StatusKind,
} from '@/components/admin/primitives';

interface QuoteRequest {
  id: number;
  reference: string;
  organization_name: string;
  organization_type: string;
  organization_type_label: string;
  country: string;
  city: string;
  contact_name: string;
  contact_role: string;
  email: string;
  phone: string;
  preferred_contact: string;
  preferred_contact_label: string;
  learners_count: number;
  plan_interest: string;
  plan_interest_label: string;
  timeframe: string;
  timeframe_label: string;
  budget_range: string;
  categories: Array<{ id: number; name: string }>;
  message: string;
  privacy_consent: boolean;
  source: string;
  status: string;
  status_label: string;
  admin_notes: string;
  processed_by_email: string;
  processed_at: string | null;
  created_at: string;
}

interface QuotePage {
  count: number;
  next: string | null;
  previous: string | null;
  results: QuoteRequest[];
  aggregated: {
    total: number;
    new: number;
    in_progress: number;
    won: number;
  };
}

const STATUSES = [
  { value: 'NEW', label: 'Nouvelle' },
  { value: 'CONTACTED', label: 'Contactée' },
  { value: 'QUALIFIED', label: 'Qualifiée' },
  { value: 'PROPOSAL_SENT', label: 'Proposition envoyée' },
  { value: 'WON', label: 'Gagnée' },
  { value: 'LOST', label: 'Perdue' },
  { value: 'ARCHIVED', label: 'Archivée' },
];

function statusTone(status: string): StatusKind {
  if (status === 'NEW') return 'warning';
  if (status === 'WON') return 'success';
  if (status === 'LOST') return 'rejected';
  if (status === 'ARCHIVED') return 'archived';
  return 'info';
}

function QuoteDetailModal({
  request,
  saving,
  onClose,
  onSave,
}: {
  request: QuoteRequest;
  saving: boolean;
  onClose: () => void;
  onSave: (status: string, notes: string) => void;
}) {
  const [status, setStatus] = useState(request.status);
  const [notes, setNotes] = useState(request.admin_notes);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose, saving]);

  const detail = (label: string, value: string | number | null) => (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-semibold text-neutral-900 dark:text-white">
        {value || '—'}
      </dd>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-950/70 p-3 backdrop-blur-sm sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="quote-detail-title"
        className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white shadow-2xl dark:bg-neutral-800"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-neutral-100 bg-white/95 px-6 py-5 backdrop-blur dark:border-neutral-700 dark:bg-neutral-800/95">
          <div>
            <p className="text-xs font-bold text-primary-600">{request.reference}</p>
            <h2 id="quote-detail-title" className="text-xl font-extrabold text-neutral-950 dark:text-white">
              {request.organization_name}
            </h2>
            <p className="mt-1 text-xs text-neutral-500">
              Reçue le {new Date(request.created_at).toLocaleString('fr-FR')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Fermer"
            className="rounded-xl p-2 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-700"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="space-y-7 px-6 py-6">
          <div className="grid gap-5 rounded-2xl bg-neutral-50 p-5 sm:grid-cols-3 dark:bg-neutral-900">
            {detail('Type', request.organization_type_label)}
            {detail('Localisation', [request.city, request.country].filter(Boolean).join(', '))}
            {detail('Offre', request.plan_interest_label)}
            {detail('Contact', `${request.contact_name} — ${request.contact_role}`)}
            {detail('Bénéficiaires', request.learners_count.toLocaleString('fr-FR'))}
            {detail('Période', request.timeframe_label)}
            {detail('Canal préféré', request.preferred_contact_label)}
            {detail('Budget indicatif', request.budget_range)}
            {detail('Origine', request.source)}
          </div>

          <div className="flex flex-wrap gap-3">
            <a
              href={`mailto:${request.email}`}
              className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-700"
            >
              <Mail className="h-4 w-4" />
              {request.email}
            </a>
            <a
              href={`tel:${request.phone}`}
              className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-700"
            >
              <Phone className="h-4 w-4" />
              {request.phone}
            </a>
          </div>

          {request.categories.length > 0 && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-neutral-500">
                Thématiques
              </h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {request.categories.map((category) => (
                  <span
                    key={category.id}
                    className="rounded-full bg-primary-50 px-3 py-1 text-xs font-bold text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                  >
                    {category.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-neutral-500">
              Besoin exprimé
            </h3>
            <p className="mt-2 whitespace-pre-wrap rounded-xl border border-neutral-100 p-4 text-sm leading-relaxed text-neutral-700 dark:border-neutral-700 dark:text-neutral-200">
              {request.message}
            </p>
          </div>

          <div className="grid gap-4 border-t border-neutral-100 pt-6 sm:grid-cols-3 dark:border-neutral-700">
            <label className="space-y-1.5">
              <span className="block text-xs font-bold uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
                Statut
              </span>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm dark:border-neutral-600 dark:bg-neutral-900"
              >
                {STATUSES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="sm:col-span-2">
              <Textarea
                label="Notes internes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Compte-rendu du contact, prochaine action, décision…"
                rows={4}
              />
            </div>
          </div>

          {request.processed_by_email && (
            <p className="text-xs text-neutral-500">
              Dernier traitement par {request.processed_by_email}
              {request.processed_at
                ? ` le ${new Date(request.processed_at).toLocaleString('fr-FR')}`
                : ''}
            </p>
          )}

          <footer className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Fermer
            </Button>
            <Button
              type="button"
              loading={saving}
              onClick={() => onSave(status, notes)}
            >
              <Send className="h-4 w-4" />
              Enregistrer le traitement
            </Button>
          </footer>
        </div>
      </section>
    </div>
  );
}

export default function AdminQuoteRequestsPage() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [plan, setPlan] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<QuoteRequest | null>(null);
  const [saveError, setSaveError] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading, isFetching, isError, refetch } = useQuery<QuotePage>({
    queryKey: ['admin-quote-requests', query, status, plan, page],
    queryFn: async () => {
      const params: Record<string, string> = { page: String(page) };
      if (query) params.q = query;
      if (status) params.status = status;
      if (plan) params.plan_interest = plan;
      const response = await api.get<QuotePage>(
        '/admin/business-interest-requests/',
        { params },
      );
      return response.data;
    },
    staleTime: 15_000,
  });

  const updateRequest = useMutation({
    mutationFn: async ({
      id,
      nextStatus,
      adminNotes,
    }: {
      id: number;
      nextStatus: string;
      adminNotes: string;
    }) => {
      const response = await api.patch<QuoteRequest>(
        `/admin/business-interest-requests/${id}/`,
        { status: nextStatus, admin_notes: adminNotes },
      );
      return response.data;
    },
    onSuccess: (updated) => {
      setSelected(updated);
      setSaveError('');
      queryClient.invalidateQueries({ queryKey: ['admin-quote-requests'] });
    },
    onError: (error) => {
      setSaveError(extractApiError(error, 'Le traitement n’a pas pu être enregistré.'));
    },
  });

  const rows = data?.results ?? [];
  const aggregate = data?.aggregated ?? { total: 0, new: 0, in_progress: 0, won: 0 };
  const totalPages = data ? Math.max(1, Math.ceil(data.count / 25)) : 1;

  const columns: DataTableColumn<QuoteRequest>[] = [
    {
      key: 'organization',
      header: 'Organisation',
      render: (request) => (
        <div className="min-w-0">
          <p className="max-w-[220px] truncate font-bold text-neutral-900 dark:text-white">
            {request.organization_name}
          </p>
          <p className="text-[11px] font-semibold text-primary-600">{request.reference}</p>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (request) => (
        <div>
          <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
            {request.contact_name}
          </p>
          <p className="max-w-[180px] truncate text-[11px] text-neutral-500">{request.email}</p>
        </div>
      ),
    },
    {
      key: 'need',
      header: 'Besoin',
      render: (request) => (
        <div className="text-xs text-neutral-600 dark:text-neutral-300">
          <p>{request.plan_interest_label}</p>
          <p>{request.learners_count.toLocaleString('fr-FR')} bénéficiaires</p>
        </div>
      ),
    },
    {
      key: 'timeframe',
      header: 'Période',
      render: (request) => (
        <span className="text-xs text-neutral-600 dark:text-neutral-300">
          {request.timeframe_label}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (request) => (
        <StatusBadge status={statusTone(request.status)} size="sm">
          {request.status_label}
        </StatusBadge>
      ),
    },
    {
      key: 'created',
      header: 'Reçue le',
      sortAccessor: (request) => request.created_at,
      render: (request) => (
        <span className="text-xs text-neutral-500">
          {new Date(request.created_at).toLocaleDateString('fr-FR')}
        </span>
      ),
    },
  ];

  return (
    <AdminShell>
      <PageHeader
        title="Demandes de devis"
        subtitle="Demandes entreprise reçues depuis le formulaire public"
        breadcrumbs={[
          { label: 'Administration', to: '/dashboard/admin' },
          { label: 'Finance' },
          { label: 'Demandes de devis' },
        ]}
        actions={
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            Rafraîchir
          </button>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard Icon={FileText} label="Total" value={aggregate.total} tone="primary" />
        <StatCard Icon={Clock3} label="Nouvelles" value={aggregate.new} tone="accent" />
        <StatCard Icon={UsersRound} label="En traitement" value={aggregate.in_progress} tone="sky" />
        <StatCard Icon={CheckCircle2} label="Gagnées" value={aggregate.won} tone="emerald" />
      </div>

      <Card className="mb-5">
        <CardBody>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <Input
                value={query}
                onChange={(event) => {
                  setPage(1);
                  setQuery(event.target.value);
                }}
                placeholder="Organisation, contact, e-mail…"
                className="pl-10"
              />
            </div>
            <select
              value={status}
              onChange={(event) => {
                setPage(1);
                setStatus(event.target.value);
              }}
              className="rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm dark:border-neutral-700 dark:bg-neutral-800"
            >
              <option value="">Tous les statuts</option>
              {STATUSES.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
            <select
              value={plan}
              onChange={(event) => {
                setPage(1);
                setPlan(event.target.value);
              }}
              className="rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm dark:border-neutral-700 dark:bg-neutral-800"
            >
              <option value="">Toutes les offres</option>
              <option value="PRO">Pro</option>
              <option value="ENTERPRISE">Enterprise</option>
              <option value="DEMO">Démonstration</option>
              <option value="UNSURE">À définir</option>
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
          rowKey={(request) => request.id}
          loading={isLoading}
          onRowClick={setSelected}
          emptyState={
            <EmptyState
              Icon={Building2}
              title="Aucune demande"
              description="Aucune demande ne correspond aux filtres appliqués."
            />
          }
          rowActions={(request) => (
            <button
              type="button"
              onClick={() => setSelected(request)}
              title="Ouvrir la demande"
              className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-primary-600 dark:hover:bg-neutral-700"
            >
              <Eye className="h-4 w-4" />
            </button>
          )}
        />
      )}

      {data && data.count > 25 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <p className="text-neutral-500">
            Page {page} / {totalPages} — {data.count} demandes
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1 || isFetching}
              className="rounded-lg border border-neutral-200 px-3 py-1.5 disabled:opacity-40 dark:border-neutral-600"
            >
              Précédent
            </button>
            <button
              type="button"
              onClick={() => setPage((current) => current + 1)}
              disabled={!data.next || isFetching}
              className="rounded-lg border border-neutral-200 px-3 py-1.5 disabled:opacity-40 dark:border-neutral-600"
            >
              Suivant
            </button>
          </div>
        </div>
      )}

      {selected && (
        <QuoteDetailModal
          request={selected}
          saving={updateRequest.isPending}
          onClose={() => {
            setSelected(null);
            setSaveError('');
          }}
          onSave={(nextStatus, adminNotes) =>
            updateRequest.mutate({ id: selected.id, nextStatus, adminNotes })
          }
        />
      )}

      {saveError && (
        <div
          role="alert"
          className="fixed bottom-5 right-5 z-[110] max-w-md rounded-xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white shadow-xl"
        >
          {saveError}
        </div>
      )}
    </AdminShell>
  );
}
