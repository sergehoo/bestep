/**
 * AdminSettingsPage.tsx — R46
 *
 * Refonte pleinement éditable : chaque onglet correspond à une section
 * de ``PlatformSettings`` persistée en base et versionnée. Les modifications
 * sont patch-atomiques via ``PATCH /api/admin/platform-settings/`` et
 * journalisées dans ``PlatformSettingsHistory``.
 *
 * L'ancien snapshot ``/admin/config/`` (settings.py runtime) reste affiché
 * en carte "Runtime" à côté pour l'observabilité des variables d'env.
 */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Settings as SettingsIcon,
  Building2,
  Shield,
  Mail,
  HardDrive,
  Gauge,
  Info,
  RefreshCw,
  History,
  ExternalLink,
  CheckCircle,
  XCircle,
} from 'lucide-react';

import {
  useAdminConfig,
  usePlatformSettings,
  useUpdatePlatformSettings,
  usePlatformSettingsHistory,
  type PlatformSettingsSection,
} from '@/hooks/admin';
import { AdminShell } from '@/components/admin/AdminShell';
import { SettingsSectionForm } from '@/components/admin/SettingsSectionForm';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import {
  PageHeader,
  StatCard,
  ErrorState,
} from '@/components/admin/primitives';

type TabKey = PlatformSettingsSection | 'runtime' | 'history';

const TABS: Array<{ key: TabKey; label: string; Icon: typeof Building2 }> = [
  { key: 'identity', label: 'Identité', Icon: Building2 },
  { key: 'auth', label: 'Authentification', Icon: Shield },
  { key: 'emails', label: 'Emails', Icon: Mail },
  { key: 'storage', label: 'Stockage', Icon: HardDrive },
  { key: 'limits', label: 'Limites', Icon: Gauge },
  { key: 'maintenance', label: 'Maintenance', Icon: SettingsIcon },
  { key: 'runtime', label: 'Runtime (.env)', Icon: Info },
  { key: 'history', label: 'Historique', Icon: History },
];

const SECTION_LABELS: Record<
  PlatformSettingsSection,
  { title: string; hint: string; fieldLabels?: Record<string, string> }
> = {
  identity: {
    title: 'Identité de la plateforme',
    hint: 'Nom public, contacts, langues supportées. Impact immédiat sur les emails et l’interface.',
    fieldLabels: {
      platform_name: 'Nom de la plateforme',
      tagline: 'Slogan',
      support_email: 'Email support',
      legal_email: 'Email légal',
      primary_locale: 'Langue par défaut',
      supported_locales: 'Langues supportées',
    },
  },
  auth: {
    title: 'Authentification & sécurité',
    hint: 'Politique de session, MFA administrateur, verrouillage après tentatives échouées.',
    fieldLabels: {
      session_ttl_min: 'Durée de session (min)',
      refresh_ttl_days: 'Durée refresh token (jours)',
      mfa_required_admin: 'MFA obligatoire pour les admins',
      password_min_length: 'Longueur minimale mot de passe',
      lockout_attempts: 'Tentatives avant verrouillage',
      lockout_cooldown_min: 'Cooldown verrouillage (min)',
    },
  },
  emails: {
    title: 'Emails transactionnels',
    hint: 'Adresses expéditrice/réponse et paramètres SMTP applicatifs. Les credentials SMTP restent dans .env.',
    fieldLabels: {
      from_email: 'Expéditeur (From)',
      reply_to: 'Réponse à',
      smtp_host: 'SMTP host',
      smtp_port: 'SMTP port',
      smtp_use_tls: 'SMTP TLS',
      footer_signature: 'Signature footer',
    },
  },
  storage: {
    title: 'Stockage médias',
    hint: 'Configuration du bucket + CDN. Le driver S3/MinIO utilise les credentials du .env.',
    fieldLabels: {
      driver: 'Driver',
      bucket: 'Bucket',
      region: 'Région',
      cdn_url: 'URL CDN',
      max_upload_mb: 'Taille max upload (MB)',
      signed_url_ttl_min: 'Durée URL signées (min)',
    },
  },
  limits: {
    title: 'Limites & quotas',
    hint: 'Plafonds appliqués côté API. Prendre en compte la charge et le stockage.',
    fieldLabels: {
      max_upload_mb: 'Taille max upload (MB)',
      quiz_max_questions: 'Questions max par quiz',
      course_max_lessons: 'Leçons max par cours',
      instructor_max_courses: 'Cours max par formateur',
      students_per_cohort: 'Apprenants max par cohorte',
    },
  },
  maintenance: {
    title: 'Maintenance',
    hint: 'Activer bloque les écritures API. Utiliser pendant les migrations ou incidents.',
    fieldLabels: {
      is_enabled: 'Mode maintenance actif',
      message: 'Message affiché aux utilisateurs',
      estimated_end: 'Fin estimée (ISO, optionnel)',
      block_write_only: 'Bloquer uniquement les écritures',
    },
  },
};

export default function AdminSettingsPage() {
  const [tab, setTab] = useState<TabKey>('identity');
  const [flash, setFlash] = useState<PlatformSettingsSection | null>(null);
  const qc = useQueryClient();

  const {
    data: settings,
    isLoading,
    isFetching,
    isError,
  } = usePlatformSettings();
  const { data: runtime } = useAdminConfig();
  const { data: history } = usePlatformSettingsHistory(20);
  const patchMutation = useUpdatePlatformSettings();

  const version = settings?.version ?? 0;
  const updatedAt = settings?.updated_at;
  const updatedBy = settings?.updated_by;

  const app = runtime?.app ?? {
    name: '—',
    environment: 'unknown',
    debug: false,
    timezone: '—',
    language: '—',
  };
  const features = runtime?.features ?? {
    jwt_enabled: false,
    cors_enabled: false,
    email_reset: false,
    media_backend: '—',
  };
  const runtimeLimits = runtime?.limits ?? {
    jwt_access_lifetime_minutes: 0,
    review_page_size_max: 0,
    user_page_size_max: 0,
  };

  async function handleSectionSave(
    section: PlatformSettingsSection,
    patch: Record<string, unknown>,
  ) {
    if (Object.keys(patch).length === 0) return;
    await patchMutation.mutateAsync({
      patch: { [section]: patch },
      note: `Section ${section} modifiée depuis l'interface admin.`,
    });
    setFlash(section);
    window.setTimeout(() => setFlash((f) => (f === section ? null : f)), 2400);
  }

  const activeSection: PlatformSettingsSection | null =
    tab === 'runtime' || tab === 'history' ? null : tab;

  return (
    <AdminShell>
      <PageHeader
        title="Paramètres plateforme"
        subtitle={
          settings
            ? `Version #${version} — dernière modification ${
                updatedAt ? new Date(updatedAt).toLocaleString('fr-FR') : '—'
              }${updatedBy ? ` par ${updatedBy.email}` : ''}`
            : 'Paramètres persistés + versionnés (PlatformSettings)'
        }
        breadcrumbs={[
          { label: 'Administration', to: '/dashboard/admin' },
          { label: 'Plateforme' },
          { label: 'Paramètres' },
        ]}
        actions={
          <button
            type="button"
            onClick={() => {
              qc.invalidateQueries({ queryKey: ['admin-platform-settings'] });
              qc.invalidateQueries({
                queryKey: ['admin-platform-settings-history'],
              });
              qc.invalidateQueries({ queryKey: ['admin-config'] });
            }}
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

      {isError ? (
        <ErrorState
          onRetry={() =>
            qc.invalidateQueries({ queryKey: ['admin-platform-settings'] })
          }
        />
      ) : (
        <>
          {/* KPI récap */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <StatCard
              Icon={SettingsIcon}
              label="Version courante"
              value={`#${version}`}
              tone="primary"
              deltaLabel={
                updatedAt
                  ? new Date(updatedAt).toLocaleDateString('fr-FR')
                  : '—'
              }
            />
            <StatCard
              Icon={Shield}
              label="Environnement"
              value={app.environment}
              tone={app.environment === 'prod' ? 'emerald' : 'rose'}
              deltaLabel={`debug=${app.debug ? 'ON' : 'OFF'}`}
            />
            <StatCard
              Icon={Building2}
              label="Timezone"
              value={app.timezone}
              tone="sky"
              deltaLabel={`lang=${app.language}`}
            />
            <StatCard
              Icon={History}
              label="Modifications 30j"
              value={history?.count ?? 0}
              tone="accent"
              deltaLabel={
                updatedBy ? `Par ${updatedBy.email}` : 'aucune modification'
              }
            />
          </div>

          {/* Onglets */}
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

          {/* Contenu */}
          {isLoading && !settings ? (
            <Card>
              <CardBody className="py-8 text-center text-sm text-neutral-500">
                Chargement des paramètres…
              </CardBody>
            </Card>
          ) : settings && activeSection ? (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-primary-600" />
                  <h2 className="font-extrabold text-neutral-900 dark:text-white">
                    {SECTION_LABELS[activeSection].title}
                  </h2>
                  {patchMutation.isError && (
                    <span className="ml-auto text-xs text-rose-600 dark:text-rose-400 font-semibold">
                      Erreur — modifications non enregistrées
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardBody>
                <SettingsSectionForm
                  values={settings.data[activeSection]}
                  defaults={settings.defaults[activeSection]}
                  fieldLabels={
                    SECTION_LABELS[activeSection].fieldLabels
                  }
                  hint={SECTION_LABELS[activeSection].hint}
                  onSave={(patch) => handleSectionSave(activeSection, patch)}
                  isPending={patchMutation.isPending}
                  savedFlash={flash === activeSection}
                />
              </CardBody>
            </Card>
          ) : tab === 'runtime' ? (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Info className="w-5 h-5 text-primary-600" />
                  <h2 className="font-extrabold text-neutral-900 dark:text-white">
                    Runtime — variables .env / settings.py
                  </h2>
                </div>
              </CardHeader>
              <CardBody>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
                  Ces valeurs sont chargées au démarrage du container. Pour
                  les modifier, éditer <code>.env</code> ou
                  <code> best_epargne/settings/prod.py</code> puis
                  redémarrer <code>bestweb</code>.
                </p>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <Row label="Nom" value={app.name} />
                  <Row
                    label="Environnement"
                    value={
                      <Badge
                        variant={
                          app.environment === 'prod' ? 'success' : 'warning'
                        }
                        size="sm"
                      >
                        {app.environment}
                      </Badge>
                    }
                  />
                  <Row label="Timezone" value={app.timezone} />
                  <Row label="Langue" value={app.language} />
                  <Row
                    label="JWT"
                    value={<FeatureFlag enabled={features.jwt_enabled} />}
                  />
                  <Row
                    label="CORS"
                    value={<FeatureFlag enabled={features.cors_enabled} />}
                  />
                  <Row
                    label="Email reset"
                    value={<FeatureFlag enabled={features.email_reset} />}
                  />
                  <Row
                    label="Debug"
                    value={
                      <Badge
                        variant={app.debug ? 'warning' : 'success'}
                        size="sm"
                      >
                        {app.debug ? 'ON' : 'OFF'}
                      </Badge>
                    }
                  />
                  <Row
                    label="Media backend"
                    value={
                      <code className="font-mono text-[11px] break-all">
                        {features.media_backend}
                      </code>
                    }
                  />
                  <Row
                    label="JWT access TTL"
                    value={`${runtimeLimits.jwt_access_lifetime_minutes} min`}
                  />
                  <Row
                    label="Reviews page max"
                    value={runtimeLimits.review_page_size_max}
                  />
                  <Row
                    label="Users page max"
                    value={runtimeLimits.user_page_size_max}
                  />
                </dl>
                <a
                  href="/admin/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition"
                >
                  <ExternalLink className="w-4 h-4" />
                  Ouvrir Django admin
                </a>
              </CardBody>
            </Card>
          ) : tab === 'history' ? (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <History className="w-5 h-5 text-primary-600" />
                  <h2 className="font-extrabold text-neutral-900 dark:text-white">
                    Historique des modifications
                  </h2>
                </div>
              </CardHeader>
              <CardBody>
                {!history || history.results.length === 0 ? (
                  <p className="text-sm text-neutral-500 dark:text-neutral-400 py-6 text-center">
                    Aucune modification enregistrée pour le moment.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {history.results.map((h) => (
                      <li
                        key={h.id}
                        className="rounded-xl border border-neutral-100 dark:border-neutral-700 p-3"
                      >
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div>
                            <span className="text-sm font-bold text-neutral-900 dark:text-white">
                              Version #{h.version}
                            </span>
                            <span className="ml-2 text-xs text-neutral-500 dark:text-neutral-400">
                              {new Date(h.created_at).toLocaleString('fr-FR')}
                            </span>
                            {h.actor && (
                              <span className="ml-2 text-xs text-neutral-700 dark:text-neutral-300">
                                par <strong>{h.actor.email}</strong>
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-neutral-500 dark:text-neutral-400">
                            {h.diff_count} champ{h.diff_count > 1 ? 's' : ''}{' '}
                            modifié{h.diff_count > 1 ? 's' : ''}
                          </span>
                        </div>
                        {h.note && (
                          <p className="mt-1 text-xs text-neutral-500 italic">
                            {h.note}
                          </p>
                        )}
                        {h.diff.length > 0 && (
                          <ul className="mt-2 divide-y divide-neutral-100 dark:divide-neutral-700 text-xs">
                            {h.diff.map((d, i) => (
                              <li
                                key={`${h.id}-${i}`}
                                className="py-1.5 flex flex-wrap items-center gap-2"
                              >
                                <code className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-900 font-mono text-[10px]">
                                  {d.section}.{d.key}
                                </code>
                                <span className="text-rose-600 dark:text-rose-400 font-mono line-through">
                                  {JSON.stringify(d.old)}
                                </span>
                                <span className="text-neutral-400">→</span>
                                <span className="text-emerald-600 dark:text-emerald-400 font-mono">
                                  {JSON.stringify(d.new)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          ) : null}
        </>
      )}
    </AdminShell>
  );
}

// ─────────────────────────────────────────────────────────────
// Petits helpers d'affichage
// ─────────────────────────────────────────────────────────────

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-[11px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
        {label}
      </dt>
      <dd className="text-sm font-semibold text-neutral-900 dark:text-white">
        {value}
      </dd>
    </div>
  );
}

function FeatureFlag({ enabled }: { enabled: boolean }) {
  return enabled ? (
    <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-bold">
      <CheckCircle className="w-4 h-4" />
      Activé
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-400 font-bold">
      <XCircle className="w-4 h-4" />
      Désactivé
    </span>
  );
}
