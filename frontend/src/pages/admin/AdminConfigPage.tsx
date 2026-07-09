/**
 * AdminConfigPage.tsx — Snapshot config plateforme (R7.5).
 * Lecture seule ; toute modification passe par settings/.env.
 */
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Cog,
  ShieldCheck,
  Gauge,
  Users,
  RefreshCw,
} from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useAdminConfig } from '@/hooks/admin';
import { useQueryClient } from '@tanstack/react-query';

export default function AdminConfigPage() {
  const { data: cfg, isLoading, isFetching } = useAdminConfig();
  const qc = useQueryClient();

  // R27 — Accès défensif : le backend peut renvoyer un payload incomplet
  // (env de démo, config partielle, migration en cours). On fournit des
  // valeurs par défaut pour ne jamais planter le rendu.
  const app = cfg?.app ?? {
    name: '—',
    environment: 'unknown',
    debug: false,
    timezone: '—',
    language: '—',
  };
  const features = cfg?.features ?? {
    jwt_enabled: false,
    cors_enabled: false,
    email_reset: false,
    media_backend: '—',
  };
  const limits = cfg?.limits ?? {
    jwt_access_lifetime_minutes: 0,
    review_page_size_max: 0,
    user_page_size_max: 0,
  };
  const counts = cfg?.counts ?? {
    users_total: 0,
    users_active: 0,
    users_admin: 0,
  };

  return (
    <AdminShell
      title="Configuration plateforme"
      subtitle="Snapshot lecture-seule. Toute modification passe par les fichiers settings / .env."
      actions={
        <Button
          variant="outline"
          size="sm"
          loading={isFetching}
          onClick={() => qc.invalidateQueries({ queryKey: ['admin-config'] })}
        >
          <RefreshCw className="w-4 h-4" />
          Rafraîchir
        </Button>
      }
    >
      <div className="mb-3">
        <Link
          to="/dashboard/admin"
          className="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900"
        >
          <ArrowLeft className="w-4 h-4" /> Retour dashboard admin
        </Link>
      </div>

      <div className="space-y-4">
        {isLoading && !cfg ? (
          <div className="py-20 flex justify-center">
            <Spinner size="xl" label="Chargement config…" />
          </div>
        ) : cfg ? (
          <>
            {/* App */}
            <Card>
              <CardHeader
                title="Application"
                actions={<Cog className="w-5 h-5 text-neutral-400" aria-hidden />}
              />
              <CardBody>
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
                  <Row label="Timezone" value={app.timezone} />
                  <Row label="Langue" value={app.language} />
                </dl>
              </CardBody>
            </Card>

            {/* Features */}
            <Card>
              <CardHeader
                title="Fonctionnalités"
                actions={
                  <ShieldCheck
                    className="w-5 h-5 text-neutral-400"
                    aria-hidden
                  />
                }
              />
              <CardBody>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <FeatureFlag label="JWT" enabled={features.jwt_enabled} />
                  <FeatureFlag
                    label="CORS"
                    enabled={features.cors_enabled}
                  />
                  <FeatureFlag
                    label="Email reset"
                    enabled={features.email_reset}
                  />
                  <div className="rounded-xl border border-neutral-100 p-3">
                    <p className="text-xs text-neutral-500 uppercase tracking-wide">
                      Storage
                    </p>
                    <p className="text-xs font-mono mt-1 break-all">
                      {features.media_backend.split('.').pop()}
                    </p>
                  </div>
                </div>
              </CardBody>
            </Card>

            {/* Limits */}
            <Card>
              <CardHeader
                title="Limites"
                actions={<Gauge className="w-5 h-5 text-neutral-400" aria-hidden />}
              />
              <CardBody>
                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                  <Row
                    label="Access token"
                    value={`${limits.jwt_access_lifetime_minutes} min`}
                  />
                  <Row
                    label="Page reviews"
                    value={`${limits.review_page_size_max} max`}
                  />
                  <Row
                    label="Page users"
                    value={`${limits.user_page_size_max} max`}
                  />
                </dl>
              </CardBody>
            </Card>

            {/* Counts */}
            <Card>
              <CardHeader
                title="Population"
                actions={<Users className="w-5 h-5 text-neutral-400" aria-hidden />}
              />
              <CardBody>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-3xl font-extrabold text-primary-600">
                      {counts.users_total}
                    </p>
                    <p className="text-xs text-neutral-500">Utilisateurs</p>
                  </div>
                  <div>
                    <p className="text-3xl font-extrabold text-emerald-600">
                      {counts.users_active}
                    </p>
                    <p className="text-xs text-neutral-500">Actifs</p>
                  </div>
                  <div>
                    <p className="text-3xl font-extrabold text-accent-600">
                      {counts.users_admin}
                    </p>
                    <p className="text-xs text-neutral-500">Admins</p>
                  </div>
                </div>
              </CardBody>
            </Card>

            <p className="text-xs text-neutral-400 text-right">
              Généré le{' '}
              {cfg?.generated_at
                ? new Date(cfg.generated_at).toLocaleString('fr-FR')
                : '—'}
            </p>
          </>
        ) : (
          <p className="text-sm text-neutral-500">
            Impossible de charger la config.
          </p>
        )}
      </div>
    </AdminShell>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
        {label}
      </dt>
      <dd className="text-sm text-neutral-900 mt-0.5">{value}</dd>
    </div>
  );
}

function FeatureFlag({
  label,
  enabled,
}: {
  label: string;
  enabled: boolean;
}) {
  return (
    <div
      className={
        enabled
          ? 'rounded-xl border border-emerald-200 bg-emerald-50 p-3'
          : 'rounded-xl border border-neutral-200 bg-neutral-50 p-3'
      }
    >
      <p className="text-xs text-neutral-500 uppercase tracking-wide">
        {label}
      </p>
      <p
        className={
          enabled
            ? 'text-sm font-bold text-emerald-700 mt-1'
            : 'text-sm font-bold text-neutral-500 mt-1'
        }
      >
        {enabled ? 'Activé' : 'Désactivé'}
      </p>
    </div>
  );
}
