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
import { PublicHeader } from '@/components/layout/PublicHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useAdminConfig } from '@/hooks/admin';
import { useQueryClient } from '@tanstack/react-query';

export default function AdminConfigPage() {
  const { data: cfg, isLoading, isFetching } = useAdminConfig();
  const qc = useQueryClient();

  return (
    <div className="min-h-screen bg-neutral-50">
      <PublicHeader />
      <section className="border-b border-neutral-200 bg-white">
        <div className="container mx-auto px-4 max-w-5xl py-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link
              to="/dashboard/admin"
              className="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900 mb-2"
            >
              <ArrowLeft className="w-4 h-4" /> Retour dashboard admin
            </Link>
            <h1 className="text-2xl font-extrabold text-neutral-900">
              Configuration plateforme
            </h1>
            <p className="text-sm text-neutral-500 mt-1">
              Snapshot lecture-seule. Toute modification passe par les fichiers
              settings / .env.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            loading={isFetching}
            onClick={() =>
              qc.invalidateQueries({ queryKey: ['admin-config'] })
            }
          >
            <RefreshCw className="w-4 h-4" />
            Rafraîchir
          </Button>
        </div>
      </section>

      <main className="container mx-auto px-4 max-w-5xl py-6 space-y-4">
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
                  <Row label="Nom" value={cfg.app.name} />
                  <Row
                    label="Environnement"
                    value={
                      <Badge
                        variant={
                          cfg.app.environment === 'prod' ? 'success' : 'warning'
                        }
                        size="sm"
                      >
                        {cfg.app.environment}
                      </Badge>
                    }
                  />
                  <Row
                    label="Debug"
                    value={
                      <Badge
                        variant={cfg.app.debug ? 'warning' : 'success'}
                        size="sm"
                      >
                        {cfg.app.debug ? 'ON' : 'OFF'}
                      </Badge>
                    }
                  />
                  <Row label="Timezone" value={cfg.app.timezone} />
                  <Row label="Langue" value={cfg.app.language} />
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
                  <FeatureFlag label="JWT" enabled={cfg.features.jwt_enabled} />
                  <FeatureFlag
                    label="CORS"
                    enabled={cfg.features.cors_enabled}
                  />
                  <FeatureFlag
                    label="Email reset"
                    enabled={cfg.features.email_reset}
                  />
                  <div className="rounded-xl border border-neutral-100 p-3">
                    <p className="text-xs text-neutral-500 uppercase tracking-wide">
                      Storage
                    </p>
                    <p className="text-xs font-mono mt-1 break-all">
                      {cfg.features.media_backend.split('.').pop()}
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
                    value={`${cfg.limits.jwt_access_lifetime_minutes} min`}
                  />
                  <Row
                    label="Page reviews"
                    value={`${cfg.limits.review_page_size_max} max`}
                  />
                  <Row
                    label="Page users"
                    value={`${cfg.limits.user_page_size_max} max`}
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
                      {cfg.counts.users_total}
                    </p>
                    <p className="text-xs text-neutral-500">Utilisateurs</p>
                  </div>
                  <div>
                    <p className="text-3xl font-extrabold text-emerald-600">
                      {cfg.counts.users_active}
                    </p>
                    <p className="text-xs text-neutral-500">Actifs</p>
                  </div>
                  <div>
                    <p className="text-3xl font-extrabold text-accent-600">
                      {cfg.counts.users_admin}
                    </p>
                    <p className="text-xs text-neutral-500">Admins</p>
                  </div>
                </div>
              </CardBody>
            </Card>

            <p className="text-xs text-neutral-400 text-right">
              Généré le {new Date(cfg.generated_at).toLocaleString('fr-FR')}
            </p>
          </>
        ) : (
          <p className="text-sm text-neutral-500">
            Impossible de charger la config.
          </p>
        )}
      </main>
    </div>
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
