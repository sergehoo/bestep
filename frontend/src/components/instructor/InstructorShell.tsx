/**
 * InstructorShell.tsx — Layout global de l'espace instructeur (R13.1).
 * Sidebar sticky desktop + drawer mobile Framer Motion. Nav dédiée à la
 * création et à l'exploitation des formations.
 */
import { ReactNode, useEffect, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard,
  BookOpen,
  Users,
  Wallet,
  Star,
  BarChart3,
  Award,
  User,
  Settings,
  Bell,
  Menu,
  X,
  LogOut,
  Plus,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { useAuthStore, useAuthUser } from '@/stores/auth';
import { cn } from '@/lib/utils';

interface Props {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}

const MAIN_NAV = [
  { to: '/instructor', label: 'Cockpit', Icon: LayoutDashboard },
  { to: '/instructor/courses', label: 'Mes cours', Icon: BookOpen },
  { to: '/instructor/students', label: 'Apprenants', Icon: Users },
  { to: '/instructor/revenue', label: 'Revenus', Icon: Wallet },
  { to: '/instructor/reviews', label: 'Avis', Icon: Star },
  { to: '/instructor/reports', label: 'Rapports', Icon: BarChart3 },
  { to: '/instructor/certificate-templates', label: 'Certificats', Icon: Award },
];

const PERSONAL_NAV = [
  { to: '/instructor/profile-public', label: 'Profil public', Icon: User },
  { to: '/instructor/settings', label: 'Paramètres', Icon: Settings },
];

const WELCOME_BANNER_STORAGE_KEY = 'be:instructor-welcome-seen';

export function InstructorShell({ title, subtitle, actions, children }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const user = useAuthUser();
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  // SECURITE-06 — banner de bienvenue affiché une seule fois quand un
  // formateur nouvellement approuvé arrive sur son espace. Persistance
  // par user.id pour ne pas re-flasher au reload.
  const [showWelcome, setShowWelcome] = useState(false);
  useEffect(() => {
    if (!user) return;
    if (user.approval_status !== 'approved') return;
    const key = `${WELCOME_BANNER_STORAGE_KEY}:${user.id}`;
    try {
      if (localStorage.getItem(key) !== '1') {
        setShowWelcome(true);
      }
    } catch {
      /* ignore quota errors */
    }
  }, [user]);
  const dismissWelcome = () => {
    setShowWelcome(false);
    if (!user) return;
    try {
      localStorage.setItem(`${WELCOME_BANNER_STORAGE_KEY}:${user.id}`, '1');
    } catch {
      /* ignore */
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <aside
        className="hidden lg:flex fixed inset-y-0 left-0 w-64 bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800 flex-col z-30"
        aria-label="Navigation instructeur"
      >
        <SidebarContent user={user} onLogout={handleLogout} />
      </aside>

      <AnimatePresence>
        {drawerOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="lg:hidden fixed inset-0 z-40 bg-neutral-900/60 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          >
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.25 }}
              className="absolute inset-y-0 left-0 w-72 max-w-[85%] bg-white flex flex-col"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Menu instructeur"
            >
              <div className="p-3 flex items-center justify-end">
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-neutral-100"
                  aria-label="Fermer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <SidebarContent
                user={user}
                onLogout={handleLogout}
                onNavigate={() => setDrawerOpen(false)}
              />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 bg-white/90 dark:bg-neutral-900/90 backdrop-blur border-b border-neutral-200 dark:border-neutral-800">
          <div className="px-4 sm:px-6 py-3 flex items-center gap-3">
            <button
              onClick={() => setDrawerOpen(true)}
              className="lg:hidden p-1.5 rounded-lg hover:bg-neutral-100"
              aria-label="Ouvrir le menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <Link
              to="/"
              className="lg:hidden inline-flex items-center gap-2 text-lg font-extrabold text-primary-600"
              aria-label="Best Épargne — accueil"
            >
              <img
                src="/logo_img.png"
                alt=""
                className="h-7 w-7 object-contain"
              />
              Best-<span className="text-accent-500">Épargne</span>
            </Link>
            <span className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary-50 text-primary-700 text-[11px] font-bold uppercase tracking-wider">
              <Sparkles className="w-3 h-3" />
              Studio Instructeur
            </span>
            <Link
              to="/instructor/courses/new"
              className="ml-auto inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs sm:text-sm font-bold transition"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Nouveau cours</span>
            </Link>
            <NavLink
              to="/instructor/notifications"
              className="relative p-2 rounded-lg hover:bg-neutral-100"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5 text-neutral-600" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500" />
            </NavLink>
          </div>
        </header>

        {(title || subtitle || actions) && (
          <div className="border-b border-neutral-200 bg-white">
            <div className="container mx-auto px-4 sm:px-6 py-5 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                {title && (
                  <h1 className="text-xl sm:text-2xl font-extrabold text-neutral-900 truncate">
                    {title}
                  </h1>
                )}
                {subtitle && (
                  <p className="text-sm text-neutral-500 mt-0.5">
                    {subtitle}
                  </p>
                )}
              </div>
              {actions && (
                <div className="flex items-center gap-2 shrink-0">
                  {actions}
                </div>
              )}
            </div>
          </div>
        )}

        {showWelcome && (
          <div
            role="status"
            className="border-b border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/40"
          >
            <div className="container mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-700 dark:text-emerald-300 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                  Votre compte formateur est validé.
                </p>
                <p className="text-xs text-emerald-800/80 dark:text-emerald-200/80">
                  Vous pouvez maintenant créer et publier des cours.
                </p>
              </div>
              <button
                type="button"
                onClick={dismissWelcome}
                aria-label="Masquer le message de bienvenue"
                className="p-1 rounded-md hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        <main className="container mx-auto px-4 sm:px-6 py-6">
          {children}
        </main>
      </div>
    </div>
  );
}

function SidebarContent({
  user,
  onLogout,
  onNavigate,
}: {
  user: ReturnType<typeof useAuthUser>;
  onLogout: () => void;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="p-5 border-b border-neutral-100">
        <Link
          to="/"
          onClick={onNavigate}
          className="inline-flex items-center gap-2 text-xl font-extrabold"
          aria-label="Best Épargne — accueil"
        >
          <img
            src="/logo_img.png"
            alt=""
            className="h-9 w-9 object-contain"
          />
          <span className="leading-none">
            <span className="text-primary-600">Best</span>
            <span className="text-neutral-300">-</span>
            <span className="text-accent-500">Épargne</span>
          </span>
        </Link>
        <p className="mt-1 text-[11px] font-bold text-primary-600 uppercase tracking-widest">
          Studio Instructeur
        </p>
      </div>

      {user && (
        <div className="mx-4 mt-4 flex items-center gap-3 p-3 rounded-2xl bg-primary-50/60">
          {user.avatar_url ? (
            <img
              src={user.avatar_url}
              alt=""
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-primary-600 text-white flex items-center justify-center font-bold">
              {(user.full_name || user.email).charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-neutral-900 truncate">
              {user.full_name || user.email.split('@')[0]}
            </p>
            <p className="text-[11px] text-neutral-500">Formateur</p>
          </div>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto p-4 space-y-6">
        <div>
          <p className="px-3 mb-1.5 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
            Studio
          </p>
          <ul className="space-y-0.5">
            {MAIN_NAV.map((it) => (
              <li key={it.to}>
                <NavLink
                  to={it.to}
                  end={it.to === '/instructor'}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition',
                      isActive
                        ? 'bg-primary-600 text-white shadow-sm'
                        : 'text-neutral-700 hover:bg-neutral-100',
                    )
                  }
                >
                  <it.Icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1">{it.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="px-3 mb-1.5 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
            Compte
          </p>
          <ul className="space-y-0.5">
            {PERSONAL_NAV.map((it) => (
              <li key={it.to}>
                <NavLink
                  to={it.to}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition',
                      isActive
                        ? 'bg-primary-600 text-white shadow-sm'
                        : 'text-neutral-700 hover:bg-neutral-100',
                    )
                  }
                >
                  <it.Icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1">{it.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <div className="p-4 border-t border-neutral-100">
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-neutral-600 hover:bg-neutral-100 hover:text-rose-600 transition"
        >
          <LogOut className="w-4 h-4" />
          Déconnexion
        </button>
      </div>
    </>
  );
}
