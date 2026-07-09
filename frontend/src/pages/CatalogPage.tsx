/**
 * CatalogPage.tsx — Catalogue premium (R9.3).
 *
 * Layout :
 *  - Hero premium avec recherche + stats animées
 *  - Sidebar sticky filtres (desktop) / drawer (mobile)
 *  - Grille cards responsives avec skeleton loaders
 *  - Barre de tri sticky sous le hero
 *  - Filtrage combinatoire côté client (rapide, pas de round-trip inutile)
 */
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { SlidersHorizontal, ChevronDown, X } from 'lucide-react';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { CatalogHero } from '@/components/premium/CatalogHero';
import { CoursePremiumCard } from '@/components/premium/CoursePremiumCard';
import { CourseCardSkeleton } from '@/components/premium/CourseCardSkeleton';
import {
  SidebarFilters,
  DEFAULT_SIDEBAR,
  type CatalogSidebarState,
} from '@/components/premium/SidebarFilters';
import { usePublicCourses, usePublicCategories } from '@/hooks/queries';
import { deriveLevel, prefersReducedMotion } from '@/lib/course-meta';
import type { PublicCourseListItem } from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────
// Local — types tri + duration mapping
// ─────────────────────────────────────────────────────────────────────

type SortValue =
  | 'recent'
  | 'popular'
  | 'rating'
  | 'price_asc'
  | 'price_desc'
  | 'duration';

const SORT_OPTIONS: Array<{ value: SortValue; label: string }> = [
  { value: 'popular', label: 'Plus populaires' },
  { value: 'rating', label: 'Mieux notés' },
  { value: 'recent', label: 'Plus récents' },
  { value: 'price_asc', label: 'Prix croissant' },
  { value: 'price_desc', label: 'Prix décroissant' },
  { value: 'duration', label: 'Durée' },
];

// ─────────────────────────────────────────────────────────────────────

export default function CatalogPage() {
  const [query, setQuery] = useState('');
  const [committedQuery, setCommittedQuery] = useState('');
  const [sort, setSort] = useState<SortValue>('recent');
  const [page, setPage] = useState(1);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebar, setSidebar] = useState<CatalogSidebarState>(DEFAULT_SIDEBAR);
  const reducedMotion = prefersReducedMotion();

  // Reset page à chaque changement de tri/filtre principal
  useEffect(() => {
    setPage(1);
  }, [committedQuery, sort, sidebar]);

  const { data, isLoading, isFetching } = usePublicCourses({
    q: committedQuery || undefined,
    sort,
    page,
  });
  const { data: categories = [] } = usePublicCategories();

  // Filtrage client-side supplémentaire (sur ce que le backend renvoie)
  const filtered = useMemo(() => {
    const items = data?.results ?? [];
    return items.filter((c) => {
      // Catégorie
      if (sidebar.categories.length > 0) {
        if (!c.category || !sidebar.categories.includes(c.category.slug)) return false;
      }
      // Niveau
      if (sidebar.levels.length > 0) {
        if (!sidebar.levels.includes(deriveLevel(c.course_type))) return false;
      }
      // Prix
      if (sidebar.price === 'free' && c.pricing_type !== 'FREE') return false;
      if (sidebar.price === 'paid' && c.pricing_type === 'FREE') return false;
      // Note
      const rating = Number(c.rating_avg) || 0;
      if (sidebar.rating === '4+' && rating < 4) return false;
      if (sidebar.rating === '3+' && rating < 3) return false;
      // Certification
      if (sidebar.certifiedOnly && c.course_type !== 'CERTIFIANTE') return false;
      // Durée : le backend ne remonte pas la durée sur la liste actuellement.
      // À décommenter quand le champ sera exposé.
      // if (sidebar.duration !== 'all' && ...) return false;
      return true;
    });
  }, [data, sidebar]);

  const activeFiltersCount =
    sidebar.categories.length +
    sidebar.levels.length +
    (sidebar.price !== 'all' ? 1 : 0) +
    (sidebar.duration !== 'all' ? 1 : 0) +
    (sidebar.rating !== 'all' ? 1 : 0) +
    (sidebar.certifiedOnly ? 1 : 0);

  return (
    <div className="min-h-screen bg-neutral-50">
      <PublicHeader />

      <CatalogHero
        query={query}
        onQueryChange={setQuery}
        onSubmit={(v) => setCommittedQuery(v.trim())}
        stats={{
          courses: Math.max(350, data?.count ?? 0),
          students: 25_000,
          instructors: 120,
          satisfactionPercent: 98,
        }}
      />

      {/* Barre tri + toggle filtres */}
      <div
        id="courses"
        className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-neutral-100 shadow-sm"
      >
        <div className="container mx-auto px-4 max-w-7xl py-3 flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="lg:hidden inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-neutral-200 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filtres
            {activeFiltersCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-[20px] h-5 rounded-full bg-primary-600 text-white text-[10px] px-1">
                {activeFiltersCount}
              </span>
            )}
          </button>
          <div className="text-sm text-neutral-500">
            {isLoading && !data ? (
              'Chargement…'
            ) : (
              <>
                <span className="font-bold text-neutral-900">
                  {filtered.length}
                </span>{' '}
                cours affichés
                {activeFiltersCount > 0 && ' (filtres actifs)'}
              </>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <label htmlFor="sort" className="text-xs text-neutral-500">
              Trier par
            </label>
            <div className="relative">
              <select
                id="sort"
                value={sort}
                onChange={(e) => setSort(e.target.value as SortValue)}
                className="appearance-none pl-3 pr-8 py-2 rounded-xl border border-neutral-200 bg-white text-sm font-semibold text-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      <main className="container mx-auto px-4 max-w-7xl py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          {/* Sidebar desktop */}
          <div className="hidden lg:block">
            <div className="sticky top-24">
              <SidebarFilters
                state={sidebar}
                onChange={setSidebar}
                categories={categories}
                onReset={() => setSidebar(DEFAULT_SIDEBAR)}
              />
            </div>
          </div>

          {/* Grid */}
          <section aria-live="polite" aria-busy={isFetching}>
            {isLoading && !data ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <CourseCardSkeleton key={i} />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState
                onReset={() => {
                  setSidebar(DEFAULT_SIDEBAR);
                  setQuery('');
                  setCommittedQuery('');
                }}
              />
            ) : (
              <>
                <motion.div
                  layout={!reducedMotion}
                  className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5"
                >
                  <AnimatePresence mode="popLayout">
                    {filtered.map((c) => (
                      <motion.div
                        key={c.id}
                        layout={!reducedMotion}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <CoursePremiumCard
                          course={c as PublicCourseListItem}
                          reducedMotion={reducedMotion}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </motion.div>

                {/* Pagination */}
                {(data?.previous || data?.next) && (
                  <nav className="flex items-center justify-center gap-2 mt-10">
                    <button
                      type="button"
                      disabled={!data?.previous}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="px-4 py-2 rounded-xl border border-neutral-200 text-sm font-semibold disabled:opacity-40 hover:bg-neutral-50"
                    >
                      ← Précédent
                    </button>
                    <span className="px-3 text-sm text-neutral-500">
                      Page {page}
                    </span>
                    <button
                      type="button"
                      disabled={!data?.next}
                      onClick={() => setPage((p) => p + 1)}
                      className="px-4 py-2 rounded-xl border border-neutral-200 text-sm font-semibold disabled:opacity-40 hover:bg-neutral-50"
                    >
                      Suivant →
                    </button>
                  </nav>
                )}
              </>
            )}
          </section>
        </div>
      </main>

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
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.25 }}
              className="absolute inset-y-0 left-0 w-[85%] max-w-sm bg-neutral-50 overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Filtres du catalogue"
            >
              <SidebarFilters
                state={sidebar}
                onChange={setSidebar}
                categories={categories}
                onReset={() => setSidebar(DEFAULT_SIDEBAR)}
                onClose={() => setDrawerOpen(false)}
                className="m-3"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────

function EmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div className="bg-white rounded-2xl p-12 text-center border border-neutral-100">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-accent-100 text-accent-600 mb-4">
        <X className="w-8 h-8" />
      </div>
      <h3 className="text-lg font-bold text-neutral-900">Aucun cours trouvé</h3>
      <p className="text-sm text-neutral-500 mt-2">
        Vos filtres actuels ne renvoient aucun résultat.
      </p>
      <button
        onClick={onReset}
        className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-bold hover:bg-primary-700 transition"
      >
        Réinitialiser les filtres
      </button>
    </div>
  );
}
