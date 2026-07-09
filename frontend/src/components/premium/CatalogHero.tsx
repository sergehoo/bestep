/**
 * CatalogHero.tsx — Hero premium du catalogue (R9.2).
 *
 * Contenu :
 *  - Titre marketing + sous-titre
 *  - Barre de recherche centrale
 *  - 4 stats animées
 *  - 2 CTA
 */
import { FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Search, Sparkles, Route } from 'lucide-react';
import { StatsCounter } from './StatsCounter';

interface CatalogHeroProps {
  query: string;
  onQueryChange: (v: string) => void;
  onSubmit: (v: string) => void;
  stats?: {
    courses: number;
    students: number;
    instructors: number;
    satisfactionPercent: number;
  };
}

const DEFAULT_STATS = {
  courses: 350,
  students: 25000,
  instructors: 120,
  satisfactionPercent: 98,
};

export function CatalogHero({
  query,
  onQueryChange,
  onSubmit,
  stats = DEFAULT_STATS,
}: CatalogHeroProps) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(query);
  };

  return (
    <section
      className="relative overflow-hidden bg-gradient-to-br from-primary-700 via-primary-600 to-primary-500 text-white"
      aria-labelledby="catalog-hero-title"
    >
      {/* Motif décoratif */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-30 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.15) 0%, transparent 40%), radial-gradient(circle at 80% 80%, rgba(234,179,8,0.2) 0%, transparent 40%)',
        }}
      />

      <div className="relative container mx-auto px-4 max-w-6xl py-10 sm:py-16 lg:py-20">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="text-center max-w-3xl mx-auto"
        >
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 text-xs font-semibold uppercase tracking-wide">
            <Sparkles className="w-3.5 h-3.5" />
            Nouvelle plateforme e-learning
          </span>
          <h1
            id="catalog-hero-title"
            className="mt-4 text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold leading-tight break-words"
          >
            Développez vos compétences financières
            <br className="hidden sm:block" />
            <span className="text-accent-300"> avec les meilleurs experts.</span>
          </h1>
          <p className="mt-4 text-sm sm:text-base text-primary-100">
            Formations premium en investissement, épargne et finance —
            certifiées, encadrées, éprouvées.
          </p>

          {/* Recherche */}
          <form
            onSubmit={submit}
            className="mt-6 mx-auto max-w-xl flex items-center bg-white rounded-2xl shadow-lift p-1.5 focus-within:ring-4 focus-within:ring-accent-300/30"
          >
            <Search className="w-5 h-5 text-neutral-400 mx-3 shrink-0" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Bourse, épargne, immobilier, crypto…"
              className="flex-1 bg-transparent text-neutral-900 text-sm placeholder:text-neutral-400 outline-none"
              aria-label="Rechercher un cours"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold transition"
            >
              Explorer
            </button>
          </form>

          {/* CTA secondaire */}
          <div className="mt-3 flex items-center justify-center gap-4 text-xs text-primary-100">
            <a
              href="#courses"
              className="inline-flex items-center gap-1.5 hover:text-white transition"
            >
              <Route className="w-3.5 h-3.5" />
              Voir les parcours
            </a>
          </div>
        </motion.div>

        {/* Stats */}
        <motion.dl
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15, ease: 'easeOut' }}
          className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-4xl mx-auto"
        >
          <Stat label="Formations" value={stats.courses} prefix="+" />
          <Stat label="Étudiants" value={stats.students} prefix="+" />
          <Stat label="Formateurs" value={stats.instructors} prefix="+" />
          <Stat
            label="Satisfaction"
            value={stats.satisfactionPercent}
            suffix=" %"
          />
        </motion.dl>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  prefix,
  suffix,
}: {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <div className="bg-white/10 backdrop-blur rounded-2xl px-4 py-3 text-center">
      <dt className="text-[11px] uppercase tracking-wider text-primary-100">
        {label}
      </dt>
      <dd className="text-2xl sm:text-3xl font-extrabold">
        <StatsCounter value={value} prefix={prefix} suffix={suffix} />
      </dd>
    </div>
  );
}
