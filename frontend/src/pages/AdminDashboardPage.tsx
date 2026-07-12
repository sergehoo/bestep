/**
 * AdminDashboardPage.tsx — Dashboard admin plateforme (R5.5).
 *
 * Contenu :
 *  - 6 KPI plateforme
 *  - 3 charts (nouveaux users / enrollments / revenus)
 *  - Top 5 cours populaires
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  UserCheck,
  BookOpen,
  GraduationCap,
  Wallet,
  CheckCircle,
} from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { AdminOverviewSection } from '@/components/admin/AdminOverviewSection';
import { PeriodSelector } from '@/components/dashboard/PeriodSelector';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { TrendLineChart } from '@/components/dashboard/TrendLineChart';
import { BarSeriesChart } from '@/components/dashboard/BarSeriesChart';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { useAdminDashboard } from '@/hooks/queries';
import { formatPrice } from '@/lib/utils';
import type { DashboardPeriod } from '@/lib/types';

export default function AdminDashboardPage() {
  const [period, setPeriod] = useState<DashboardPeriod>('30d');
  const { data, isLoading } = useAdminDashboard(period);

  const topCoursesData =
    data?.top_courses?.map((c) => ({
      label: c.title.length > 22 ? c.title.slice(0, 20) + '…' : c.title,
      value: c.enrolled_count,
    })) ?? [];

  // R27 — Accès défensif : le backend peut renvoyer un payload
  // incomplet (erreur transitoire, migration en cours, config partielle).
  // On fournit des valeurs par défaut à 0 pour ne jamais planter.
  const kpis = data?.kpis ?? {
    users_total: 0,
    users_active: 0,
    courses_published: 0,
    courses_total: 0,
    enrollments_total: 0,
    enrollments_active: 0,
    enrollments_completed: 0,
    revenue_total: 0,
    payments_count: 0,
  };
  const series = data?.series ?? {
    new_users_per_day: [],
    enrollments_per_day: [],
    revenue_per_day: [],
  };
  const topCourses = data?.top_courses ?? [];

  return (
    <AdminShell
      title="Cockpit administrateur"
      subtitle="Vue d'ensemble Best Épargne."
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          <PeriodSelector value={period} onChange={setPeriod} />
          <Link
            to="/admin/users"
            className="text-xs font-semibold text-primary-600 hover:text-primary-700 px-3 py-1.5 rounded-lg border border-neutral-200 hover:bg-neutral-50"
          >
            Utilisateurs →
          </Link>
          <Link
            to="/admin/config"
            className="text-xs font-semibold text-primary-600 hover:text-primary-700 px-3 py-1.5 rounded-lg border border-neutral-200 hover:bg-neutral-50"
          >
            Config →
          </Link>
        </div>
      }
    >
      {/* R45 — Vue consolidée : alertes actionnables + raccourcis + activité + top */}
      <AdminOverviewSection />

      {isLoading && !data && (
        <div className="py-20 flex justify-center">
          <Spinner size="xl" label="Chargement du dashboard…" />
        </div>
      )}

      {data && (
        <>
          {/* KPIs — première ligne */}
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <KpiCard
              label="Utilisateurs"
              value={kpis.users_total}
              hint={`${kpis.users_active} actifs`}
              Icon={Users}
              accent="primary"
            />
            <KpiCard
              label="Actifs"
              value={kpis.users_active}
              Icon={UserCheck}
              accent="success"
            />
            <KpiCard
              label="Cours publiés"
              value={kpis.courses_published}
              hint={`${kpis.courses_total} au total`}
              Icon={BookOpen}
              accent="primary"
            />
            <KpiCard
              label="Inscriptions"
              value={kpis.enrollments_total}
              hint={`${kpis.enrollments_active} actives`}
              Icon={GraduationCap}
              accent="accent"
            />
            <KpiCard
              label="Complétions"
              value={kpis.enrollments_completed}
              Icon={CheckCircle}
              accent="success"
            />
            <KpiCard
              label="Revenus"
              value={formatPrice(kpis.revenue_total, 'XOF')}
              hint={`${kpis.payments_count} paiements`}
              Icon={Wallet}
              accent="accent"
            />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <Card>
              <CardHeader
                title="Nouveaux inscrits"
                subtitle={`Période ${period}`}
              />
              <CardBody>
                <TrendLineChart
                  data={series.new_users_per_day ?? []}
                  color="primary"
                  yLabel="Users"
                  ariaLabel="Nouveaux utilisateurs par jour"
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader
                title="Enrollments"
                subtitle={`Période ${period}`}
              />
              <CardBody>
                <TrendLineChart
                  data={series.enrollments_per_day ?? []}
                  color="success"
                  yLabel="Insc."
                  ariaLabel="Nouvelles inscriptions par jour"
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader
                title="Revenus"
                subtitle={`Période ${period}`}
              />
              <CardBody>
                <TrendLineChart
                  data={series.revenue_per_day ?? []}
                  color="accent"
                  yLabel="XOF"
                  valueFormatter={(v) => formatPrice(v, 'XOF')}
                  ariaLabel="Revenus par jour"
                />
              </CardBody>
            </Card>
          </div>

          {/* Top courses */}
          <Card>
            <CardHeader
              title="Cours les plus populaires"
              subtitle="Top 5 tous cours confondus"
            />
            <CardBody>
              {topCoursesData.length === 0 ? (
                <p className="text-sm text-neutral-500 text-center py-6">
                  Aucun cours publié à afficher.
                </p>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <BarSeriesChart
                    data={topCoursesData}
                    ariaLabel="Top cours par inscriptions"
                  />
                  <ul className="divide-y divide-neutral-100">
                    {topCourses.map((c, idx) => (
                      <li
                        key={c.id}
                        className="py-3 first:pt-0 last:pb-0 flex items-center gap-3"
                      >
                        <span className="w-6 text-center font-bold text-neutral-400">
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <Link
                            to={`/courses/${c.slug}`}
                            className="font-semibold truncate block hover:text-primary-600"
                          >
                            {c.title}
                          </Link>
                          <p className="text-xs text-neutral-500">
                            Par {c.instructor_name}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-primary-600">
                          {c.enrolled_count}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardBody>
          </Card>

          <p className="text-xs text-neutral-400 text-right">
            Généré à{' '}
            {data?.generated_at
              ? new Date(data.generated_at).toLocaleTimeString('fr-FR')
              : '—'}
          </p>
        </>
      )}
    </AdminShell>
  );
}
