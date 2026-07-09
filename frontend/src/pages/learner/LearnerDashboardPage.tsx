/**
 * LearnerDashboardPage.tsx — Cockpit apprenant premium (R12.2).
 *
 * Contenu :
 *  - Bienvenue + Continue learning card
 *  - 8 KPI cards (inscrits, terminés, progression globale, heures totales,
 *    heures cette semaine, certificats, badges, streak)
 *  - 2 charts (temps d'apprentissage 30j + gauge niveau XP)
 *  - Preview badges + goals + call-to-action explorer
 */
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BookOpen,
  CheckCircle,
  Clock,
  TrendingUp,
  Award,
  Trophy,
  Flame,
  PlayCircle,
  Target,
  ArrowRight,
  Star,
  Sparkles,
} from 'lucide-react';
import { LearnerShell } from '@/components/learner/LearnerShell';
import { OnboardingBanner } from '@/components/onboarding/OnboardingBanner';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { TrendLineChart } from '@/components/dashboard/TrendLineChart';
import { ProgressBar } from '@/components/premium/ProgressBar';
import { useStudentDashboard } from '@/hooks/queries';
import { useAuthUser } from '@/stores/auth';
import {
  computeStreak,
  computeMinutesThisWeek,
  computeXP,
  xpToLevel,
  computeBadges,
} from '@/lib/learner-stats';

export default function LearnerDashboardPage() {
  const user = useAuthUser();
  const { data, isLoading } = useStudentDashboard('30d');

  const firstName =
    user?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'là';

  return (
    <LearnerShell
      title={`Bonjour ${firstName} 👋`}
      subtitle="Bienvenue dans votre cockpit d'apprentissage."
      actions={
        <Link
          to="/catalogue"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-primary-600 hover:bg-primary-700 text-white transition"
        >
          <Sparkles className="w-4 h-4" />
          Découvrir des cours
        </Link>
      }
    >
      {isLoading && !data ? (
        <div className="py-20 flex justify-center">
          <Spinner size="xl" label="Chargement du dashboard…" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* R24 — Banner onboarding (masqué si complété ou dismissed) */}
          <OnboardingBanner />

          {/* Continue learning */}
          {data?.continue_enrollment ? (
            <ContinueCard
              enrollment={data.continue_enrollment}
            />
          ) : (
            <EmptyContinueCard />
          )}

          <KpiGrid data={data} />

          {/* 2 charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <Card>
                <CardHeader
                  title="Temps d'apprentissage"
                  subtitle="Minutes / jour sur les 30 derniers jours"
                  actions={
                    <TrendingUp
                      className="w-5 h-5 text-neutral-400"
                      aria-hidden
                    />
                  }
                />
                <CardBody>
                  <TrendLineChart
                    data={data?.series?.activity_minutes_per_day ?? []}
                    color="primary"
                    yLabel="min"
                    valueFormatter={(v) => `${v} min`}
                    ariaLabel="Minutes d'apprentissage par jour"
                  />
                </CardBody>
              </Card>
            </div>
            <LevelCard data={data} />
          </div>

          {/* Badges preview + Goals stub */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <BadgesPreview data={data} />
            <GoalsStub />
          </div>
        </div>
      )}
    </LearnerShell>
  );
}

// ─────────────────────────────────────────────────────────────
// KPI Grid
// ─────────────────────────────────────────────────────────────

function KpiGrid({ data }: { data: ReturnType<typeof useStudentDashboard>['data'] }) {
  const kpis = data?.kpis;
  const streak = computeStreak(data?.series?.activity_minutes_per_day);
  const minutesWeek = computeMinutesThisWeek(
    data?.series?.activity_minutes_per_day,
  );
  const inProgress = kpis?.in_progress ?? 0;
  const completed = kpis?.completed ?? 0;
  const total = inProgress + completed;
  const globalProgress = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
    >
      <KpiCard
        label="Cours inscrits"
        value={inProgress}
        Icon={BookOpen}
        accent="primary"
      />
      <KpiCard
        label="Terminés"
        value={completed}
        Icon={CheckCircle}
        accent="success"
      />
      <KpiCard
        label="Progression globale"
        value={`${globalProgress}%`}
        Icon={TrendingUp}
        accent="accent"
      />
      <KpiCard
        label="Certificats"
        value={kpis?.certificates ?? 0}
        Icon={Award}
        accent="accent"
      />
      <KpiCard
        label="Heures totales"
        value={`${kpis?.total_hours ?? 0}h`}
        Icon={Clock}
        accent="primary"
      />
      <KpiCard
        label="Cette semaine"
        value={`${Math.round(minutesWeek / 60)}h`}
        hint={`${Math.round(minutesWeek)} min`}
        Icon={Clock}
        accent="primary"
      />
      <KpiCard
        label="Série active"
        value={`${streak}j`}
        hint={streak >= 7 ? '🔥 En feu !' : 'Continuez !'}
        Icon={Flame}
        accent={streak >= 7 ? 'warning' : 'primary'}
      />
      <KpiCard
        label="Badges gagnés"
        value={computeBadges(data).filter((b) => b.earned).length}
        Icon={Trophy}
        accent="accent"
      />
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// Continue learning card
// ─────────────────────────────────────────────────────────────

function ContinueCard({
  enrollment,
}: {
  enrollment: NonNullable<
    ReturnType<typeof useStudentDashboard>['data']
  >['continue_enrollment'];
}) {
  if (!enrollment) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <Card>
        <CardBody className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
          {enrollment.course.thumbnail_url ? (
            <img
              src={enrollment.course.thumbnail_url}
              alt=""
              className="w-full sm:w-40 h-24 object-cover rounded-xl shrink-0"
            />
          ) : (
            <div className="w-full sm:w-40 h-24 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-primary-600 uppercase tracking-wider">
              Continuer l'apprentissage
            </p>
            <h2 className="mt-1 text-lg sm:text-xl font-extrabold text-neutral-900 truncate">
              {enrollment.course.title}
            </h2>
            <div className="mt-2">
              <ProgressBar
                value={enrollment.progress_percent}
                showValue
                label="Progression"
                size="sm"
              />
            </div>
          </div>
          <Link
            to={`/learn/courses/${enrollment.course.id}/player`}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold shadow-sm transition shrink-0"
          >
            <PlayCircle className="w-4 h-4" />
            Continuer
          </Link>
        </CardBody>
      </Card>
    </motion.div>
  );
}

function EmptyContinueCard() {
  return (
    <Card>
      <CardBody className="text-center py-8">
        <Sparkles className="w-8 h-8 text-accent-500 mx-auto" />
        <h2 className="mt-3 text-lg font-extrabold text-neutral-900">
          Vous n'êtes inscrit à aucun cours pour le moment
        </h2>
        <p className="mt-1 text-sm text-neutral-500">
          Explorez notre catalogue et démarrez votre parcours dès aujourd'hui.
        </p>
        <Link
          to="/catalogue"
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold transition"
        >
          Explorer le catalogue
          <ArrowRight className="w-4 h-4" />
        </Link>
      </CardBody>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// Level card (XP gauge)
// ─────────────────────────────────────────────────────────────

function LevelCard({
  data,
}: {
  data: ReturnType<typeof useStudentDashboard>['data'];
}) {
  const xp = computeXP(data);
  const { level, progress, toNext } = xpToLevel(xp);
  return (
    <Card>
      <CardHeader
        title="Votre niveau"
        subtitle={`Niveau ${level}`}
        actions={<Star className="w-5 h-5 text-accent-500" aria-hidden />}
      />
      <CardBody className="flex flex-col items-center text-center">
        <div className="relative w-32 h-32">
          {/* Anneau progression via SVG */}
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            <circle
              cx="50"
              cy="50"
              r="42"
              stroke="rgb(226 232 240)"
              strokeWidth="10"
              fill="none"
            />
            <motion.circle
              cx="50"
              cy="50"
              r="42"
              stroke="url(#lvl-grad)"
              strokeWidth="10"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${(progress / 100) * 264} 264`}
              initial={{ strokeDasharray: '0 264' }}
              animate={{
                strokeDasharray: `${(progress / 100) * 264} 264`,
              }}
              transition={{ duration: 1, ease: 'easeOut' }}
            />
            <defs>
              <linearGradient id="lvl-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#0284c7" />
                <stop offset="100%" stopColor="#eab308" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-3xl font-extrabold text-neutral-900">{level}</p>
            <p className="text-[10px] text-neutral-500 uppercase tracking-widest">
              Niveau
            </p>
          </div>
        </div>
        <p className="mt-3 text-sm font-semibold text-neutral-800">
          {xp} XP
        </p>
        <p className="text-xs text-neutral-500 mt-1">
          {toNext} XP pour le niveau suivant
        </p>
      </CardBody>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// Badges preview + Goals stub
// ─────────────────────────────────────────────────────────────

function BadgesPreview({
  data,
}: {
  data: ReturnType<typeof useStudentDashboard>['data'];
}) {
  const badges = computeBadges(data);
  return (
    <Card className="lg:col-span-2">
      <CardHeader
        title="Badges"
        subtitle={`${badges.filter((b) => b.earned).length} / ${badges.length} débloqués`}
        actions={
          <Link
            to="/learn/badges"
            className="text-xs font-semibold text-primary-600 hover:text-primary-700"
          >
            Voir tout →
          </Link>
        }
      />
      <CardBody>
        <ul className="grid grid-cols-4 gap-3">
          {badges.slice(0, 8).map((b) => (
            <li key={b.id} className="text-center">
              <div
                className={
                  b.earned
                    ? 'w-12 h-12 mx-auto rounded-2xl bg-gradient-to-br from-accent-300 to-accent-500 text-primary-900 flex items-center justify-center text-xl shadow-lift'
                    : 'w-12 h-12 mx-auto rounded-2xl bg-neutral-100 text-neutral-400 flex items-center justify-center text-xl opacity-60 grayscale'
                }
                title={b.description}
              >
                {b.icon}
              </div>
              <p className="mt-1 text-[10px] text-neutral-600 font-semibold line-clamp-2">
                {b.label}
              </p>
              {!b.earned && (
                <p className="text-[9px] text-neutral-400">
                  {Math.round(b.progress * 100)}%
                </p>
              )}
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

function GoalsStub() {
  // Objectifs mockés : cohérents avec "5h / semaine" par défaut.
  // R13 : lier à un vrai modèle Goal (backend) + persister.
  return (
    <Card>
      <CardHeader
        title="Mon objectif"
        subtitle="5h / semaine"
        actions={
          <Target className="w-5 h-5 text-emerald-500" aria-hidden />
        }
      />
      <CardBody>
        <ProgressBar
          value={35}
          showValue
          label="Objectif hebdomadaire"
          size="md"
          color="success"
        />
        <p className="mt-3 text-xs text-neutral-500">
          Encore 3h15 pour atteindre votre objectif de la semaine.
        </p>
        <Link
          to="/learn/goals"
          className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary-600 hover:text-primary-700"
        >
          Gérer mes objectifs →
        </Link>
      </CardBody>
    </Card>
  );
}

// Preview badge (kept for future variants)
export { Badge };
