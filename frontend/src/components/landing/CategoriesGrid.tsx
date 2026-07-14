/**
 * CategoriesGrid.tsx — Grille des catégories façon Skillshare/Coursera (R11.2).
 * Chaque carte : icône colorée, nom, nombre de cours estimé, hover animé.
 */
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  Briefcase,
  Cpu,
  Megaphone,
  Rocket,
  Users,
  FileText,
  Calculator,
  Palette,
  LucideIcon,
} from 'lucide-react';
import { usePublicCategories } from '@/hooks/queries';

interface CategoryStyle {
  Icon: LucideIcon;
  color: string;
  bg: string;
}

// Palette d'icônes/couleurs distribuée cycliquement — un slug custom peut
// mapper directement si besoin dans le futur.
const CATEGORY_STYLES: CategoryStyle[] = [
  { Icon: TrendingUp, color: 'text-primary-700', bg: 'bg-primary-100' },
  { Icon: Briefcase, color: 'text-emerald-700', bg: 'bg-emerald-100' },
  { Icon: Cpu, color: 'text-violet-700', bg: 'bg-violet-100' },
  { Icon: Megaphone, color: 'text-rose-700', bg: 'bg-rose-100' },
  { Icon: Rocket, color: 'text-orange-700', bg: 'bg-orange-100' },
  { Icon: Users, color: 'text-cyan-700', bg: 'bg-cyan-100' },
  { Icon: FileText, color: 'text-amber-700', bg: 'bg-amber-100' },
  { Icon: Calculator, color: 'text-blue-700', bg: 'bg-blue-100' },
  { Icon: Palette, color: 'text-pink-700', bg: 'bg-pink-100' },
];

function styleFor(index: number): CategoryStyle {
  return CATEGORY_STYLES[index % CATEGORY_STYLES.length];
}

export function CategoriesGrid() {
  const { data: categories = [], isLoading } = usePublicCategories();

  return (
    <section
      id="categories"
      className="bg-neutral-50 dark:bg-neutral-900 py-14 sm:py-16"
      aria-labelledby="categories-title"
    >
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="flex items-end justify-between gap-4 mb-6 sm:mb-8 flex-wrap">
          <div>
            <p className="text-xs font-bold text-primary-600 uppercase tracking-wider">
              Explorer par domaine
            </p>
            <h2
              id="categories-title"
              className="mt-1 text-2xl sm:text-3xl font-extrabold text-neutral-900 dark:text-white"
            >
              Choisissez votre catégorie
            </h2>
          </div>
          <Link
            to="/catalogue"
            className="text-sm font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
          >
            Voir toutes les catégories →
          </Link>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="bg-white dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700 rounded-2xl h-28 animate-pulse"
              />
            ))}
          </div>
        ) : categories.length === 0 ? (
          <p className="text-center text-neutral-500 text-sm">
            Les catégories seront disponibles bientôt.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
            {categories.map((c, i) => {
              const s = styleFor(i);
              return (
                <motion.div
                  key={c.id}
                  whileHover={{ y: -4 }}
                  transition={{ duration: 0.2 }}
                >
                  <Link
                    to={`/catalogue?category=${encodeURIComponent(c.slug)}`}
                    className="group block bg-white dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700 rounded-2xl p-4 sm:p-5 shadow-soft hover:shadow-lift hover:border-primary-200 dark:hover:border-primary-500/60 transition h-full"
                  >
                    <div
                      className={`w-11 h-11 rounded-xl ${s.bg} ${s.color} flex items-center justify-center mb-3 group-hover:scale-110 transition`}
                    >
                      <s.Icon className="w-5 h-5" />
                    </div>
                    <p className="text-sm sm:text-base font-bold text-neutral-900 dark:text-white group-hover:text-primary-700 dark:group-hover:text-primary-400 transition line-clamp-2">
                      {c.name}
                    </p>
                    <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                      Explorer les cours →
                    </p>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
