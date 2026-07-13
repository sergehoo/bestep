/**
 * LearnerShell.tsx — Layout global de l'espace apprenant (R12.1).
 *
 * Structure :
 *  - Sidebar sticky à gauche (desktop) / drawer overlay (mobile)
 *  - Top bar avec avatar + notifications
 *  - Slot main pour la page
 *
 * Toutes les routes /learn/* utilisent ce shell.
 */
import { ReactNode, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard,
  BookOpen,
  Award,
  Trophy,
  Target,
  Heart,
  Bell,
  User,
  History,
  LogOut,
  Menu,
  X,
  Search,
  MessageSquare,
} from 'lucide-react';
import { useAuthStore, useAuthUser } from '@/stores/auth';
import { cn } from '@/lib/utils';

interface LearnerShellProps {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}

interface NavItem {
  to: string;
  label: string;
  Icon: typeof LayoutDashboard;
  badge?: string;
}

const NAV_MAIN: NavItem[] = [
  { to: '/learn', label: 'Tableau de bord', Icon: LayoutDashboard },
  { to: '/learn/courses', label: 'Mes formations', Icon: BookOpen },
  { to: '/learn/certificates', label: 'Certificats', Icon: Award },
  { to: '/learn/badges', label: 'Badges', Icon: Trophy },
  { to: '/learn/goals', label: 'Objectifs', Icon: Target },
];

const NAV_PERSONAL: NavItem[] = [
  { to: '/learn/favorites', label: 'Favoris', Icon: Heart },
  { to: '/learn/history', label: 'Historique', Icon: History },
  { to: '/learn/notifications', label: 'Notifications', Icon: Bell },
  { to: '/learn/messages', label: 'Messages', Icon: MessageSquare },
  { to: '/learn/profile', label: 'Profil', Icon: User },
];

export function LearnerShell({
  title,
  subtitle,
  actions,
  children,
}: LearnerShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const user = useAuthUser();
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      {/* Sidebar desktop */}
      <aside
        className="hidden lg:flex fixed inset-y-0 left-0 w-64 bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800 flex-col z-30"
        aria-label="Navigation principale"
      >
        <SidebarContent user={user} onLogout={handleLogout} />
      </aside>

      {/* Drawer mobile */}
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
              aria-label="Menu apprenant"
            >
              <div className="p-3 flex items-center justify-end lg:hidden">
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

      {/* Main */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-20 bg-white/90 dark:bg-neutral-900/90 backdrop-blur border-b border-neutral-200 dark:border-neutral-800">
          <div className="px-4 sm:px-6 py-3 flex items-center gap-3">
            <button
              type="button"
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
            <Link
              to="/catalogue"
              className="ml-auto inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-neutral-200 text-sm text-neutral-600 hover:bg-neutral-50"
            >
              <Search className="w-4 h-4" />
              <span className="hidden sm:inline">Découvrir</span>
            </Link>
            <NavLink
              to="/learn/notifications"
              className="relative p-2 rounded-lg hover:bg-neutral-100"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5 text-neutral-600" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500" />
            </NavLink>
          </div>
        </header>

        {/* Page header */}
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
                  <p className="text-sm text-neutral-500 mt-0.5">{subtitle}</p>
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
          className="inline-flex items-center gap-2 text-xl font-extrabold"
          onClick={onNavigate}
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
      </div>

      {/* User summary */}
      {user && (
        <Link
          to="/learn/profile"
          onClick={onNavigate}
          className="mx-4 mt-4 flex items-center gap-3 p-3 rounded-2xl bg-primary-50/60 hover:bg-primary-50 transition"
        >
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
            <p className="text-[11px] text-neutral-500 truncate">
              {user.email}
            </p>
          </div>
        </Link>
      )}

      <nav className="flex-1 overflow-y-auto p-4 space-y-6">
        <div>
          <p className="px-3 mb-1.5 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
            Apprentissage
          </p>
          <ul className="space-y-0.5">
            {NAV_MAIN.map((it) => (
              <li key={it.to}>
                <NavLink
                  to={it.to}
                  end={it.to === '/learn'}
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
                  {it.badge && (
                    <span className="text-[10px] font-bold bg-white/20 rounded px-1.5 py-0.5">
                      {it.badge}
                    </span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="px-3 mb-1.5 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
            Personnel
          </p>
          <ul className="space-y-0.5">
            {NAV_PERSONAL.map((it) => (
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
