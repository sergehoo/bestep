/**
 * AdminShell.tsx — Layout global de l'espace administration plateforme (R27).
 *
 * Cohérent avec `LearnerShell` (R12) et `InstructorShell` (R13) :
 *   - Sidebar sticky desktop (w-64) avec sections Plateforme + Compte
 *   - Drawer mobile motion (Framer Motion) déclenché par le burger
 *   - Header sticky avec titre + sous-titre + slot actions
 *   - Badge "Admin plateforme" visible dans la sidebar
 *
 * Requiert un utilisateur avec `is_platform_admin`. Le guard est fait
 * au niveau du router (`AdminOnlyRoute`), on n'y touche pas ici.
 */
import { ReactNode, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard,
  Users,
  BookOpen,
  Building2,
  Settings,
  ShieldCheck,
  Menu,
  X,
  LogOut,
  Bell,
  Library,
  Award,
  Wallet,
  Tag,
  MessageSquareWarning,
  LifeBuoy,
  BarChart3,
  ScrollText,
  UserCog,
  ClipboardList,
  Coins,
  Shield,
  LucideIcon,
} from 'lucide-react';

import { useQuery } from '@tanstack/react-query';

import { useAuthStore, useAuthUser } from '@/stores/auth';
import { cn } from '@/lib/utils';
import api from '@/lib/api';

/**
 * Compteur de formateurs en attente de validation (SECURITE-06).
 * Rafraîchi toutes les 60 secondes pour ne pas alourdir le backend.
 */
function usePendingInstructorsCount() {
  const { data } = useQuery({
    queryKey: ['admin-instructors-pending-count'],
    queryFn: async () => {
      const r = await api.get<{ pending_count: number }>(
        '/admin/instructors/pending-count/',
      );
      return r.data.pending_count;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  return typeof data === 'number' ? data : 0;
}

interface Props {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}

interface NavItem {
  to: string;
  label: string;
  Icon: LucideIcon;
  /** Placeholder visuel (backend endpoints à venir R29+). */
  wip?: boolean;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

/**
 * Navigation admin structurée en 6 sections (R28) :
 *   1. Vue d'ensemble  — Cockpit + Journal + Notifications
 *   2. Communauté      — Users + Formateurs + Organisations + Rôles
 *   3. Catalogue       — Cours + Inscriptions + Contenu + Bibliothèque
 *   4. Certifications  — Certificats + Quiz
 *   5. Finance         — Paiements + Commissions + Reversements + Marketing
 *   6. Plateforme      — Modération + Support + Rapports + Paramètres
 *
 * Chaque item marqué `wip: true` renvoie sur AdminPlaceholderPage tant que
 * le backend n'expose pas les endpoints requis (roadmap R29+).
 */
export const ADMIN_NAV_SECTIONS: NavSection[] = [
  {
    label: 'Vue d\'ensemble',
    items: [
      { to: '/dashboard/admin', label: 'Cockpit', Icon: LayoutDashboard },
      { to: '/admin/audit', label: 'Journal système', Icon: ScrollText },
    ],
  },
  {
    label: 'Communauté',
    items: [
      // SECURITE-06 — vue unique : formateurs et apprenants sont le
      // même modèle User, on garde une seule entrée + filtre par rôle.
      { to: '/admin/users', label: 'Utilisateurs', Icon: Users },
      { to: '/admin/organizations', label: 'Organisations', Icon: Building2 },
      { to: '/admin/roles', label: 'Rôles & permissions', Icon: Shield },
    ],
  },
  {
    label: 'Catalogue',
    items: [
      { to: '/admin/courses', label: 'Cours', Icon: BookOpen },
      { to: '/admin/enrollments', label: 'Inscriptions', Icon: ClipboardList },
      { to: '/admin/content', label: 'Contenu pédagogique', Icon: Library },
      { to: '/admin/lexique', label: 'Lexique', Icon: Library },
    ],
  },
  {
    label: 'Certifications',
    items: [
      {
        to: '/instructor/certificate-templates',
        label: 'Modèles certif.',
        Icon: Award,
      },
      { to: '/admin/quiz', label: 'Quiz plateforme', Icon: MessageSquareWarning },
    ],
  },
  {
    label: 'Finance',
    items: [
      { to: '/admin/payments', label: 'Paiements', Icon: Wallet },
      { to: '/admin/quote-requests', label: 'Demandes de devis', Icon: ClipboardList },
      { to: '/admin/commissions', label: 'Commissions', Icon: Coins },
      { to: '/admin/payouts', label: 'Reversements', Icon: Wallet },
      { to: '/admin/marketing', label: 'Marketing', Icon: Tag },
    ],
  },
  {
    label: 'Plateforme',
    items: [
      { to: '/admin/moderation', label: 'Modération', Icon: MessageSquareWarning },
      { to: '/admin/support', label: 'Support', Icon: LifeBuoy },
      { to: '/admin/reports', label: 'Rapports', Icon: BarChart3 },
      // SECURITE-06 : audit unifié des événements sensibles admin
      { to: '/admin/audit/security', label: 'Audit sécurité', Icon: ShieldCheck },
      { to: '/admin/config', label: 'Configuration', Icon: Settings },
      { to: '/admin/settings', label: 'Paramètres avancés', Icon: UserCog },
    ],
  },
];

export function AdminShell({ title, subtitle, actions, children }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const user = useAuthUser();
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900">
      {/* Sidebar desktop */}
      <aside
        className="hidden lg:flex fixed inset-y-0 left-0 w-64 bg-white dark:bg-neutral-800 border-r border-neutral-200 dark:border-neutral-700 flex-col z-30"
        aria-label="Navigation administration"
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
              className="absolute inset-y-0 left-0 w-72 max-w-[85%] bg-white dark:bg-neutral-800 flex flex-col"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Menu administration"
            >
              <div className="p-3 flex items-center justify-end">
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700"
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

      {/* Contenu */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 bg-white/90 dark:bg-neutral-900/90 backdrop-blur border-b border-neutral-200 dark:border-neutral-700">
          <div className="px-4 sm:px-6 py-3 flex items-center gap-3">
            <button
              onClick={() => setDrawerOpen(true)}
              className="lg:hidden p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700"
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
            <span className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 text-[11px] font-bold uppercase tracking-wider">
              <ShieldCheck className="w-3 h-3" />
              Admin plateforme
            </span>
            <NavLink
              to="/dashboard/admin"
              className="ml-auto relative p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5 text-neutral-600 dark:text-neutral-300" />
            </NavLink>
          </div>
        </header>

        {(title || subtitle || actions) && (
          <div className="border-b border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800">
            <div className="container mx-auto px-4 sm:px-6 py-5 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                {title && (
                  <h1 className="text-xl sm:text-2xl font-extrabold text-neutral-900 dark:text-white truncate">
                    {title}
                  </h1>
                )}
                {subtitle && (
                  <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
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

        <main className="container mx-auto px-4 sm:px-6 py-6 space-y-6">
          {children}
        </main>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sidebar
// ─────────────────────────────────────────────────────────────

function SidebarContent({
  user,
  onLogout,
  onNavigate,
}: {
  user: ReturnType<typeof useAuthUser>;
  onLogout: () => void;
  onNavigate?: () => void;
}) {
  const pendingInstructors = usePendingInstructorsCount();
  return (
    <>
      <div className="p-5 border-b border-neutral-100 dark:border-neutral-700">
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
        <p className="mt-1 text-[11px] font-bold text-rose-600 uppercase tracking-widest inline-flex items-center gap-1">
          <ShieldCheck className="w-3 h-3" />
          Admin plateforme
        </p>
      </div>

      {user && (
        <div className="mx-4 mt-4 flex items-center gap-3 p-3 rounded-2xl bg-rose-50/60 dark:bg-rose-900/20">
          {user.avatar_url ? (
            <img
              src={user.avatar_url}
              alt=""
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-rose-600 text-white flex items-center justify-center font-bold">
              {(user.full_name || user.email).charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-neutral-900 dark:text-white truncate">
              {user.full_name || user.email.split('@')[0]}
            </p>
            <p className="text-[11px] text-rose-600 dark:text-rose-400 font-bold">
              Super-admin
            </p>
          </div>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto p-4 space-y-5">
        {ADMIN_NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <p className="px-3 mb-1.5 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((it) => (
                <li key={it.to}>
                  <NavLink
                    to={it.to}
                    end={it.to === '/dashboard/admin'}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold transition group',
                        isActive
                          ? 'bg-primary-600 text-white shadow-sm'
                          : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700',
                      )
                    }
                  >
                    <it.Icon className="w-4 h-4 shrink-0" />
                    <span className="flex-1 truncate">{it.label}</span>
                    {it.to === '/admin/users' && pendingInstructors > 0 && (
                      <span
                        className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-amber-500 text-white group-[.text-white]:bg-white group-[.text-white]:text-amber-700"
                        title={`${pendingInstructors} formateur(s) en attente de validation`}
                      >
                        {pendingInstructors > 99 ? '99+' : pendingInstructors}
                      </span>
                    )}
                    {it.wip && (
                      <span
                        className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 group-[.text-white]:bg-white/25 group-[.text-white]:text-white"
                        title="Backend endpoints en cours de livraison (R29+)"
                      >
                        WIP
                      </span>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div>
          <p className="px-3 mb-1.5 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
            Raccourcis
          </p>
          <ul className="space-y-0.5">
            <li>
              <a
                href="/admin/super/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition"
                onClick={onNavigate}
              >
                <Settings className="w-4 h-4 shrink-0" />
                <span className="flex-1">Django admin</span>
              </a>
            </li>
          </ul>
        </div>
      </nav>

      <div className="p-4 border-t border-neutral-100 dark:border-neutral-700">
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 hover:text-rose-600 dark:hover:text-rose-400 transition"
        >
          <LogOut className="w-4 h-4" />
          Déconnexion
        </button>
      </div>
    </>
  );
}
