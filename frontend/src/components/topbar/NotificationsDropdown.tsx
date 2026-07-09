/**
 * NotificationsDropdown.tsx — Cloche + panneau (R15.2).
 * Notifications dérivées du dashboard student en attendant un endpoint dédié.
 */
import { Link } from 'react-router-dom';
import {
  Bell,
  CheckCircle2,
  Award,
  BookOpen,
  Sparkles,
} from 'lucide-react';
import { Dropdown } from './Dropdown';
import { useStudentDashboard } from '@/hooks/queries';

export function NotificationsDropdown() {
  const { data } = useStudentDashboard('30d');
  const notifs = buildNotifs(data);
  const unread = notifs.filter((n) => !n.read).length;

  return (
    <Dropdown
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className="relative p-2 rounded-lg hover:bg-neutral-100 transition"
          aria-label="Notifications"
        >
          <Bell className="w-5 h-5 text-neutral-600" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      )}
    >
      {({ close }) => (
        <>
          <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between">
            <p className="text-sm font-bold">Notifications</p>
            {unread > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">
                {unread} non lues
              </span>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifs.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-neutral-500">
                <Bell className="w-6 h-6 mx-auto text-neutral-300 mb-2" />
                Rien pour l'instant.
              </div>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {notifs.map((n) => (
                  <li key={n.id}>
                    <Link
                      to={n.href}
                      onClick={close}
                      className="block px-4 py-3 hover:bg-neutral-50 transition"
                    >
                      <div className="flex items-start gap-2.5">
                        <span
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${n.colorClass}`}
                        >
                          <n.Icon className="w-4 h-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold flex items-center gap-1.5 truncate">
                            {n.title}
                            {!n.read && (
                              <span className="w-1.5 h-1.5 rounded-full bg-primary-500 shrink-0" />
                            )}
                          </p>
                          <p className="text-xs text-neutral-500 line-clamp-2">
                            {n.body}
                          </p>
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="border-t border-neutral-100 p-2">
            <Link
              to="/learn/notifications"
              onClick={close}
              className="block w-full text-center px-3 py-2 rounded-lg text-xs font-semibold text-primary-600 hover:bg-primary-50"
            >
              Voir toutes les notifications →
            </Link>
          </div>
        </>
      )}
    </Dropdown>
  );
}

function buildNotifs(
  data: ReturnType<typeof useStudentDashboard>['data'],
): Array<{
  id: string;
  title: string;
  body: string;
  href: string;
  Icon: typeof Bell;
  colorClass: string;
  read: boolean;
}> {
  const list: ReturnType<typeof buildNotifs> = [];
  if (!data) return list;

  if ((data.kpis?.completed ?? 0) > 0) {
    list.push({
      id: 'n-cert',
      title: 'Certificats disponibles',
      body: 'Retrouvez vos certificats obtenus.',
      href: '/learn/certificates',
      Icon: Award,
      colorClass: 'bg-violet-100 text-violet-700',
      read: false,
    });
  }

  const cont = data.continue_enrollment;
  if (cont) {
    list.push({
      id: 'n-cont',
      title: 'Reprendre votre cours',
      body: `${cont.course.title} — ${cont.progress_percent}% terminé`,
      href: `/learn/courses/${cont.course.id}/player`,
      Icon: BookOpen,
      colorClass: 'bg-primary-100 text-primary-700',
      read: false,
    });
  }

  if ((data.recent_enrollments ?? []).length === 0) {
    list.push({
      id: 'n-welcome',
      title: 'Bienvenue 👋',
      body: 'Explorez le catalogue et démarrez votre premier cours.',
      href: '/catalogue',
      Icon: Sparkles,
      colorClass: 'bg-accent-100 text-accent-700',
      read: false,
    });
  }

  (data.recent_enrollments ?? []).slice(0, 2).forEach((e) => {
    if (e.status === 'COMPLETED') {
      list.push({
        id: `n-done-${e.id}`,
        title: 'Cours terminé',
        body: e.course.title,
        href: `/learn/certificates`,
        Icon: CheckCircle2,
        colorClass: 'bg-emerald-100 text-emerald-700',
        read: true,
      });
    }
  });

  return list;
}
