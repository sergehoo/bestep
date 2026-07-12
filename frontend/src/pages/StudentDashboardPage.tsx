/**
 * StudentDashboardPage.tsx — Dashboard apprenant enrichi (R5.3).
 *
 * Contenu :
 *  - 4 KPI cards (in_progress / completed / certificates / total_hours)
 *  - Continue learning card (dernière leçon active)
 *  - Chart activité (minutes/jour, période 7d/30d/90d)
 *  - Liste enrollments récents avec barre de progression
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  Award,
  Clock,
  CheckCircle,
  PlayCircle,
  Activity,
} from 'lucide-react';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { TrendLineChart } from '@/components/dashboard/TrendLineChart';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { useStudentDashboard } from '@/hooks/queries';
import { useAuthUser } from '@/stores/auth';
import type { DashboardPeriod } from '@/lib/types';
import { AIRecommendationWidget } from '@/components/ai/AIRecommendationWidget';

export default function StudentDashboardPage() {
  const [period, setPeriod] = useState<DashboardPeriod>('30d');
  const { data, isLoading } = useStudentDashboard(period);
  const user = useAuthUser();

  // R29 — Accès défensif : évite tout crash React si le backend renvoie
  // un payload incomplet (compte tout neuf, erreur transitoire, config
  // partielle).
  const kpis = data?.kpis ?? {
    in_progress: 0,
    completed: 0,
    certificates: 0,
    total_hours: 0,
  };
  const series = data?.series ?? {
    activity_minutes_per_day: [],
    completions_per_day: [],
  };

  return (
    <DashboardShell
      title="Mon espace apprenant"
      subtitle={
        user?.full_name
          ? `Bienvenue ${user.full_name.split(' ')[0]}, voici votre progression.`
          : 'Voici votre progression.'
      }
      period={period}
      onPeriodChange={setPeriod}
    >
      {isLoading && !data && (
        <div className="py-20 flex justify-center">
          <Spinner size="xl" label="Chargement du dashboard…" />
        </div>
      )}

      {/* AI Phase 3 — Recommandations personnalisées */}
      <AIRecommendationWidget className="mb-6" />

      {data && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="En cours"
              value={kpis.in_progress}
              Icon={BookOpen}
              accent="primary"
            />
            <KpiCard
              label="Terminés"
              value={kpis.completed}
              Icon={CheckCircle}
              accent="success"
            />
            <KpiCard
              label="Certificats"
              value={kpis.certificates}
              Icon={Award}
              accent="accent"
            />
            <KpiCard
              label="Heures apprises"
              value={`${kpis.total_hours}h`}
              Icon={Clock}
              accent="primary"
            />
          </div>

          {/* Continue */}
          {data.continue_enrollment && (
            <Card>
              <CardHeader
                title="Reprendre là où vous en étiez"
                subtitle={`Progression : ${data.continue_enrollment.progress_percent}%`}
              />
              <CardBody className="flex items-center gap-4 flex-wrap">
                {data.continue_enrollment.course.thumbnail_url && (
                  <img
                    src={data.continue_enrollment.course.thumbnail_url}
                    alt=""
                    className="w-32 h-20 object-cover rounded-xl"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold truncate">
                    {data.continue_enrollment.course.title}
                  </p>
                  <div className="mt-2 h-2 bg-neutral-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary-600 transition-all"
                      style={{
                        width: `${Math.max(4, data.continue_enrollment.progress_percent)}%`,
                      }}
                    />
                  </div>
                </div>
                <Link
                  to={`/courses/${data.continue_enrollment.course.slug}`}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm bg-primary-600 text-white hover:bg-primary-700 transition"
                >
                  <PlayCircle className="w-4 h-4" />
                  Continuer
                </Link>
              </CardBody>
            </Card>
          )}

          {/* Activité chart */}
          <Card>
            <CardHeader
              title="Activité"
              subtitle={`Minutes d'apprentissage — ${period}`}
              actions={
                <Activity className="w-5 h-5 text-neutral-400" aria-hidden />
              }
            />
            <CardBody>
              <TrendLineChart
                data={series.activity_minutes_per_day ?? []}
                color="primary"
                yLabel="min"
                ariaLabel="Minutes d'apprentissage par jour"
                valueFormatter={(v) => `${v} min`}
              />
            </CardBody>
          </Card>

          {/* Récents enrollments */}
          <Card>
            <CardHeader
              title="Mes cours récents"
              subtitle={`${(data.recent_enrollments ?? []).length} inscription(s)`}
            />
            <CardBody>
              {(data.recent_enrollments ?? []).length === 0 ? (
                <div className="text-sm text-neutral-500 text-center py-6">
                  Vous n'êtes inscrit à aucun cours pour le moment.
                  <br />
                  <Link
                    to="/catalogue"
                    className="text-primary-600 font-semibold mt-2 inline-block"
                  >
                    Découvrir le catalogue →
                  </Link>
                </div>
              ) : (
                <ul className="divide-y divide-neutral-100">
                  {(data.recent_enrollments ?? []).map((e) => (
                    <li
                      key={e.id}
                      className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      {e.course.thumbnail_url ? (
                        <img
                          src={e.course.thumbnail_url}
                          alt=""
                          className="w-16 h-12 object-cover rounded-lg shrink-0"
                        />
                      ) : (
                        <div className="w-16 h-12 rounded-lg bg-primary-100 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/courses/${e.course.slug}`}
                            className="font-semibold truncate hover:text-primary-600"
                          >
                            {e.course.title}
                          </Link>
                          <Badge
                            variant={
                              e.status === 'COMPLETED'
                                ? 'success'
                                : e.status === 'ACTIVE'
                                  ? 'primary'
                                  : 'neutral'
                            }
                            size="xs"
                          >
                            {e.status}
                          </Badge>
                        </div>
                        <div className="mt-1 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary-500"
                            style={{
                              width: `${Math.max(2, e.progress_percent)}%`,
                            }}
                          />
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-neutral-500 shrink-0">
                        {e.progress_percent}%
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </DashboardShell>
  );
}
