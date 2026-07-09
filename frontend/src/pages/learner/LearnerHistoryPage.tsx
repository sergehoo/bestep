/**
 * LearnerHistoryPage.tsx — Timeline d'activité (R12.5).
 *
 * MVP : dérive une timeline depuis recent_enrollments + activity series.
 * Backend R13 : événements typés (LessonViewed, QuizSubmitted, etc.).
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { History, PlayCircle, Award } from 'lucide-react';
import { LearnerShell } from '@/components/learner/LearnerShell';
import { Card, CardBody } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { useStudentDashboard } from '@/hooks/queries';
import { cn } from '@/lib/utils';

interface Event {
  id: string;
  when: string;
  title: string;
  desc: string;
  Icon: typeof History;
  href?: string;
  color: string;
}

export default function LearnerHistoryPage() {
  const { data, isLoading } = useStudentDashboard('30d');

  const events = useMemo<Event[]>(() => {
    if (!data) return [];
    const out: Event[] = [];
    for (const en of data.recent_enrollments ?? []) {
      out.push({
        id: `enroll-${en.id}`,
        when: en.enrolled_at,
        title: en.status === 'COMPLETED' ? 'Cours terminé' : 'Inscription',
        desc: en.course.title,
        Icon: en.status === 'COMPLETED' ? Award : PlayCircle,
        color:
          en.status === 'COMPLETED'
            ? 'bg-emerald-100 text-emerald-700'
            : 'bg-primary-100 text-primary-700',
        href: `/courses/${en.course.slug}`,
      });
    }
    // Tri desc
    out.sort((a, b) => (a.when < b.when ? 1 : -1));
    return out;
  }, [data]);

  return (
    <LearnerShell
      title="Historique"
      subtitle="Vos activités récentes sur la plateforme."
    >
      {isLoading && !data ? (
        <div className="py-20 flex justify-center">
          <Spinner size="xl" label="Chargement…" />
        </div>
      ) : events.length === 0 ? (
        <Card>
          <CardBody className="text-center py-10">
            <History className="w-10 h-10 text-neutral-300 mx-auto" />
            <p className="mt-3 text-lg font-bold text-neutral-900">
              Aucune activité récente
            </p>
            <p className="mt-1 text-sm text-neutral-500">
              Vos actions apparaîtront ici au fil de votre parcours.
            </p>
          </CardBody>
        </Card>
      ) : (
        <ol className="relative border-l border-neutral-200 ml-3 sm:ml-4 space-y-4">
          {events.map((e) => (
            <li key={e.id} className="relative pl-8">
              <span
                className={cn(
                  'absolute -left-3 top-1 w-6 h-6 rounded-full flex items-center justify-center ring-4 ring-white',
                  e.color,
                )}
              >
                <e.Icon className="w-3 h-3" />
              </span>
              <div className="bg-white border border-neutral-100 rounded-2xl p-4 shadow-soft">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="font-semibold text-neutral-900">
                    {e.title}
                  </p>
                  <p className="text-[11px] text-neutral-500 tabular-nums">
                    {new Date(e.when).toLocaleString('fr-FR', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <p className="text-sm text-neutral-600 mt-0.5">{e.desc}</p>
                {e.href && (
                  <Link
                    to={e.href}
                    className="mt-2 inline-block text-xs font-semibold text-primary-600 hover:text-primary-700"
                  >
                    Ouvrir le cours →
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </LearnerShell>
  );
}
