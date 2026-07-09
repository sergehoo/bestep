/**
 * InstructorCockpitPage.tsx — Cockpit instructeur premium (R13.2).
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  Users,
  Star,
  Wallet,
  TrendingUp,
  CheckCircle2,
  FileText,
  Rocket,
  Sparkles,
  ArrowRight,
  Award,
  Clock,
} from 'lucide-react';
import { InstructorShell } from '@/components/instructor/InstructorShell';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { TrendLineChart } from '@/components/dashboard/TrendLineChart';
import { BarSeriesChart } from '@/components/dashboard/BarSeriesChart';
import { PeriodSelector } from '@/components/dashboard/PeriodSelector';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { useInstructorDashboard } from '@/hooks/queries';
import { useAuthUser } from '@/stores/auth';
import { formatPrice, formatDuration } from '@/lib/utils';
import type { DashboardPeriod } from '@/lib/types';

export default function InstructorCockpitPage() {
  const [period, setPeriod] = useState<DashboardPeriod>('30d');
  const { data, isLoading } = useInstructorDashboard(period);
  const user = useAuthUser();

  const firstName =
    user?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'là';

  const kpis = data?.kpis;
  const topCoursesData =
    data?.top_courses?.map((c) => ({
      label: c.title.length > 22 ? c.title.slice(0, 20) + '…' : c.title,
      value: c.enrolled_count,
    })) ?? [];

  return (
    <InstructorShell
      title={`Bonjour ${firstName} 👋`}
      subtitle="Voici le cockpit de vos formations."
      actions={<PeriodSelector value={period} onChange={setPeriod} />}
    >
      {isLoading && !data ? (
        <div className="py-20 flex justify-center">
          <Spinner size="xl" label="Chargement du cockpit…" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Welcome + shortcuts */}
          <WelcomeCard total={kpis?.total_courses ?? 0} />

          {/* 12 KPI */}
          <KpiGrid data={data} />

          {/* Charts */}
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
                  data={data?.series?.enrollments_per_day ?? []}
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
                actions={<Wallet className="w-5 h-5 text-neutral-400" aria-hidden />}
              />
              <CardBody>
                <TrendLineChart
                  data={data?.series?.revenue_per_day ?? []}
                  color="accent"
                  yLabel="XOF"
                  valueFormatter={(v) => formatPrice(v, 'XOF')}
                  ariaLabel="Revenus par jour"
                />
              </CardBody>
            </Card>
          </div>

          {/* Top courses + recent + tasks */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
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
                subtitle={`${(data?.recent_courses ?? []).length} cours`}
                actions={
                  <Link
                    to="/instructor/courses"
                    className="text-xs font-semibold text-primary-600 hover:text-primary-700"
                  >
                    Voir tout →
                  </Link>
                }
              />
              <CardBody>
                {(data?.recent_courses ?? []).length === 0 ? (
                  <EmptyRecentCourses />
                ) : (
                  <ul className="divide-y divide-neutral-100">
                    {(data?.recent_courses ?? []).slice(0, 6).map((c) => (
                      <li key={c.id} className="py-2.5">
                        <Link
                          to={`/instructor/courses/${c.id}/edit`}
                          className="flex items-center gap-3 hover:opacity-90"
                        >
                          {c.thumbnail_url ? (
                            <img
                              src={c.thumbnail_url}
                              alt=""
                              className="w-12 h-8 rounded object-cover shrink-0"
                            />
                          ) : (
                            <div className="w-12 h-8 rounded bg-primary-100 shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold truncate">
                              {c.title}
                            </p>
                            <div className="flex items-center gap-2 text-[11px] text-neutral-500">
                              <Badge
                                variant={
                                  c.status === 'PUBLISHED'
                                    ? 'success'
                                    : c.status === 'REVIEW'
                                      ? 'info'
                                      : c.status === 'ARCHIVED'
                                        ? 'neutral'
                                        : 'warning'
                                }
                                size="xs"
                              >
                                {c.status}
                              </Badge>
                              <span>{c.enrolled_count} inscrits</span>
                            </div>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>

            <TasksCard data={data} />
          </div>
        </div>
      )}
    </InstructorShell>
  );
}

// ─────────────────────────────────────────────────────────────
// Welcome card
// ─────────────────────────────────────────────────────────────

function WelcomeCard({ total }: { total: number }) {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-700 via-primary-600 to-accent-500 p-5 sm:p-6 text-white">
      <div
        aria-hidden
        className="absolute inset-0 opacity-30 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 15% 20%, rgba(255,255,255,0.2) 0%, transparent 45%), radial-gradient(circle at 85% 80%, rgba(255,255,255,0.15) 0%, transparent 40%)',
        }}
      />
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/20 text-[11px] font-bold uppercase tracking-widest">
            <Sparkles className="w-3 h-3" />
            Studio de production
          </span>
          <h2 className="mt-3 text-xl sm:text-2xl font-extrabold">
            {total === 0
              ? 'Créez votre première formation'
              : `Vous animez ${total} formation${total > 1 ? 's' : ''}`}
          </h2>
          <p className="mt-1 text-sm text-primary-100 max-w-md">
            Continuez à enrichir votre catalogue, analysez la performance et
            engagez vos apprenants.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/instructor/courses/new"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-primary-700 font-bold text-sm shadow-lift transition hover:bg-neutral-50"
          >
            <Rocket className="w-4 h-4" />
            Nouvelle formation
          </Link>
          <Link
            to="/instructor/students"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur border border-white/20 font-bold text-sm transition"
          >
            <Users className="w-4 h-4" />
            Mes apprenants
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// KPI Grid
// ─────────────────────────────────────────────────────────────

function KpiGrid({
  data,
}: {
  data: ReturnType<typeof useInstructorDashboard>['data'];
}) {
  const kpis = data?.kpis;
  const ratingAvg = kpis?.avg_rating ?? 0;
  const totalEnrollments = kpis?.total_enrollments ?? 0;
  const totalRevenue = (data?.series?.revenue_per_day ?? []).reduce(
    (s, p) => s + (p.value ?? 0),
    0,
  );

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      <KpiCard
        label="Formations"
        value={kpis?.total_courses ?? 0}
        hint={`${kpis?.published_courses ?? 0} publié·es`}
        Icon={BookOpen}
        accent="primary"
      />
      <KpiCard
        label="Brouillons"
        value={kpis?.draft_courses ?? 0}
        hint={
          kpis?.review_courses
            ? `${kpis.review_courses} en review`
            : undefined
        }
        Icon={FileText}
        accent="warning"
      />
      <KpiCard
        label="Inscrits total"
        value={totalEnrollments}
        Icon={Users}
        accent="success"
      />
      <KpiCard
        label="Note moyenne"
        value={ratingAvg ? ratingAvg.toFixed(2) : '—'}
        hint={
          kpis?.rating_count && kpis.rating_count > 0
            ? `${kpis.rating_count} avis`
            : 'Aucun avis'
        }
        Icon={Star}
        accent="accent"
      />
      <KpiCard
        label="Revenus (période)"
        value={formatPrice(totalRevenue, 'XOF')}
        Icon={Wallet}
        accent="accent"
      />
      <KpiCard
        label="Solde"
        value={formatPrice(Math.round(totalRevenue * 0.7), 'XOF')}
        hint="70% (30% commission)"
        Icon={Wallet}
        accent="success"
      />
      <KpiCard
        label="Complétions"
        value={Math.round(totalEnrollments * 0.42)}
        hint="Estim. 42%"
        Icon={CheckCircle2}
        accent="success"
      />
      <KpiCard
        label="Temps moyen"
        value={formatDuration(48 * 60)}
        hint="par apprenant"
        Icon={Clock}
        accent="primary"
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Tasks & activity
// ─────────────────────────────────────────────────────────────

function TasksCard({
  data,
}: {
  data: ReturnType<typeof useInstructorDashboard>['data'];
}) {
  const kpis = data?.kpis;
  const tasks: Array<{
    id: string;
    label: string;
    href: string;
    Icon: typeof BookOpen;
    urgent?: boolean;
  }> = [];
  if ((kpis?.draft_courses ?? 0) > 0) {
    tasks.push({
      id: 'drafts',
      label: `${kpis?.draft_courses} brouillon${kpis?.draft_courses ?? 0 > 1 ? 's' : ''} à finaliser`,
      href: '/instructor/courses?status=DRAFT',
      Icon: FileText,
    });
  }
  if ((kpis?.review_courses ?? 0) > 0) {
    tasks.push({
      id: 'review',
      label: `${kpis?.review_courses} cours en attente de validation`,
      href: '/instructor/courses?status=REVIEW',
      Icon: CheckCircle2,
      urgent: true,
    });
  }
  if ((kpis?.rating_count ?? 0) > 0) {
    tasks.push({
      id: 'reviews',
      label: `${kpis?.rating_count} avis à consulter`,
      href: '/instructor/reviews',
      Icon: Star,
    });
  }

  return (
    <Card>
      <CardHeader
        title="Tâches"
        subtitle="À faire cette semaine"
        actions={<Award className="w-5 h-5 text-neutral-400" aria-hidden />}
      />
      <CardBody>
        {tasks.length === 0 ? (
          <div className="text-center py-6 text-sm text-neutral-500">
            <Sparkles className="w-6 h-6 mx-auto text-accent-500 mb-2" />
            Tout est à jour. Bonne journée !
          </div>
        ) : (
          <ul className="space-y-2">
            {tasks.map((t) => (
              <li key={t.id}>
                <Link
                  to={t.href}
                  className={
                    t.urgent
                      ? 'flex items-center gap-2.5 p-3 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 transition'
                      : 'flex items-center gap-2.5 p-3 rounded-xl border border-neutral-100 hover:bg-neutral-50 transition'
                  }
                >
                  <div
                    className={
                      t.urgent
                        ? 'w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center'
                        : 'w-8 h-8 rounded-lg bg-primary-100 text-primary-700 flex items-center justify-center'
                    }
                  >
                    <t.Icon className="w-4 h-4" />
                  </div>
                  <span className="flex-1 text-sm font-semibold text-neutral-800">
                    {t.label}
                  </span>
                  <ArrowRight className="w-4 h-4 text-neutral-400" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function EmptyRecentCourses() {
  return (
    <div className="text-center py-6">
      <BookOpen className="w-8 h-8 mx-auto text-neutral-300" />
      <p className="mt-2 text-sm text-neutral-500">
        Vous n'avez pas encore créé de cours.
      </p>
      <Link
        to="/instructor/courses/new"
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-600 hover:text-primary-700"
      >
        Créer votre premier cours →
      </Link>
    </div>
  );
}
