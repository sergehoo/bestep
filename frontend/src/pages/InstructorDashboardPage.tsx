/**
 * InstructorDashboardPage.tsx — Dashboard formateur enrichi (R5.4).
 *
 * Contenu :
 *  - 4 KPI (cours publiés, brouillons, inscrits totaux, note moyenne)
 *  - Chart enrollments/jour + Chart revenus/jour
 *  - Top 5 cours par enrollments sur la période
 *  - Liste 8 cours récents
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  FileText,
  Users,
  Star,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { TrendLineChart } from '@/components/dashboard/TrendLineChart';
import { BarSeriesChart } from '@/components/dashboard/BarSeriesChart';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { useInstructorDashboard } from '@/hooks/queries';
import { formatPrice } from '@/lib/utils';
import type { DashboardPeriod } from '@/lib/types';

export default function InstructorDashboardPage() {
  const [period, setPeriod] = useState<DashboardPeriod>('30d');
  const { data, isLoading } = useInstructorDashboard(period);

  const topCoursesData =
    data?.top_courses?.map((c) => ({
      label: c.title.length > 22 ? c.title.slice(0, 20) + '…' : c.title,
      value: c.enrolled_count,
    })) ?? [];

  return (
    <DashboardShell
      title="Espace formateur"
      subtitle="Vos cours, vos inscrits et vos revenus."
      period={period}
      onPeriodChange={setPeriod}
    >
      {isLoading && !data && (
        <div className="py-20 flex justify-center">
          <Spinner size="xl" label="Chargement du dashboard…" />
        </div>
      )}

      {data && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Cours publiés"
              value={data.kpis.published_courses}
              hint={`${data.kpis.total_courses} au total`}
              Icon={BookOpen}
              accent="primary"
            />
            <KpiCard
              label="Brouillons"
              value={data.kpis.draft_courses}
              hint={
                data.kpis.review_courses > 0
                  ? `${data.kpis.review_courses} en review`
                  : undefined
              }
              Icon={FileText}
              accent="warning"
            />
            <KpiCard
              label="Inscrits totaux"
              value={data.kpis.total_enrollments}
              Icon={Users}
              accent="success"
            />
            <KpiCard
              label="Note moyenne"
              value={data.kpis.avg_rating ? data.kpis.avg_rating.toFixed(2) : '—'}
              hint={
                data.kpis.rating_count > 0
                  ? `${data.kpis.rating_count} avis`
                  : 'Aucun avis'
              }
              Icon={Star}
              accent="accent"
            />
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader
                title="Nouvelles inscriptions"
                subtitle={`Période ${period}`}
                actions={
                  <TrendingUp className="w-5 h-5 text-neutral-400" aria-hidden />
                }
              />
              <CardBody>
                <TrendLineChart
                  data={data.series?.enrollments_per_day ?? []}
                  color="primary"
                  yLabel="Insc."
                  ariaLabel="Nouvelles inscriptions par jour"
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader
                title="Revenus"
                subtitle={`Période ${period}`}
                actions={
                  <Wallet className="w-5 h-5 text-neutral-400" aria-hidden />
                }
              />
              <CardBody>
                <TrendLineChart
                  data={data.series?.revenue_per_day ?? []}
                  color="accent"
                  yLabel="XOF"
                  valueFormatter={(v) => formatPrice(v, 'XOF')}
                  ariaLabel="Revenus par jour"
                />
              </CardBody>
            </Card>
          </div>

          {/* Top courses + recent courses */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader
                title="Top 5 cours"
                subtitle={`Par inscriptions sur ${period}`}
              />
              <CardBody>
                {topCoursesData.length === 0 ? (
                  <p className="text-sm text-neutral-500 text-center py-6">
                    Aucune inscription sur la période.
                  </p>
                ) : (
                  <BarSeriesChart
                    data={topCoursesData}
                    ariaLabel="Top cours par inscriptions"
                  />
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Cours récents"
                subtitle={`${(data.recent_courses ?? []).length} cours`}
              />
              <CardBody>
                {(data.recent_courses ?? []).length === 0 ? (
                  <p className="text-sm text-neutral-500 text-center py-6">
                    Vous n'avez pas encore de cours.
                  </p>
                ) : (
                  <ul className="divide-y divide-neutral-100">
                    {(data.recent_courses ?? []).map((c) => (
                      <li
                        key={c.id}
                        className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <Link
                            to={`/courses/${c.slug}`}
                            className="font-semibold truncate block hover:text-primary-600"
                          >
                            {c.title}
                          </Link>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <Badge
                              variant={
                                c.status === 'PUBLISHED'
                                  ? 'success'
                                  : c.status === 'DRAFT'
                                    ? 'warning'
                                    : c.status === 'REVIEW'
                                      ? 'info'
                                      : 'neutral'
                              }
                              size="xs"
                            >
                              {c.status}
                            </Badge>
                            <span className="text-xs text-neutral-500">
                              {c.enrolled_count} inscrits
                            </span>
                            {c.rating_count > 0 && (
                              <span className="text-xs text-neutral-500 inline-flex items-center gap-1">
                                <Star className="w-3 h-3 fill-accent-500 text-accent-500" />
                                {c.rating_avg.toFixed(1)}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-sm font-semibold text-primary-600 shrink-0">
                          {c.pricing_type === 'FREE'
                            ? 'Gratuit'
                            : formatPrice(c.price, c.currency)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>
        </>
      )}
    </DashboardShell>
  );
}
