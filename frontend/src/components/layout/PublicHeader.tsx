/**
 * PublicHeader.tsx — Top bar premium (R15.3).
 *
 * Contenu :
 *  - Logo + burger (mobile) qui ouvre un menu drawer
 *  - Search bar globale (Cmd+K raccourci)
 *  - Nav rapide : Catalogue, Mes formations, Favoris (authed)
 *  - Assistant IA (authed)
 *  - Panier + Notifications + Messages (avec compteurs)
 *  - ThemeToggle + LanguageSwitcher
 *  - UserMenu avatar (authed) ou boutons Connexion / Créer un compte / Devenir instructeur
 *
 * Effets : sticky top-0, glassmorphism (bg-white/80 backdrop-blur-md),
 * shadow qui apparaît au scroll.
 */
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Search,
  Menu,
  X,
  Command,
  Home,
  BookOpen,
  Heart,
  GraduationCap,
} from 'lucide-react';
import { useIsAuthenticated, useAuthUser } from '@/stores/auth';
import { useT } from '@/lib/i18n';
import { GlobalSearchDialog, useGlobalSearch } from '@/components/topbar/GlobalSearch';
import { NotificationsDropdown } from '@/components/topbar/NotificationsDropdown';
import { MessagesDropdown } from '@/components/topbar/MessagesDropdown';
import { UserMenu } from '@/components/topbar/UserMenu';
import { ThemeToggle } from '@/components/topbar/ThemeToggle';
import { LanguageSwitcher } from '@/components/topbar/LanguageSwitcher';
import { CartButton } from '@/components/topbar/CartButton';
import { cn } from '@/lib/utils';

export function PublicHeader() {
  const isAuthed = useIsAuthenticated();
  const user = useAuthUser();
  const t = useT();

  const NAV_LINKS_PUBLIC = [
    { to: '/', label: t('nav.home') },
    { to: '/catalogue', label: t('nav.courses') },
  ];
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { open: searchOpen, setOpen: setSearchOpen } = useGlobalSearch();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Ferme le menu mobile quand on change de route
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const isInstructor = user?.roles?.includes('instructor');

  return (
    <>
      <nav
        className={cn(
          'sticky top-0 z-40 border-b transition-all',
          scrolled
            ? 'bg-white/85 dark:bg-neutral-900/85 backdrop-blur-md border-neutral-200 dark:border-neutral-800 shadow-sm'
            : 'bg-white/70 dark:bg-neutral-900/70 backdrop-blur-md border-neutral-100 dark:border-neutral-800',
        )}
        aria-label="Navigation principale"
      >
        <div className="container mx-auto px-4 max-w-7xl py-3 flex items-center gap-2 sm:gap-4">
          {/* Burger mobile */}
          <button
            type="button"
            className="lg:hidden p-2 rounded-lg hover:bg-neutral-100"
            onClick={() => setMobileOpen(true)}
            aria-label="Ouvrir le menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Logo */}
          <Link
            to="/"
            className="inline-flex items-center gap-2 shrink-0"
            aria-label="Best Épargne — accueil"
          >
            <img
              src="/logo_img.png"
              alt=""
              className="h-8 w-8 sm:h-9 sm:w-9 object-contain"
            />
            <span className="text-lg sm:text-xl font-extrabold leading-none">
              <span className="text-primary-600">Best</span>
              <span className="text-neutral-300">-</span>
              <span className="text-accent-500">Épargne</span>
            </span>
          </Link>

          {/* Nav desktop */}
          <div className="hidden lg:flex items-center gap-1 ml-4">
            {NAV_LINKS_PUBLIC.map((l) => (
              <NavLinkItem key={l.to} to={l.to} label={l.label} />
            ))}
            {isAuthed && (
              <>
                <NavLinkItem to="/learn/courses" label={t('nav.my_courses')} />
                <NavLinkItem to="/learn/favorites" label={t('nav.favorites')} />
                {isInstructor && (
                  <NavLinkItem to="/instructor" label={t('nav.studio')} />
                )}
              </>
            )}
          </div>

          {/* Recherche */}
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="ml-auto lg:ml-4 flex-1 min-w-0 max-w-md hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white/60 dark:bg-neutral-800/60 hover:bg-white dark:hover:bg-neutral-800 text-left text-sm text-neutral-500 dark:text-neutral-400 transition"
            aria-label={t('nav.search_aria')}
          >
            <Search className="w-4 h-4 shrink-0" />
            <span className="flex-1 truncate">
              {t('nav.search_placeholder')}
            </span>
            <span className="hidden md:inline-flex items-center gap-1">
              <Command className="w-3 h-3" />
              <kbd className="px-1 rounded border border-neutral-200 bg-white text-[10px] font-mono">
                K
              </kbd>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="sm:hidden ml-auto p-2 rounded-lg hover:bg-neutral-100"
            aria-label="Rechercher"
          >
            <Search className="w-5 h-5 text-neutral-600" />
          </button>

          {/* Actions droite */}
          <div className="flex items-center gap-0.5 sm:gap-1">
            <LanguageSwitcher />
            <ThemeToggle />
            <CartButton />
            {isAuthed && (
              <>
                <NotificationsDropdown />
                <MessagesDropdown />
                <UserMenu />
              </>
            )}
            {!isAuthed && (
              <div className="hidden sm:flex items-center gap-2 pl-2">
                <Link
                  to="/login"
                  className="px-3 py-1.5 text-sm font-semibold text-neutral-700 dark:text-neutral-200 hover:text-primary-600 dark:hover:text-primary-400"
                >
                  {t('nav.login')}
                </Link>
                <Link
                  to="/register"
                  className="px-3 py-1.5 rounded-xl text-sm font-bold bg-primary-600 text-white hover:bg-primary-700 transition"
                >
                  {t('nav.register')}
                </Link>
              </div>
            )}
          </div>
        </div>
      </nav>

      <GlobalSearchDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
      />

      {/* Drawer mobile */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="lg:hidden fixed inset-0 z-50 bg-neutral-900/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
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
              aria-label="Menu"
            >
              <div className="flex items-center justify-between p-4 border-b border-neutral-100">
                <span className="text-lg font-extrabold">
                  <span className="text-primary-600">Best</span>
                  <span className="text-neutral-300">-</span>
                  <span className="text-accent-500">Épargne</span>
                </span>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-neutral-100"
                  aria-label="Fermer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto p-4 space-y-1">
                <MobileNavLink to="/" label="Accueil" Icon={Home} />
                <MobileNavLink to="/catalogue" label="Catalogue" Icon={BookOpen} />
                {isAuthed ? (
                  <>
                    <MobileNavLink
                      to="/learn/courses"
                      label="Mes formations"
                      Icon={BookOpen}
                    />
                    <MobileNavLink
                      to="/learn/favorites"
                      label="Favoris"
                      Icon={Heart}
                    />
                    {isInstructor && (
                      <MobileNavLink
                        to="/instructor"
                        label="Studio instructeur"
                        Icon={GraduationCap}
                      />
                    )}
                  </>
                ) : (
                  <>
                    <div className="pt-3 border-t border-neutral-100 mt-3">
                      <Link
                        to="/login"
                        className="block px-3 py-2 rounded-xl text-sm font-semibold hover:bg-neutral-100"
                      >
                        Connexion
                      </Link>
                      <Link
                        to="/register"
                        className="mt-1 block px-3 py-2 rounded-xl text-sm font-bold bg-primary-600 text-white hover:bg-primary-700 text-center"
                      >
                        Créer un compte
                      </Link>
                      <Link
                        to="/instructor-onboarding"
                        className="mt-2 block px-3 py-2 rounded-xl text-sm font-semibold border border-neutral-200 hover:bg-neutral-50 text-center"
                      >
                        Devenir instructeur
                      </Link>
                    </div>
                  </>
                )}
              </nav>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom nav mobile (uniquement authed pour libérer l'espace visiteur) */}
      {isAuthed && <MobileBottomNav />}
    </>
  );
}

// ─────────────────────────────────────────────────────────────

function NavLinkItem({ to, label }: { to: string; label: string }) {
  const location = useLocation();
  const active =
    to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);
  return (
    <Link
      to={to}
      className={cn(
        'px-3 py-1.5 text-sm font-semibold rounded-lg transition',
        active
          ? 'text-primary-600 bg-primary-50'
          : 'text-neutral-600 hover:text-primary-600 hover:bg-neutral-50',
      )}
    >
      {label}
    </Link>
  );
}

function MobileNavLink({
  to,
  label,
  Icon,
}: {
  to: string;
  label: string;
  Icon: typeof Home;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-neutral-700 hover:bg-neutral-100"
    >
      <Icon className="w-4 h-4 text-neutral-500" />
      {label}
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────
// MobileBottomNav — barre inférieure mobile (5 items)
// ─────────────────────────────────────────────────────────────

function MobileBottomNav() {
  const location = useLocation();
  const items = [
    { to: '/', label: 'Accueil', Icon: Home },
    { to: '/catalogue', label: 'Cours', Icon: BookOpen },
    { to: '/learn/courses', label: 'Mes cours', Icon: GraduationCap },
    { to: '/learn/favorites', label: 'Favoris', Icon: Heart },
    { to: '/learn/profile', label: 'Profil', Icon: null },
  ];
  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/90 backdrop-blur-md border-t border-neutral-200 pb-[env(safe-area-inset-bottom)]"
      aria-label="Navigation principale mobile"
    >
      <ul className="grid grid-cols-5">
        {items.map((it) => {
          const active =
            it.to === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(it.to);
          return (
            <li key={it.to}>
              <Link
                to={it.to}
                className={cn(
                  'flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold transition',
                  active ? 'text-primary-600' : 'text-neutral-500',
                )}
                aria-current={active ? 'page' : undefined}
              >
                {it.Icon ? (
                  <it.Icon className="w-5 h-5" />
                ) : (
                  <span className="w-5 h-5 rounded-full bg-primary-600 text-white flex items-center justify-center text-[10px] font-bold">
                    P
                  </span>
                )}
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
