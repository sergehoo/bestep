/**
 * LearnerGlossaryPage.tsx — /mon-lexique.
 *
 * Espace personnel apprenant :
 *   - Mes favoris.
 *   - Termes récemment consultés.
 *   - Suggestions issues des formations suivies.
 *
 * Note : la section « à revoir / compris » sera enrichie quand
 * l'endpoint /api/glossary/my/notes/ existera (roadmap admin).
 */
import { Link } from 'react-router-dom';
import { Heart, Sparkles, BookOpen } from 'lucide-react';
import { LearnerShell } from '@/components/learner/LearnerShell';
import { Spinner } from '@/components/ui/Spinner';
import {
  useGlossaryMyFavorites,
  useGlossaryRecent,
} from '@/hooks/glossary';
import type { GlossaryTermListItem } from '@/lib/glossary-types';

function TermRow({ term }: { term: GlossaryTermListItem }) {
  return (
    <Link
      to={`/lexique/${term.slug}`}
      className="flex items-start gap-3 p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-primary-400 transition"
    >
      <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 flex items-center justify-center font-extrabold shrink-0">
        {(term.word || '?')[0]?.toUpperCase()}
      </div>
      <div className="min-w-0">
        <p className="font-bold text-neutral-900 dark:text-white truncate">
          {term.word}
        </p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 line-clamp-2">
          {term.short_definition}
        </p>
      </div>
    </Link>
  );
}

export default function LearnerGlossaryPage() {
  const favorites = useGlossaryMyFavorites();
  const recent = useGlossaryRecent();

  return (
    <LearnerShell title="Mon lexique">
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-primary-600 mb-1">
            <BookOpen className="w-4 h-4" />
            LEXIQUE PERSONNEL
          </div>
          <h1 className="text-2xl font-extrabold text-neutral-900 dark:text-white">
            Mon lexique
          </h1>
          <p className="text-sm text-neutral-500">
            Retrouvez les définitions que vous avez enregistrées et ce
            que vous avez récemment consulté.
          </p>
        </div>

        {/* Favoris */}
        <section className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-3">
            <Heart className="w-5 h-5 text-rose-500" />
            <h2 className="text-base font-extrabold text-neutral-900 dark:text-white">
              Mes favoris
            </h2>
            {favorites.data && (
              <span className="ml-auto text-xs text-neutral-500">
                {favorites.data.length} terme{favorites.data.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
          {favorites.isLoading && (
            <div className="py-8 flex justify-center">
              <Spinner />
            </div>
          )}
          {favorites.data && favorites.data.length === 0 && (
            <div className="py-8 text-center text-sm text-neutral-500">
              Vous n'avez pas encore de favoris.
              <br />
              Cliquez sur le cœur d'un terme pour l'ajouter ici.
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {favorites.data?.map((t) => (
              <TermRow key={t.id} term={t} />
            ))}
          </div>
        </section>

        {/* Récents */}
        <section className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5 text-primary-600" />
            <h2 className="text-base font-extrabold text-neutral-900 dark:text-white">
              Récemment ajoutés au lexique
            </h2>
          </div>
          {recent.isLoading && (
            <div className="py-8 flex justify-center">
              <Spinner />
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {recent.data?.slice(0, 8).map((t) => (
              <TermRow key={t.id} term={t} />
            ))}
          </div>
          <div className="mt-4 text-center">
            <Link
              to="/lexique"
              className="text-sm text-primary-600 hover:underline font-semibold"
            >
              Parcourir tout le lexique →
            </Link>
          </div>
        </section>
      </div>
    </LearnerShell>
  );
}
