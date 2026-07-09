/**
 * LearnerNotificationsPage.tsx — Centre de notifications (R12.5).
 *
 * MVP : notifications mockées dérivées du dashboard (inscription récente,
 * cours en cours, cours terminés). Backend R13 exposera un vrai flux.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell,
  CheckCircle2,
  Award,
  BookOpen,
  Sparkles,
  Check,
  Trash2,
} from 'lucide-react';
import { LearnerShell } from '@/components/learner/LearnerShell';
import { Card, CardBody } from '@/components/ui/Card';
import { useStudentDashboard } from '@/hooks/queries';
import { cn } from '@/lib/utils';

type NotifType = 'welcome' | 'enrollment' | 'completed' | 'certificate' | 'promo';

interface Notif {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  href?: string;
  createdAt: string;
  read: boolean;
}

const ICON_BY_TYPE: Record<NotifType, typeof Bell> = {
  welcome: Sparkles,
  enrollment: BookOpen,
  completed: CheckCircle2,
  certificate: Award,
  promo: Bell,
};

const COLOR_BY_TYPE: Record<NotifType, string> = {
  welcome: 'bg-accent-100 text-accent-700',
  enrollment: 'bg-primary-100 text-primary-700',
  completed: 'bg-emerald-100 text-emerald-700',
  certificate: 'bg-violet-100 text-violet-700',
  promo: 'bg-rose-100 text-rose-700',
};

export default function LearnerNotificationsPage() {
  const { data } = useStudentDashboard('30d');
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [deleted, setDeleted] = useState<Set<string>>(new Set());

  // Génère un flux mocké pertinent
  const notifs = useMemo<Notif[]>(() => {
    const list: Notif[] = [
      {
        id: 'n-welcome',
        type: 'welcome',
        title: 'Bienvenue sur BestÉpargne 👋',
        body: "Découvrez nos parcours et démarrez votre premier cours dès aujourd'hui.",
        createdAt: new Date().toISOString(),
        read: false,
      },
    ];

    if (data?.recent_enrollments?.[0]) {
      const en = data.recent_enrollments[0];
      list.push({
        id: `n-enr-${en.id}`,
        type: 'enrollment',
        title: 'Inscription confirmée',
        body: `Vous êtes inscrit·e à « ${en.course.title} ». Bonne progression !`,
        href: `/courses/${en.course.slug}`,
        createdAt: en.enrolled_at,
        read: false,
      });
    }

    if ((data?.kpis?.completed ?? 0) > 0) {
      list.push({
        id: 'n-complete',
        type: 'completed',
        title: 'Bravo, vous avez terminé un cours !',
        body: 'Retrouvez votre certificat dans la section Certificats.',
        href: '/learn/certificates',
        createdAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
        read: false,
      });
    }

    return list.map((n) => ({
      ...n,
      read: readIds.has(n.id),
    })).filter((n) => !deleted.has(n.id));
  }, [data, readIds, deleted]);

  const markAll = () => {
    setReadIds(new Set(notifs.map((n) => n.id)));
  };

  return (
    <LearnerShell
      title="Notifications"
      subtitle={`${notifs.filter((n) => !n.read).length} non lue(s)`}
      actions={
        notifs.some((n) => !n.read) && (
          <button
            onClick={markAll}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-neutral-200 hover:bg-neutral-50"
          >
            <Check className="w-3.5 h-3.5" />
            Tout marquer lu
          </button>
        )
      }
    >
      {notifs.length === 0 ? (
        <Card>
          <CardBody className="text-center py-10">
            <Bell className="w-10 h-10 text-neutral-300 mx-auto" />
            <p className="mt-3 text-lg font-bold text-neutral-900">
              Rien de nouveau
            </p>
            <p className="mt-1 text-sm text-neutral-500">
              Vous recevrez ici les mises à jour de vos cours et de la
              plateforme.
            </p>
          </CardBody>
        </Card>
      ) : (
        <ul className="space-y-2">
          {notifs.map((n) => {
            const Icon = ICON_BY_TYPE[n.type];
            return (
              <li
                key={n.id}
                className={cn(
                  'bg-white border rounded-2xl p-4 flex items-start gap-3 transition',
                  n.read
                    ? 'border-neutral-100'
                    : 'border-primary-200 shadow-soft',
                )}
              >
                <div
                  className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                    COLOR_BY_TYPE[n.type],
                  )}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-neutral-900">
                      {n.title}
                    </p>
                    {!n.read && (
                      <span className="w-2 h-2 rounded-full bg-primary-500" />
                    )}
                  </div>
                  <p className="text-sm text-neutral-600 mt-0.5">{n.body}</p>
                  <p className="text-[11px] text-neutral-400 mt-1">
                    {new Date(n.createdAt).toLocaleString('fr-FR', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                  {n.href && (
                    <Link
                      to={n.href}
                      onClick={() =>
                        setReadIds((s) => new Set(s).add(n.id))
                      }
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700"
                    >
                      Voir →
                    </Link>
                  )}
                </div>
                <button
                  onClick={() =>
                    setDeleted((s) => new Set(s).add(n.id))
                  }
                  aria-label="Supprimer la notification"
                  className="p-1.5 rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-rose-500 shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </LearnerShell>
  );
}
