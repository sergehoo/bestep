/**
 * GlossaryPage.tsx — Page publique /lexique.
 *
 * Sections :
 *   - Hero (titre + description + barre de recherche)
 *   - Navigation alphabétique A-Z (avec compteur)
 *   - Filtres catégorie + niveau + tri
 *   - Termes récemment ajoutés + populaires (side rail)
 *   - Grille de cards paginée
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  BookOpen,
  Flame,
  Sparkles,
  Heart,
  Filter,
} from 'lucide-react';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { Spinner } from '@/components/ui/Spinner';
import {
  useGlossaryAlphabet,
  useGlossaryCategories,
  useGlossaryPopular,
  useGlossaryRecent,
  useGlossaryTerms,
} from '@/hooks/glossary';
import type { GlossaryTermListItem } from '@/lib/glossary-types';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function TermCard({ term }: { term: GlossaryTermListItem }) {
  const color = term.category_color || 'primary';
  return (
    <Link
      to={`/lexique/${term.slug}`}
      className="group block bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 hover:border-primary-400 hover:shadow-md transition"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-lg font-extrabold text-neutral-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 truncate">
          {term.word}
        </h3>
        {term.is_favorite && (
          <Heart className="w-4 h-4 text-rose-500 fill-current shrink-0 mt-1" />
        )}
      </div>
      <p className="text-sm text-neutral-600 dark:text-neutral-300 line-clamp-3 mb-3">
        {term.short_definition}
      </p>
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        {term.category_name && (
          <span
            className={`px-2 py-0.5 rounded-full bg-${color}-100 text-${color}-700 dark:bg-${color}-900/30 dark:text-${color}-300 font-semibold`}
          >
            {term.category_name}
          </span>
        )}
        {term.domain && (
          <span className="px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
            {term.domain}
          </span>
        )}
        {term.variants_count > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500">
            {term.variants_count} variante{term.variants_count > 1 ? 's' : ''}
          </span>
        )}
      </div>
    </Link>
  );
}

function MiniList({
  title,
  icon,
  items,
}: {
  title: string;
  icon: React.ReactNode;
  items: GlossaryTermListItem[] | undefined;
}) {
  if (!items || items.length === 0) return null;
  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-4">
      <div className="flex items-center gap-2 mb-3 text-sm font-extrabold text-neutral-900 dark:text-white">
        {icon}
        {title}
      </div>
      <ul className="space-y-2">
        {items.slice(0, 8).map((t) => (
          <li key={t.id}>
            <Link
              to={`/lexique/${t.slug}`}
              className="block text-sm text-neutral-700 dark:text-neutral-300 hover:text-primary-600 dark:hover:text-primary-400 truncate"
            >
              {t.word}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function GlossaryPage() {
  const [q, setQ] = useState('');
  const [letter, setLetter] = useState<string>('');
  const [category, setCategory] = useState<string>('');
  const [level, setLevel] = useState<string>('');
  const [ordering, setOrdering] = useState<'alpha' | 'recent' | 'popular'>(
    'alpha',
  );

  const filters = useMemo(
    () => ({
      q: q.trim() || undefined,
      letter: letter || undefined,
      category: category || undefined,
      level: level || undefined,
      ordering,
    }),
    [q, letter, category, level, ordering],
  );

  const { data: list, isLoading } = useGlossaryTerms(filters);
  const { data: alphabet } = useGlossaryAlphabet();
  const { data: categories } = useGlossaryCategories();
  const { data: popular } = useGlossaryPopular();
  const { data: recent } = useGlossaryRecent();

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <PublicHeader />

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary-900 via-primary-700 to-primary-600 text-white">
        <div className="container mx-auto px-4 max-w-6xl py-10 sm:py-14">
          <div className="flex items-center gap-2 text-primary-100 text-xs mb-3">
            <BookOpen className="w-4 h-4" />
            LEXIQUE PÉDAGOGIQUE
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold">
            Le dictionnaire de Best-Épargne
          </h1>
          <p className="mt-3 text-primary-100 max-w-2xl">
            Tous les termes clés de l'épargne, de la finance et de
            l'investissement expliqués simplement.{' '}
            {alphabet?.total ? (
              <span className="font-semibold text-white">
                {alphabet.total} définition{alphabet.total > 1 ? 's' : ''}{' '}
                disponibles.
              </span>
            ) : null}
          </p>

          <div className="mt-6 max-w-2xl">
            <div className="relative">
              <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Rechercher un mot, une expression, un acronyme…"
                className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-white/95 text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-4 focus:ring-primary-300 shadow-lg"
                aria-label="Rechercher dans le lexique"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Navigation alphabet */}
      <section className="border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 sticky top-16 z-30">
        <div className="container mx-auto px-4 max-w-6xl py-3 overflow-x-auto">
          <div className="flex items-center gap-1 min-w-max">
            <button
              type="button"
              onClick={() => setLetter('')}
              className={
                'px-3 py-1.5 text-xs font-bold rounded-lg transition ' +
                (letter === ''
                  ? 'bg-primary-600 text-white'
                  : 'text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800')
              }
            >
              Tous
            </button>
            {LETTERS.map((l) => {
              const count = alphabet?.by_letter?.[l] ?? 0;
              const isActive = letter === l.toLowerCase();
              const disabled = count === 0;
              return (
                <button
                  key={l}
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    setLetter(isActive ? '' : l.toLowerCase())
                  }
                  className={
                    'relative w-9 h-9 text-sm font-bold rounded-lg transition ' +
                    (isActive
                      ? 'bg-primary-600 text-white'
                      : disabled
                        ? 'text-neutral-300 dark:text-neutral-700 cursor-not-allowed'
                        : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800')
                  }
                  title={
                    disabled ? 'Aucun terme' : `${count} terme${count > 1 ? 's' : ''}`
                  }
                >
                  {l}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <main className="container mx-auto px-4 max-w-6xl py-6 sm:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 lg:gap-8">
          {/* Liste principale */}
          <div className="min-w-0">
            {/* Filtres */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <Filter className="w-4 h-4 text-neutral-500" />
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="text-sm px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 dark:text-white"
              >
                <option value="">Toutes catégories</option>
                {categories?.map((c) => (
                  <option key={c.id} value={c.slug}>
                    {c.name} ({c.terms_count})
                  </option>
                ))}
              </select>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="text-sm px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 dark:text-white"
              >
                <option value="">Tous niveaux</option>
                <option value="beginner">Débutant</option>
                <option value="intermediate">Intermédiaire</option>
                <option value="advanced">Avancé</option>
              </select>
              <select
                value={ordering}
                onChange={(e) =>
                  setOrdering(e.target.value as typeof ordering)
                }
                className="text-sm px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 dark:text-white"
              >
                <option value="alpha">Ordre alphabétique</option>
                <option value="recent">Plus récents</option>
                <option value="popular">Plus consultés</option>
              </select>
              {list?.count !== undefined && (
                <span className="ml-auto text-xs text-neutral-500">
                  {list.count} terme{list.count > 1 ? 's' : ''}
                </span>
              )}
            </div>

            {/* Grille */}
            {isLoading && !list && (
              <div className="py-20 flex justify-center">
                <Spinner size="xl" label="Chargement du lexique…" />
              </div>
            )}
            {list && list.results.length === 0 && (
              <div className="text-center py-16 bg-white dark:bg-neutral-900 rounded-xl border border-dashed border-neutral-200 dark:border-neutral-800">
                <BookOpen className="w-10 h-10 mx-auto text-neutral-400 mb-3" />
                <p className="text-neutral-500 dark:text-neutral-400 mb-3">
                  Aucun terme trouvé pour ces critères.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setQ('');
                    setLetter('');
                    setCategory('');
                    setLevel('');
                  }}
                  className="text-primary-600 hover:underline text-sm"
                >
                  Réinitialiser les filtres
                </button>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {list?.results.map((t) => (
                <TermCard key={t.id} term={t} />
              ))}
            </div>
          </div>

          {/* Side rail */}
          <aside className="space-y-4 lg:sticky lg:top-32 lg:self-start">
            <MiniList
              title="Récemment ajoutés"
              icon={<Sparkles className="w-4 h-4 text-primary-600" />}
              items={recent}
            />
            <MiniList
              title="Plus consultés"
              icon={<Flame className="w-4 h-4 text-amber-500" />}
              items={popular}
            />
          </aside>
        </div>
      </main>
    </div>
  );
}
