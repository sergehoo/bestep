/**
 * AdminOverviewSection.tsx — R45.2
 *
 * Section haute du cockpit administrateur, à afficher au-dessus des
 * KPI period-based existants (dashboard R5). Consomme
 * `GET /api/admin/overview/`. Contient :
 *   - Alertes actionnables (payouts pending, avis masqués, cours draft…)
 *   - Grille de raccourcis vers les modules admin
 *   - Activité récente (10 derniers lifecycle events)
 *   - Top 5 formateurs par inscriptions
 *
 * Le hook data est autonome — la section ne dépend d'aucune période et
 * ne bloque pas le reste du dashboard s'il échoue.
 */
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Users,
  BookOpen,
  Wallet,
  Coins,
  MessageSquareWarning,
  ShoppingBag,
  AlertTriangle,
  ArrowRight,
  Activity,
  Award,
  Building2,
  GraduationCap,
  ClipboardList,
  Library,
  Shield,
  LifeBuoy,
  BarChart3,
  Settings,
  Tag,
  ScrollText,
  Clock,
  TrendingUp,
} from 'lucide-react';

import api from '@/lib/api';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { StatusBadge, type StatusKind } from '@/components/admin/primitives';

interface Overview {
  generated_at: string;
  alerts: {
    payouts_pending: number;
    payouts_validated: number;
    reviews_hidden: number;
    courses_draft: number;
    orders_pending: number;
    orders_failed: number;
  };
  kpis: {
    users_total: number;
    users_active: number;
    users_new_7d: number;
    courses_total: number;
    courses_published: number;
    enrollments_total: number;
    enrollments_active: number;
    revenue_month: number;
    revenue_paid_all: number;
    payouts_net_pending: number;
  };
  recent_activity: Array<{
    id: number;
    action: string;
    from_status: string;
    to_status: string;
    course_id: number | null;
    course_title: string;
    actor_email: string;
    created_at: string;
  }>;
  top_instructors: Array<{
    id: number;
    email: string;
    full_name: string;
    enrolled_count: number;
    published_courses: number;
  }>;
}

// ─────────────────────────────────────────────────────────────
// Raccourcis modules
// ─────────────────────────────────────────────────────────────

const SHORTCUTS = [
  { to: '/admin/users', label: 'Utilisateurs', Icon: Users, tone: 'primary' },
  { to: '/admin/instructors', label: 'Formateurs', Icon: GraduationCap, tone: 'emerald' },
  { to: '/admin/organizations', label: 'Organisations', Icon: Building2, tone: 'accent' },
  { to: '/admin/roles', label: 'Rôles', Icon: Shield, tone: 'rose' },
  { to: '/admin/courses', label: 'Cours', Icon: BookOpen, tone: 'sky' },
  { to: '/admin/enrollments', label: 'Inscriptions', Icon: ClipboardList, tone: 'emerald' },
  { to: '/admin/content', label: 'Contenu', Icon: Library, tone: 'primary' },
  { to: '/admin/quiz', label: 'Quiz', Icon: MessageSquareWarning, tone: 'accent' },
  { to: '/admin/payments', label: 'Paiements', Icon: Wallet, tone: 'emerald' },
  { to: '/admin/commissions', label: 'Commissions', Icon: Coins, tone: 'accent' },
  { to: '/admin/payouts', label: 'Reversements', Icon: Wallet, tone: 'violet' },
  { to: '/admin/marketing', label: 'Marketing', Icon: Tag, tone: 'rose' },
  { to: '/admin/moderation', label: 'Modération', Icon: MessageSquareWarning, tone: 'rose' },
  { to: '/admin/support', label: 'Support', Icon: LifeBuoy, tone: 'sky' },
  { to: '/admin/reports', label: 'Rapports', Icon: BarChart3, tone: 'primary' },
  { to: '/admin/audit', label: 'Journal', Icon: ScrollText, tone: 'neutral' },
  { to: '/admin/settings', label: 'Paramètres', Icon: Settings, tone: 'neutral' },
] as const;

const TONE_CLASSES: Record<string, string> = {
  primary: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300',
  accent: 'bg-accent-100 text-accent-700 dark:bg-accent-900/30 dark:text-accent-300',
  emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  violet: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  rose: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  sky: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  neutral: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200',
};

// ─────────────────────────────────────────────────────────────
// Alertes actionnables
// ─────────────────────────────────────────────────────────────

interface AlertDef {
  key: keyof Overview['alerts'];
  label: string;
  to: string;
  tone: 'rose' | 'accent' | 'primary';
  threshold: number;
}

const ALERTS: AlertDef[] = [
  { key: 'payouts_pending', label: 'reversement(s) à valider', to: '/admin/payouts?status=PENDING', tone: 'accent', threshold: 1 },
  { key: 'payouts_validated', label: 'reversement(s) à payer', to: '/admin/payouts?status=VALIDATED', tone: 'primary', threshold: 1 },
  { key: 'orders_pending', label: 'commande(s) en attente', to: '/admin/payments?status=PENDING', tone: 'accent', threshold: 1 },
  { key: 'orders_failed', label: 'commande(s) échouée(s)', to: '/admin/payments?status=FAILED', tone: 'rose', threshold: 1 },
  { key: 'reviews_hidden', label: 'avis masqué(s)', to: '/admin/moderation?is_public=false', tone: 'primary', threshold: 1 },
  { key: 'courses_draft', label: 'cours en brouillon', to: '/admin/courses', tone: 'primary', threshold: 5 },
];

// ─────────────────────────────────────────────────────────────
// Helpers formattage
// ─────────────────────────────────────────────────────────────

function formatMoney(v: number): string {
  return `${v.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} XOF`;
}

function actionToStatus(a: string): StatusKind {
  switch (a) {
    case 'PUBLISHED':
    case 'RESTORED':
      return 'success';
    case 'UNPUBLISHED':
    case 'ARCHIVED':
      return 'warning';
    case 'DELETED':
      return 'failed';
    case 'SUBMITTED':
      return 'pending';
    default:
      return 'info';
  }
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.round((now - then) / 1000);
  if (diff < 60) return `il y a ${diff}s`;
  if (diff < 3600) return `il y a ${Math.round(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.round(diff / 3600)}h`;
  return `il y a ${Math.round(diff / 86400)} j`;
}

// ─────────────────────────────────────────────────────────────
// Composant
// ─────────────────────────────────────────────────────────────

export function AdminOverviewSection() {
  const { data, isLoading } = useQuery<Overview>({
    queryKey: ['admin-overview'],
    queryFn: async () => (await api.get<Overview>('/admin/overview/')).data,
    staleTime: 60_000,
    // On veut que la section reste discrète en cas d'échec — pas de crash.
  });

  if (!data && !isLoading) return null;

  const alerts = data?.alerts;
  const kpis = data?.kpis;
  const activity = data?.recent_activity ?? [];
  const top = data?.top_instructors ?? [];

  // Filtre les alertes non-vides ordonnées par gravité
  const activeAlerts = alerts
    ? ALERTS.filter((a) => (alerts[a.key] ?? 0) >= a.threshold).map((a) => ({
        ...a,
        count: alerts[a.key] ?? 0,
      }))
    : [];

  return (
    <div className="space-y-5 mb-6">
      {/* Alertes actionnables */}
      {activeAlerts.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <h2 className="font-extrabold text-neutral-900 dark:text-white">
                Actions requises
              </h2>
              <span className="ml-auto text-xs text-neutral-500">
                {activeAlerts.length} alerte
                {activeAlerts.length > 1 ? 's' : ''}
              </span>
            </div>
          </CardHeader>
          <CardBody>
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {activeAlerts.map((a) => (
                <li key={a.key}>
                  <Link
                    to={a.to}
                    className={
                      'flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border transition ' +
                      (a.tone === 'rose'
                        ? 'border-rose-200 bg-rose-50/60 hover:bg-rose-100 dark:bg-rose-900/20 dark:border-rose-800'
                        : a.tone === 'accent'
                          ? 'border-amber-200 bg-amber-50/60 hover:bg-amber-100 dark:bg-amber-900/20 dark:border-amber-800'
                          : 'border-primary-200 bg-primary-50/60 hover:bg-primary-100 dark:bg-primary-900/20 dark:border-primary-800')
                    }
                  >
                    <div>
                      <p className="text-lg font-extrabold text-neutral-900 dark:text-white">
                        {a.count}
                      </p>
                      <p className="text-xs text-neutral-600 dark:text-neutral-300">
                        {a.label}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-neutral-400" />
                  </Link>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {/* KPI snapshot rapides */}
      {kpis && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <SnapshotCard
            Icon={Users}
            label="Utilisateurs"
            value={kpis.users_total.toLocaleString('fr-FR')}
            hint={`+${kpis.users_new_7d} sur 7j`}
            tone="primary"
          />
          <SnapshotCard
            Icon={BookOpen}
            label="Cours publiés"
            value={kpis.courses_published.toLocaleString('fr-FR')}
            hint={`${kpis.courses_total} total`}
            tone="sky"
          />
          <SnapshotCard
            Icon={ClipboardList}
            label="Inscriptions"
            value={kpis.enrollments_total.toLocaleString('fr-FR')}
            hint={`${kpis.enrollments_active} actives`}
            tone="emerald"
          />
          <SnapshotCard
            Icon={ShoppingBag}
            label="Revenus mois"
            value={formatMoney(kpis.revenue_month)}
            hint={`Total : ${formatMoney(kpis.revenue_paid_all)}`}
            tone="accent"
          />
          <SnapshotCard
            Icon={Coins}
            label="Payouts en attente"
            value={formatMoney(kpis.payouts_net_pending)}
            hint="À valider / payer"
            tone="violet"
          />
        </div>
      )}

      {/* Grille de raccourcis vers les modules */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary-600" />
            <h2 className="font-extrabold text-neutral-900 dark:text-white">
              Modules d'administration
            </h2>
          </div>
        </CardHeader>
        <CardBody>
          <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
            {SHORTCUTS.map((s) => (
              <li key={s.to}>
                <Link
                  to={s.to}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl border border-neutral-100 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:shadow-soft hover:border-neutral-200 transition text-center"
                >
                  <span
                    className={`w-10 h-10 rounded-xl flex items-center justify-center ${TONE_CLASSES[s.tone]}`}
                  >
                    <s.Icon className="w-5 h-5" />
                  </span>
                  <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-200 truncate max-w-full">
                    {s.label}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      {/* Activité récente + Top formateurs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Activité récente */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary-600" />
                <h2 className="font-extrabold text-neutral-900 dark:text-white">
                  Activité récente (cours)
                </h2>
                <Link
                  to="/admin/audit"
                  className="ml-auto text-xs font-semibold text-primary-700 hover:text-primary-800"
                >
                  Voir tout →
                </Link>
              </div>
            </CardHeader>
            <CardBody>
              {activity.length === 0 ? (
                <p className="text-sm text-neutral-500 text-center py-4">
                  Aucune activité récente.
                </p>
              ) : (
                <ul className="divide-y divide-neutral-100 dark:divide-neutral-700">
                  {activity.map((e) => (
                    <li key={e.id} className="py-2 flex items-start gap-3">
                      <StatusBadge status={actionToStatus(e.action)} size="sm">
                        {e.action}
                      </StatusBadge>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-neutral-900 dark:text-white truncate">
                          {e.course_title || `Cours #${e.course_id ?? '—'}`}
                        </p>
                        <p className="text-[11px] text-neutral-500 truncate">
                          {e.from_status && e.to_status ? (
                            <span className="font-mono">
                              {e.from_status} → {e.to_status}
                            </span>
                          ) : null}
                          {e.actor_email && ` · par ${e.actor_email}`}
                        </p>
                      </div>
                      <span className="text-[11px] text-neutral-400 shrink-0 inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {timeAgo(e.created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Top formateurs */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-accent-600" />
              <h2 className="font-extrabold text-neutral-900 dark:text-white">
                Top formateurs
              </h2>
              <Link
                to="/admin/instructors"
                className="ml-auto text-xs font-semibold text-primary-700 hover:text-primary-800"
              >
                Voir tout →
              </Link>
            </div>
          </CardHeader>
          <CardBody>
            {top.length === 0 ? (
              <p className="text-sm text-neutral-500 text-center py-4">
                Aucun formateur.
              </p>
            ) : (
              <ul className="space-y-2">
                {top.map((t, idx) => (
                  <li
                    key={t.id}
                    className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700/40"
                  >
                    <span className="w-6 text-center font-bold text-neutral-400 text-xs">
                      #{idx + 1}
                    </span>
                    <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-xs shrink-0">
                      {(t.full_name || t.email).charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <Link
                        to={`/admin/users/${t.id}`}
                        className="text-sm font-bold text-neutral-900 dark:text-white truncate block hover:text-primary-600"
                      >
                        {t.full_name || t.email.split('@')[0]}
                      </Link>
                      <p className="text-[11px] text-neutral-500">
                        {t.published_courses} cours · {t.enrolled_count} inscrits
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SnapshotCard — variante compacte de StatCard pour cette section
// ─────────────────────────────────────────────────────────────

interface SnapshotCardProps {
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  tone: 'primary' | 'accent' | 'emerald' | 'violet' | 'rose' | 'sky';
}
function SnapshotCard({ Icon, label, value, hint, tone }: SnapshotCardProps) {
  return (
    <div className="bg-white dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700 rounded-2xl p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            {label}
          </p>
          <p className="mt-1 text-xl font-extrabold text-neutral-900 dark:text-white truncate">
            {value}
          </p>
          {hint && (
            <p className="text-[11px] text-neutral-500 mt-0.5 truncate">
              {hint}
            </p>
          )}
        </div>
        <span
          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${TONE_CLASSES[tone]}`}
        >
          <Icon className="w-4 h-4" />
        </span>
      </div>
    </div>
  );
}
