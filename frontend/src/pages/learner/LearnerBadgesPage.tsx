/**
 * LearnerBadgesPage.tsx — Galerie de badges (R12.4).
 * Badges dérivés côté client — voir lib/learner-stats.ts.
 */
import { LearnerShell } from '@/components/learner/LearnerShell';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { ProgressBar } from '@/components/premium/ProgressBar';
import { useStudentDashboard } from '@/hooks/queries';
import { computeBadges } from '@/lib/learner-stats';
import { cn } from '@/lib/utils';

export default function LearnerBadgesPage() {
  const { data, isLoading } = useStudentDashboard('30d');
  const badges = computeBadges(data);
  const earned = badges.filter((b) => b.earned);
  const pending = badges.filter((b) => !b.earned);

  return (
    <LearnerShell
      title="Mes badges"
      subtitle={`${earned.length} / ${badges.length} débloqués`}
    >
      {isLoading && !data ? (
        <div className="py-20 flex justify-center">
          <Spinner size="xl" label="Chargement…" />
        </div>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Débloqués"
              subtitle={`${earned.length} badge${earned.length > 1 ? 's' : ''}`}
            />
            <CardBody>
              {earned.length === 0 ? (
                <p className="text-sm text-neutral-500 text-center py-4">
                  Aucun badge débloqué pour l'instant. Continuez, ils arrivent !
                </p>
              ) : (
                <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {earned.map((b) => (
                    <BadgeItem key={b.id} b={b} />
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {pending.length > 0 && (
            <Card>
              <CardHeader
                title="À débloquer"
                subtitle="Continuez d'apprendre pour les obtenir"
              />
              <CardBody>
                <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {pending.map((b) => (
                    <BadgeItem key={b.id} b={b} />
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </div>
      )}
    </LearnerShell>
  );
}

function BadgeItem({
  b,
}: {
  b: ReturnType<typeof computeBadges>[number];
}) {
  return (
    <li className="text-center">
      <div
        className={cn(
          'w-20 h-20 mx-auto rounded-3xl flex items-center justify-center text-3xl transition',
          b.earned
            ? 'bg-gradient-to-br from-accent-300 to-accent-500 text-primary-900 shadow-lift'
            : 'bg-neutral-100 text-neutral-400 grayscale',
        )}
      >
        {b.icon}
      </div>
      <p className="mt-2 font-bold text-sm text-neutral-900">{b.label}</p>
      <p className="text-[11px] text-neutral-500 mt-0.5 line-clamp-2 min-h-[2rem]">
        {b.description}
      </p>
      {!b.earned && (
        <div className="mt-2">
          <ProgressBar
            value={Math.round(b.progress * 100)}
            size="sm"
            showValue
            color="primary"
          />
        </div>
      )}
    </li>
  );
}
