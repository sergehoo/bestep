/**
 * InstructorRevenuePage.tsx — Console financière instructeur (R13.5).
 *
 * Le backend expose déjà `series.revenue_per_day` (R5) et `top_courses`.
 * On ajoute : projection mensuelle client, calcul commission,
 * simulation retrait. Les payouts persistés arrivent en R14.
 */
import { useMemo, useState } from 'react';
import {
  Wallet,
  TrendingUp,
  PieChart as PieIcon,
  ArrowUpRight,
  Info,
  Download,
} from 'lucide-react';
import { InstructorShell } from '@/components/instructor/InstructorShell';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { TrendLineChart } from '@/components/dashboard/TrendLineChart';
import { BarSeriesChart } from '@/components/dashboard/BarSeriesChart';
import { PeriodSelector } from '@/components/dashboard/PeriodSelector';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useInstructorDashboard } from '@/hooks/queries';
import { formatPrice } from '@/lib/utils';
import type { DashboardPeriod } from '@/lib/types';

// Commission plateforme (à confirmer côté backend)
const COMMISSION_RATE = 0.3;

export default function InstructorRevenuePage() {
  const [period, setPeriod] = useState<DashboardPeriod>('30d');
  const { data, isLoading } = useInstructorDashboard(period);

  const revenueSeries = data?.series?.revenue_per_day ?? [];
  const gross = useMemo(
    () => revenueSeries.reduce((s, p) => s + (p.value ?? 0), 0),
    [revenueSeries],
  );
  const commission = gross * COMMISSION_RATE;
  const net = gross - commission;
  const pendingBalance = net * 0.4; // 40 % non encore versés (mock)
  const available = net - pendingBalance;

  const perCourse = useMemo(() => {
    // Répartition heuristique : proportionnelle au top_courses par
    // enrolled_count sur la période
    const top = data?.top_courses ?? [];
    const totalEnroll = top.reduce((s, t) => s + t.enrolled_count, 0) || 1;
    return top.map((c) => ({
      label: c.title.length > 22 ? c.title.slice(0, 20) + '…' : c.title,
      value: Math.round((gross * c.enrolled_count) / totalEnroll),
    }));
  }, [data, gross]);

  return (
    <InstructorShell
      title="Revenus"
      subtitle="Console financière et prévisions"
      actions={<PeriodSelector value={period} onChange={setPeriod} />}
    >
      {isLoading && !data ? (
        <div className="py-16 flex justify-center">
          <Spinner size="xl" label="Chargement…" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* KPI financiers */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <KpiCard
              label="Chiffre d'affaires"
              value={formatPrice(gross, 'XOF')}
              hint={`Période ${period}`}
              Icon={Wallet}
              accent="primary"
            />
            <KpiCard
              label="Revenus nets"
              value={formatPrice(net, 'XOF')}
              hint={`Après ${Math.round(COMMISSION_RATE * 100)}% commission`}
              Icon={TrendingUp}
              accent="success"
            />
            <KpiCard
              label="Solde disponible"
              value={formatPrice(available, 'XOF')}
              hint="Retrait possible"
              Icon={ArrowUpRight}
              accent="accent"
            />
            <KpiCard
              label="En attente"
              value={formatPrice(pendingBalance, 'XOF')}
              hint="Versement mensuel"
              Icon={Info}
              accent="warning"
            />
          </div>

          {/* Encart retrait */}
          <Card>
            <CardBody className="flex flex-wrap items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <Wallet className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-[200px]">
                <p className="text-sm font-bold text-neutral-900">
                  Demander un retrait
                </p>
                <p className="text-xs text-neutral-500">
                  Vous pouvez retirer{' '}
                  <span className="font-semibold text-neutral-800">
                    {formatPrice(available, 'XOF')}
                  </span>{' '}
                  vers votre compte bancaire ou mobile money.
                </p>
              </div>
              <Button variant="primary" disabled>
                <ArrowUpRight className="w-4 h-4" />
                Retrait (R14)
              </Button>
            </CardBody>
          </Card>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader
                title="Revenus quotidiens"
                subtitle={`Période ${period}`}
              />
              <CardBody>
                <TrendLineChart
                  data={revenueSeries}
                  color="accent"
                  yLabel="XOF"
                  valueFormatter={(v) => formatPrice(v, 'XOF')}
                  ariaLabel="Revenus par jour"
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader
                title="Revenus par cours"
                subtitle="Estimation proportionnelle"
                actions={
                  <PieIcon className="w-5 h-5 text-neutral-400" aria-hidden />
                }
              />
              <CardBody>
                {perCourse.length === 0 ? (
                  <p className="text-sm text-neutral-500 text-center py-6">
                    Aucune revenue sur la période.
                  </p>
                ) : (
                  <BarSeriesChart
                    data={perCourse}
                    ariaLabel="Revenus par cours"
                    color="accent"
                  />
                )}
              </CardBody>
            </Card>
          </div>

          {/* Historique + facturation */}
          <Card>
            <CardHeader
              title="Historique des versements"
              subtitle="Aucun versement pour l'instant"
              actions={
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-neutral-200 hover:bg-neutral-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  Facturation
                </button>
              }
            />
            <CardBody>
              <div className="text-center py-8 text-sm text-neutral-500">
                Le module de payouts (banque / mobile money / factures)
                arrivera avec la prochaine mise à jour financière (R14).
              </div>
            </CardBody>
          </Card>
        </div>
      )}
    </InstructorShell>
  );
}
