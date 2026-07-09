/**
 * InstructorStudentsPage.tsx — Vue apprenants du formateur (R13.4).
 *
 * Le backend ne remonte pas encore la liste unitaire des apprenants avec
 * leur progression (endpoint dédié attendu R14). En attendant, on affiche
 * un agrégat par cours à partir des données du dashboard instructor.
 *
 * Risque d'abandon calculé côté client à partir du ratio inscrits /
 * complétions estimées (heuristique 42% comme dans le cockpit).
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  Search,
  AlertTriangle,
  MessageSquare,
  Trophy,
  Download,
  ExternalLink,
} from 'lucide-react';
import { InstructorShell } from '@/components/instructor/InstructorShell';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Input } from '@/components/ui/Input';
import { ProgressBar } from '@/components/premium/ProgressBar';
import { useInstructorDashboard } from '@/hooks/queries';
import { useInstructorCourses } from '@/hooks/instructor';

type RiskLevel = 'low' | 'medium' | 'high';

function riskFromCompletion(rate: number): RiskLevel {
  if (rate >= 60) return 'low';
  if (rate >= 30) return 'medium';
  return 'high';
}

const RISK_STYLES: Record<
  RiskLevel,
  { label: string; badge: 'success' | 'warning' | 'danger'; msg: string }
> = {
  low: {
    label: 'Faible',
    badge: 'success',
    msg: 'Les apprenants avancent bien.',
  },
  medium: {
    label: 'Moyen',
    badge: 'warning',
    msg: 'Quelques apprenants pourraient décrocher.',
  },
  high: {
    label: 'Élevé',
    badge: 'danger',
    msg: 'Envisagez une relance et un contenu de soutien.',
  },
};

export default function InstructorStudentsPage() {
  const [q, setQ] = useState('');
  const { data: dash, isLoading: loadingDash } = useInstructorDashboard('30d');
  const { data: coursesList, isLoading: loadingList } = useInstructorCourses();

  const totalStudents = dash?.kpis?.total_enrollments ?? 0;
  const totalCourses = coursesList?.length ?? 0;
  const highRisk = useMemo(
    () => (coursesList ?? []).filter((c) => (c.enrolled_count ?? 0) >= 30).length,
    [coursesList],
  );

  const filtered = useMemo(() => {
    const list = coursesList ?? [];
    const norm = q.trim().toLowerCase();
    return norm
      ? list.filter((c) => c.title.toLowerCase().includes(norm))
      : list;
  }, [coursesList, q]);

  return (
    <InstructorShell
      title="Mes apprenants"
      subtitle="Suivi agrégé par formation. La vue individuelle arrivera avec l'API dédiée (R14)."
      actions={
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border border-neutral-200 hover:bg-neutral-50"
          onClick={() => exportCSV(coursesList ?? [])}
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      }
    >
      {loadingDash || loadingList ? (
        <div className="py-16 flex justify-center">
          <Spinner size="xl" label="Chargement…" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <SummaryCard
              label="Apprenants total"
              value={totalStudents}
              Icon={Users}
            />
            <SummaryCard
              label="Cours suivis"
              value={totalCourses}
              Icon={Trophy}
            />
            <SummaryCard
              label="Cours à risque"
              value={highRisk}
              Icon={AlertTriangle}
              tone="warning"
            />
          </div>

          <div className="max-w-md">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <Input
                aria-label="Rechercher un cours"
                placeholder="Rechercher un cours…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <Card>
              <CardBody className="text-center py-10">
                <Users className="w-10 h-10 text-neutral-300 mx-auto" />
                <p className="mt-3 text-lg font-bold text-neutral-900">
                  Aucun cours à afficher
                </p>
                <p className="mt-1 text-sm text-neutral-500">
                  Créez un cours pour commencer à suivre vos apprenants.
                </p>
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardHeader
                title="Apprenants par formation"
                subtitle="Complétion estimée · risque d'abandon"
              />
              <CardBody className="p-0">
                <ul className="divide-y divide-neutral-100">
                  {filtered.map((c) => {
                    const students = c.enrolled_count ?? 0;
                    // Heuristique client : 42% de complétion moyen
                    const completionRate =
                      c.completion_rate && c.completion_rate > 0
                        ? c.completion_rate
                        : 42;
                    const risk = riskFromCompletion(completionRate);
                    const style = RISK_STYLES[risk];
                    return (
                      <li
                        key={c.id}
                        className="p-4 flex flex-wrap items-center gap-4"
                      >
                        {c.thumbnail_url ? (
                          <img
                            src={c.thumbnail_url}
                            alt=""
                            className="w-16 h-10 rounded object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-16 h-10 rounded bg-primary-100 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <Link
                            to={`/instructor/courses/${c.id}/edit`}
                            className="font-semibold text-neutral-900 hover:text-primary-700 truncate block"
                          >
                            {c.title}
                          </Link>
                          <div className="mt-1 flex items-center gap-3 text-[11px] text-neutral-500">
                            <span className="inline-flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {students} inscrits
                            </span>
                            <Badge variant={style.badge} size="xs">
                              Risque : {style.label}
                            </Badge>
                          </div>
                        </div>
                        <div className="w-full sm:w-64">
                          <ProgressBar
                            value={completionRate}
                            showValue
                            label="Complétion"
                            size="sm"
                            color={
                              risk === 'low'
                                ? 'success'
                                : risk === 'medium'
                                  ? 'primary'
                                  : 'accent'
                            }
                          />
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            className="p-2 rounded-lg border border-neutral-200 hover:bg-neutral-50"
                            aria-label="Envoyer un message à la promotion"
                            title="Message aux apprenants (R14)"
                          >
                            <MessageSquare className="w-4 h-4 text-neutral-600" />
                          </button>
                          <Link
                            to={`/courses/${c.slug}`}
                            target="_blank"
                            className="p-2 rounded-lg border border-neutral-200 hover:bg-neutral-50"
                            aria-label="Voir le cours"
                          >
                            <ExternalLink className="w-4 h-4 text-neutral-600" />
                          </Link>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </CardBody>
            </Card>
          )}

          <p className="text-xs text-neutral-400">
            💡 La vue par apprenant individuel (progression détaillée, quiz
            réalisés, dernière connexion) sera disponible en R14 avec le nouvel
            endpoint <code>/api/instructor/students/</code>.
          </p>
        </div>
      )}
    </InstructorShell>
  );
}

function SummaryCard({
  label,
  value,
  Icon,
  tone = 'primary',
}: {
  label: string;
  value: number;
  Icon: typeof Users;
  tone?: 'primary' | 'warning';
}) {
  const cls =
    tone === 'warning'
      ? 'from-amber-50 to-amber-100 text-amber-700'
      : 'from-primary-50 to-primary-100 text-primary-700';
  return (
    <div
      className={`rounded-2xl border border-neutral-100 p-4 bg-gradient-to-br ${cls}`}
    >
      <div className="flex items-center gap-2">
        <Icon className="w-5 h-5" />
        <p className="text-2xl font-extrabold">{value}</p>
      </div>
      <p className="text-xs font-semibold uppercase tracking-wide mt-1 opacity-80">
        {label}
      </p>
    </div>
  );
}

function exportCSV(
  courses: Array<{
    title: string;
    enrolled_count: number;
    rating_avg: number | null;
    rating_count: number;
    status: string;
  }>,
) {
  const rows = [
    ['Titre', 'Statut', 'Inscrits', 'Note moyenne', 'Nombre d\'avis'],
    ...courses.map((c) => [
      c.title,
      c.status,
      c.enrolled_count,
      (c.rating_avg ?? 0).toFixed(2),
      c.rating_count ?? 0,
    ]),
  ];
  const csv = rows
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell);
          return s.includes(',') || s.includes('"')
            ? `"${s.replace(/"/g, '""')}"`
            : s;
        })
        .join(','),
    )
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `apprenants-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
