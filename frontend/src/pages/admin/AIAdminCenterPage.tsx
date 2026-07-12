/**
 * AIAdminCenterPage.tsx — Centre d'administration IA (Phase 6).
 *
 * Une seule page, quatre onglets :
 *   - Overview       : KPI + top users + top models
 *   - Providers      : CRUD AIProvider + test connexion
 *   - Modèles        : CRUD AIModel (couples provider+purpose+model_name)
 *   - Quotas         : CRUD AIQuota (par scope)
 *   - Audit logs     : filtres + pagination
 *
 * Réservée strictement à platform_admin.
 */
import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Sparkles,
  Cpu,
  Boxes,
  Gauge,
  History,
  Plus,
  Trash2,
  Zap,
  Loader2,
  Check,
  X,
  RefreshCw,
} from 'lucide-react';

import { AdminShell } from '@/components/admin/AdminShell';
import { PageHeader, StatCard } from '@/components/admin/primitives';
import {
  useAIAdminOverview,
  useAIAuditLogs,
  useAIModels,
  useAIProviders,
  useAIQuotas,
  useCreateAIModel,
  useCreateAIProvider,
  useCreateAIQuota,
  useDeleteAIModel,
  useDeleteAIProvider,
  useDeleteAIQuota,
  useTestAIProvider,
  useUpdateAIProvider,
} from '@/hooks/ai';
import { useAuthUser } from '@/stores/auth';
import type {
  AIModelPurpose,
  AIProviderKind,
  AIProviderRow,
  AIQuotaPeriod,
  AIQuotaTargetType,
} from '@/lib/ai-types';

type TabKey = 'overview' | 'providers' | 'models' | 'quotas' | 'audit';

const TABS: Array<{ key: TabKey; label: string; Icon: typeof Sparkles }> = [
  { key: 'overview', label: 'Vue d\'ensemble', Icon: Sparkles },
  { key: 'providers', label: 'Providers', Icon: Cpu },
  { key: 'models', label: 'Modèles', Icon: Boxes },
  { key: 'quotas', label: 'Quotas', Icon: Gauge },
  { key: 'audit', label: 'Journal d\'audit', Icon: History },
];

export default function AIAdminCenterPage() {
  const user = useAuthUser();
  const [tab, setTab] = useState<TabKey>('overview');

  if (!user?.is_platform_admin) return <Navigate to="/dashboard" replace />;

  return (
    <AdminShell>
      <PageHeader
        title="Centre d'administration Best-AI"
        subtitle="Providers, modèles, quotas et audit du module Best-AI."
        breadcrumbs={[
          { label: 'Administration', to: '/dashboard/admin' },
          { label: 'Best-AI' },
          { label: 'Centre admin' },
        ]}
      />

      <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={
                'inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition ' +
                (active
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-700')
              }
            >
              <t.Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'overview' && <OverviewTab />}
      {tab === 'providers' && <ProvidersTab />}
      {tab === 'models' && <ModelsTab />}
      {tab === 'quotas' && <QuotasTab />}
      {tab === 'audit' && <AuditTab />}
    </AdminShell>
  );
}

// ─────────────────────────────────────────────────────────────
// OVERVIEW
// ─────────────────────────────────────────────────────────────

function OverviewTab() {
  const { data, isLoading } = useAIAdminOverview();
  if (isLoading || !data) {
    return (
      <div className="py-10 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          Icon={Sparkles}
          label="Appels ce mois"
          value={data.month.calls.toLocaleString('fr-FR')}
          tone="primary"
          deltaLabel={`7j : ${data.week.calls}`}
        />
        <StatCard
          Icon={Zap}
          label="Tokens sortie / mois"
          value={data.month.output_tokens.toLocaleString('fr-FR')}
          tone="accent"
          deltaLabel={`entrée : ${data.month.input_tokens}`}
        />
        <StatCard
          Icon={Cpu}
          label="Providers actifs"
          value={`${data.providers.active}/${data.providers.total}`}
          tone="emerald"
        />
        <StatCard
          Icon={Gauge}
          label="Quotas actifs"
          value={data.quotas_active}
          tone="violet"
          deltaLabel={`${data.approvals_pending} approval(s) pending`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4">
          <p className="text-xs font-extrabold uppercase text-neutral-500 mb-3">
            Top utilisateurs (mois)
          </p>
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {data.top_users.map((u) => (
              <li key={u.user_id} className="py-2 flex items-center gap-3 text-sm">
                <span className="font-semibold text-neutral-900 dark:text-white truncate flex-1">
                  {u.user__email || `user #${u.user_id}`}
                </span>
                <span className="text-xs text-neutral-500">
                  {u.calls} appels · {u.tokens || 0} tokens
                </span>
              </li>
            ))}
            {data.top_users.length === 0 && (
              <li className="py-3 text-sm text-neutral-500 italic">
                Aucun usage ce mois.
              </li>
            )}
          </ul>
        </section>

        <section className="rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4">
          <p className="text-xs font-extrabold uppercase text-neutral-500 mb-3">
            Top modèles (mois)
          </p>
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {data.top_models.map((m, i) => (
              <li key={i} className="py-2 flex items-center gap-3 text-sm">
                <code className="font-mono text-neutral-700 dark:text-neutral-300 flex-1 truncate">
                  {m.provider} / {m.model_name}
                </code>
                <span className="text-xs text-neutral-500">{m.calls} appels</span>
              </li>
            ))}
            {data.top_models.length === 0 && (
              <li className="py-3 text-sm text-neutral-500 italic">
                Aucun modèle utilisé.
              </li>
            )}
          </ul>
        </section>
      </div>

      <section className="rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4">
        <p className="text-xs font-extrabold uppercase text-neutral-500 mb-2">
          Base de connaissances
        </p>
        <p className="text-sm text-neutral-700 dark:text-neutral-300">
          {data.kb.indexed} document(s) indexé(s) sur {data.kb.documents} au
          total.
        </p>
        <p className="mt-2 text-xs text-neutral-500">
          Snapshot généré {new Date(data.generated_at).toLocaleString('fr-FR')} ·
          coût total historique : ${data.total.cost_usd.toFixed(4)}
        </p>
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PROVIDERS
// ─────────────────────────────────────────────────────────────

function ProvidersTab() {
  const { data } = useAIProviders();
  const [showNew, setShowNew] = useState(false);
  const create = useCreateAIProvider();

  return (
    <section className="rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-extrabold uppercase text-neutral-500">
          Providers ({data?.length ?? 0})
        </h2>
        <button
          type="button"
          onClick={() => setShowNew((v) => !v)}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold"
        >
          <Plus className="w-3.5 h-3.5" />
          Ajouter
        </button>
      </div>

      {showNew && (
        <NewProviderForm
          onClose={() => setShowNew(false)}
          onSave={(p) => {
            create.mutate(p, { onSuccess: () => setShowNew(false) });
          }}
          pending={create.isPending}
        />
      )}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] font-bold uppercase text-neutral-500 border-b border-neutral-100 dark:border-neutral-800">
              <th className="text-left py-2">Nom</th>
              <th className="text-left py-2">Type</th>
              <th className="text-left py-2">Base URL</th>
              <th className="text-left py-2">Clé API</th>
              <th className="text-center py-2">Actif</th>
              <th className="text-center py-2">Priorité</th>
              <th className="text-center py-2">Modèles</th>
              <th className="text-right py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((p) => (
              <ProviderRow key={p.id} provider={p} />
            ))}
            {(data ?? []).length === 0 && (
              <tr>
                <td colSpan={8} className="py-4 text-center text-neutral-500 italic">
                  Aucun provider configuré.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ProviderRow({ provider }: { provider: AIProviderRow }) {
  const update = useUpdateAIProvider(provider.id);
  const del = useDeleteAIProvider();
  const test = useTestAIProvider();
  const [testResult, setTestResult] = useState<{ ok: boolean; detail: string } | null>(
    null,
  );

  return (
    <tr className="border-b border-neutral-100 dark:border-neutral-800">
      <td className="py-2 font-semibold text-neutral-900 dark:text-white">
        {provider.name}
      </td>
      <td className="py-2">
        <code className="text-xs font-mono text-neutral-500">{provider.kind}</code>
      </td>
      <td className="py-2 text-xs text-neutral-500 truncate max-w-[200px]">
        {provider.base_url || '—'}
      </td>
      <td className="py-2 text-xs font-mono text-neutral-500">
        {provider.api_key_masked || '—'}
      </td>
      <td className="py-2 text-center">
        <button
          type="button"
          onClick={() =>
            update.mutate({ is_active: !provider.is_active })
          }
          className={
            'p-1 rounded ' +
            (provider.is_active
              ? 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/40'
              : 'text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800')
          }
        >
          {provider.is_active ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
        </button>
      </td>
      <td className="py-2 text-center text-xs text-neutral-500">
        {provider.priority}
      </td>
      <td className="py-2 text-center text-xs text-neutral-500">
        {provider.models_count}
      </td>
      <td className="py-2 text-right space-x-1">
        <button
          type="button"
          onClick={async () => {
            const res = await test.mutateAsync(provider.id);
            setTestResult(res);
            window.setTimeout(() => setTestResult(null), 4000);
          }}
          disabled={test.isPending}
          className="px-2 py-1 rounded-md text-xs border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/30 text-primary-800 dark:text-primary-200 hover:bg-primary-100 transition"
        >
          {test.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin inline" />
          ) : (
            'Test'
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirm(`Supprimer le provider « ${provider.name} » ?`))
              del.mutate(provider.id);
          }}
          className="p-1 rounded hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-600 transition"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        {testResult && (
          <span
            className={
              'ml-2 text-[10px] font-bold ' +
              (testResult.ok ? 'text-emerald-600' : 'text-rose-600')
            }
          >
            {testResult.ok ? '✓' : '✗'} {testResult.detail}
          </span>
        )}
      </td>
    </tr>
  );
}

function NewProviderForm({
  onClose,
  onSave,
  pending,
}: {
  onClose: () => void;
  onSave: (p: Partial<AIProviderRow> & { api_key?: string }) => void;
  pending: boolean;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AIProviderKind>('openai');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [priority, setPriority] = useState(50);

  return (
    <div className="rounded-xl border border-neutral-100 dark:border-neutral-800 p-3 grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
      <input
        placeholder="Nom (ex: prod-openai)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="col-span-2 px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs"
      />
      <select
        value={kind}
        onChange={(e) => setKind(e.target.value as AIProviderKind)}
        className="px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs"
      >
        <option value="openai">OpenAI-compat</option>
        <option value="anthropic">Anthropic</option>
        <option value="gemini">Gemini</option>
        <option value="stub">Stub (dev)</option>
      </select>
      <input
        placeholder="Base URL"
        value={baseUrl}
        onChange={(e) => setBaseUrl(e.target.value)}
        className="col-span-2 px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs"
      />
      <input
        type="number"
        placeholder="Prio"
        value={priority}
        onChange={(e) => setPriority(Number(e.target.value) || 100)}
        className="px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs"
      />
      <input
        type="password"
        placeholder="Clé API"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        className="col-span-3 px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-mono"
      />
      <div className="col-span-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="px-2 py-1 rounded-md text-xs text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          Annuler
        </button>
        <button
          type="button"
          disabled={pending || !name.trim() || !kind}
          onClick={() =>
            onSave({
              name: name.trim(),
              kind,
              base_url: baseUrl.trim(),
              api_key: apiKey.trim(),
              priority,
              is_active: true,
            })
          }
          className="px-2 py-1 rounded-md bg-primary-600 text-white text-xs font-bold disabled:opacity-60"
        >
          Créer
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MODELS
// ─────────────────────────────────────────────────────────────

function ModelsTab() {
  const { data: models } = useAIModels();
  const { data: providers } = useAIProviders();
  const create = useCreateAIModel();
  const del = useDeleteAIModel();
  const [showNew, setShowNew] = useState(false);

  return (
    <section className="rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-extrabold uppercase text-neutral-500">
          Modèles ({models?.length ?? 0})
        </h2>
        <button
          type="button"
          onClick={() => setShowNew((v) => !v)}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold"
        >
          <Plus className="w-3.5 h-3.5" />
          Ajouter
        </button>
      </div>

      {showNew && (
        <NewModelForm
          providers={providers ?? []}
          onClose={() => setShowNew(false)}
          onSave={(m) => create.mutate(m, { onSuccess: () => setShowNew(false) })}
          pending={create.isPending}
        />
      )}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] font-bold uppercase text-neutral-500 border-b border-neutral-100 dark:border-neutral-800">
              <th className="text-left py-2">Provider</th>
              <th className="text-left py-2">Purpose</th>
              <th className="text-left py-2">Modèle</th>
              <th className="text-center py-2">Max tokens</th>
              <th className="text-center py-2">Temp</th>
              <th className="text-center py-2">Coût 1k in/out</th>
              <th className="text-center py-2">Default</th>
              <th className="text-right py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(models ?? []).map((m) => (
              <tr
                key={m.id}
                className="border-b border-neutral-100 dark:border-neutral-800"
              >
                <td className="py-2 font-semibold">{m.provider_name}</td>
                <td className="py-2">
                  <code className="text-xs font-mono">{m.purpose}</code>
                </td>
                <td className="py-2 font-mono text-xs">{m.model_name}</td>
                <td className="py-2 text-center text-xs">{m.max_tokens}</td>
                <td className="py-2 text-center text-xs">{m.temperature}</td>
                <td className="py-2 text-center text-xs">
                  ${m.cost_input_per_1k} / ${m.cost_output_per_1k}
                </td>
                <td className="py-2 text-center">
                  {m.is_default ? (
                    <Check className="w-4 h-4 text-emerald-600 mx-auto" />
                  ) : (
                    <X className="w-4 h-4 text-neutral-400 mx-auto" />
                  )}
                </td>
                <td className="py-2 text-right">
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Supprimer ce modèle ?`)) del.mutate(m.id);
                    }}
                    className="p-1 rounded hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-600 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {(models ?? []).length === 0 && (
              <tr>
                <td colSpan={8} className="py-4 text-center text-neutral-500 italic">
                  Aucun modèle enregistré.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function NewModelForm({
  providers,
  onClose,
  onSave,
  pending,
}: {
  providers: AIProviderRow[];
  onClose: () => void;
  onSave: (m: {
    provider: number;
    purpose: AIModelPurpose;
    model_name: string;
    max_tokens?: number;
    is_default?: boolean;
  }) => void;
  pending: boolean;
}) {
  const [provider, setProvider] = useState<number>(providers[0]?.id ?? 0);
  const [purpose, setPurpose] = useState<AIModelPurpose>('chat_fast');
  const [name, setName] = useState('');
  const [maxTokens, setMaxTokens] = useState(4096);
  const [isDefault, setIsDefault] = useState(false);

  return (
    <div className="rounded-xl border border-neutral-100 dark:border-neutral-800 p-3 grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
      <select
        value={provider}
        onChange={(e) => setProvider(Number(e.target.value))}
        className="col-span-2 px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs"
      >
        {providers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} ({p.kind})
          </option>
        ))}
      </select>
      <select
        value={purpose}
        onChange={(e) => setPurpose(e.target.value as AIModelPurpose)}
        className="px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs"
      >
        <option value="chat_fast">chat_fast</option>
        <option value="chat_advanced">chat_advanced</option>
        <option value="analysis">analysis</option>
        <option value="image">image</option>
        <option value="embedding">embedding</option>
      </select>
      <input
        placeholder="model_name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="col-span-2 px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-mono"
      />
      <input
        type="number"
        placeholder="max tokens"
        value={maxTokens}
        onChange={(e) => setMaxTokens(Number(e.target.value) || 4096)}
        className="px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs"
      />
      <label className="col-span-3 flex items-center gap-1 text-xs">
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
        />
        Défaut pour ce purpose
      </label>
      <div className="col-span-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="px-2 py-1 rounded-md text-xs text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          Annuler
        </button>
        <button
          type="button"
          disabled={pending || !name.trim() || !provider}
          onClick={() =>
            onSave({
              provider,
              purpose,
              model_name: name.trim(),
              max_tokens: maxTokens,
              is_default: isDefault,
            })
          }
          className="px-2 py-1 rounded-md bg-primary-600 text-white text-xs font-bold disabled:opacity-60"
        >
          Créer
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// QUOTAS
// ─────────────────────────────────────────────────────────────

function QuotasTab() {
  const { data: quotas } = useAIQuotas();
  const create = useCreateAIQuota();
  const del = useDeleteAIQuota();
  const [showNew, setShowNew] = useState(false);

  return (
    <section className="rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-extrabold uppercase text-neutral-500">
          Quotas ({quotas?.length ?? 0})
        </h2>
        <button
          type="button"
          onClick={() => setShowNew((v) => !v)}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold"
        >
          <Plus className="w-3.5 h-3.5" />
          Ajouter
        </button>
      </div>

      {showNew && (
        <NewQuotaForm
          onClose={() => setShowNew(false)}
          onSave={(q) => create.mutate(q, { onSuccess: () => setShowNew(false) })}
          pending={create.isPending}
        />
      )}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] font-bold uppercase text-neutral-500 border-b border-neutral-100 dark:border-neutral-800">
              <th className="text-left py-2">Cible</th>
              <th className="text-left py-2">Période</th>
              <th className="text-center py-2">Appels max</th>
              <th className="text-center py-2">Tokens out max</th>
              <th className="text-center py-2">Coût max ($)</th>
              <th className="text-center py-2">Actif</th>
              <th className="text-right py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(quotas ?? []).map((q) => (
              <tr
                key={q.id}
                className="border-b border-neutral-100 dark:border-neutral-800"
              >
                <td className="py-2">
                  <code className="text-xs font-mono">
                    {q.target_type}
                    {q.target_role ? `:${q.target_role}` : ''}
                    {q.target_user ? `:user#${q.target_user}` : ''}
                    {q.target_org_id ? `:org#${q.target_org_id}` : ''}
                  </code>
                </td>
                <td className="py-2 text-xs">{q.period}</td>
                <td className="py-2 text-center text-xs">
                  {q.max_calls || '∞'}
                </td>
                <td className="py-2 text-center text-xs">
                  {q.max_output_tokens || '∞'}
                </td>
                <td className="py-2 text-center text-xs">
                  {q.max_cost_usd || '∞'}
                </td>
                <td className="py-2 text-center">
                  {q.is_active ? (
                    <Check className="w-4 h-4 text-emerald-600 mx-auto" />
                  ) : (
                    <X className="w-4 h-4 text-neutral-400 mx-auto" />
                  )}
                </td>
                <td className="py-2 text-right">
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Supprimer ce quota ?`)) del.mutate(q.id);
                    }}
                    className="p-1 rounded hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-600 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {(quotas ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="py-4 text-center text-neutral-500 italic">
                  Aucun quota configuré (usage illimité).
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function NewQuotaForm({
  onClose,
  onSave,
  pending,
}: {
  onClose: () => void;
  onSave: (q: {
    target_type: AIQuotaTargetType;
    target_role?: string;
    period: AIQuotaPeriod;
    max_calls: number;
    max_output_tokens: number;
    max_cost_usd: string;
    is_active: boolean;
    note?: string;
  }) => void;
  pending: boolean;
}) {
  const [targetType, setTargetType] = useState<AIQuotaTargetType>('GLOBAL');
  const [role, setRole] = useState('learner');
  const [period, setPeriod] = useState<AIQuotaPeriod>('MONTHLY');
  const [maxCalls, setMaxCalls] = useState(0);
  const [maxOutTokens, setMaxOutTokens] = useState(0);
  const [maxCost, setMaxCost] = useState('0');

  return (
    <div className="rounded-xl border border-neutral-100 dark:border-neutral-800 p-3 grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
      <select
        value={targetType}
        onChange={(e) => setTargetType(e.target.value as AIQuotaTargetType)}
        className="px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs"
      >
        <option value="GLOBAL">Global</option>
        <option value="ROLE">Par rôle</option>
        <option value="USER">Utilisateur</option>
        <option value="ORG">Organisation</option>
      </select>
      {targetType === 'ROLE' && (
        <input
          placeholder="rôle"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs"
        />
      )}
      <select
        value={period}
        onChange={(e) => setPeriod(e.target.value as AIQuotaPeriod)}
        className="px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs"
      >
        <option value="MONTHLY">Mensuel</option>
        <option value="DAILY">Journalier</option>
      </select>
      <input
        type="number"
        placeholder="max calls (0=∞)"
        value={maxCalls}
        onChange={(e) => setMaxCalls(Number(e.target.value) || 0)}
        className="px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs"
      />
      <input
        type="number"
        placeholder="max tokens (0=∞)"
        value={maxOutTokens}
        onChange={(e) => setMaxOutTokens(Number(e.target.value) || 0)}
        className="px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs"
      />
      <input
        placeholder="max cost $"
        value={maxCost}
        onChange={(e) => setMaxCost(e.target.value)}
        className="px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs"
      />
      <div className="col-span-full flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="px-2 py-1 rounded-md text-xs text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          Annuler
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            onSave({
              target_type: targetType,
              target_role: targetType === 'ROLE' ? role : '',
              period,
              max_calls: maxCalls,
              max_output_tokens: maxOutTokens,
              max_cost_usd: maxCost,
              is_active: true,
            })
          }
          className="px-2 py-1 rounded-md bg-primary-600 text-white text-xs font-bold disabled:opacity-60"
        >
          Créer
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// AUDIT
// ─────────────────────────────────────────────────────────────

function AuditTab() {
  const [kind, setKind] = useState('');
  const [q, setQ] = useState('');
  const [ok, setOk] = useState('');
  const filters = useMemo(() => ({ kind, q, ok }), [kind, q, ok]);
  const { data, refetch, isFetching } = useAIAuditLogs(filters);

  return (
    <section className="rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <h2 className="text-sm font-extrabold uppercase text-neutral-500 flex-1">
          Journal d'audit ({data?.count ?? 0})
        </h2>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs"
        >
          <option value="">Tous les types</option>
          <option value="provider_call">provider_call</option>
          <option value="tool_execution">tool_execution</option>
          <option value="action_approval">action_approval</option>
          <option value="course_gen_finalize">course_gen_finalize</option>
          <option value="kb_search">kb_search</option>
          <option value="web_search">web_search</option>
          <option value="reco_generated">reco_generated</option>
          <option value="text_transform">text_transform</option>
          <option value="image_gen">image_gen</option>
          <option value="provider_test">provider_test</option>
        </select>
        <select
          value={ok}
          onChange={(e) => setOk(e.target.value)}
          className="px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs"
        >
          <option value="">Tous statuts</option>
          <option value="true">Succès</option>
          <option value="false">Échecs</option>
        </select>
        <input
          type="text"
          placeholder="Email / erreur…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs"
        />
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="p-1 rounded text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] font-bold uppercase text-neutral-500 border-b border-neutral-100 dark:border-neutral-800">
              <th className="text-left py-2">Date</th>
              <th className="text-left py-2">Type</th>
              <th className="text-left py-2">Utilisateur</th>
              <th className="text-center py-2">OK</th>
              <th className="text-left py-2">Payload</th>
              <th className="text-left py-2">IP</th>
            </tr>
          </thead>
          <tbody>
            {(data?.results ?? []).map((r) => (
              <tr
                key={r.id}
                className="border-b border-neutral-100 dark:border-neutral-800"
              >
                <td className="py-2 text-xs text-neutral-500 whitespace-nowrap">
                  {new Date(r.created_at).toLocaleString('fr-FR')}
                </td>
                <td className="py-2">
                  <code className="text-[10px] font-mono px-1.5 rounded bg-neutral-100 dark:bg-neutral-800">
                    {r.kind}
                  </code>
                </td>
                <td className="py-2 text-xs">{r.user_email || '—'}</td>
                <td className="py-2 text-center">
                  {r.ok ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600 mx-auto" />
                  ) : (
                    <X className="w-3.5 h-3.5 text-rose-600 mx-auto" />
                  )}
                </td>
                <td className="py-2 text-xs font-mono text-neutral-500 max-w-md truncate">
                  {JSON.stringify(r.payload).slice(0, 100)}
                </td>
                <td className="py-2 text-xs font-mono text-neutral-500">
                  {r.ip || '—'}
                </td>
              </tr>
            ))}
            {(data?.results ?? []).length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="py-4 text-center text-neutral-500 italic"
                >
                  Aucun événement.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
