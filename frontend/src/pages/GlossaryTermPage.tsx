/**
 * GlossaryTermPage.tsx — /lexique/:slug — page détail d'un terme.
 */
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Heart,
  BookOpen,
  ExternalLink,
  Users,
  Flag,
} from 'lucide-react';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { Spinner } from '@/components/ui/Spinner';
import {
  useGlossaryTerm,
  useToggleGlossaryFavorite,
} from '@/hooks/glossary';
import { useIsAuthenticated } from '@/stores/auth';
import { sanitizeRichHtml } from '@/lib/sanitize';

const LEVEL_LABEL: Record<string, string> = {
  beginner: 'Débutant',
  intermediate: 'Intermédiaire',
  advanced: 'Avancé',
};

const RELATION_LABEL: Record<string, string> = {
  related: 'Terme connexe',
  synonym: 'Synonyme',
  antonym: 'Antonyme',
  broader: 'Plus général',
  narrower: 'Plus spécifique',
};

const VARIANT_LABEL: Record<string, string> = {
  synonym: 'Synonyme',
  acronym: 'Acronyme',
  plural: 'Pluriel',
  abbreviation: 'Abréviation',
  alternative_spelling: 'Orthographe alternative',
};

export default function GlossaryTermPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { data: term, isLoading, error } = useGlossaryTerm(slug);
  const isAuthed = useIsAuthenticated();
  const toggleFavorite = useToggleGlossaryFavorite();

  if (isLoading && !term) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
        <PublicHeader />
        <div className="py-20 flex justify-center">
          <Spinner size="xl" label="Chargement du terme…" />
        </div>
      </div>
    );
  }

  if (error || !term) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
        <PublicHeader />
        <div className="container mx-auto max-w-3xl py-20 px-4 text-center">
          <BookOpen className="w-14 h-14 mx-auto text-neutral-400 mb-4" />
          <h1 className="text-2xl font-extrabold text-neutral-900 dark:text-white mb-2">
            Terme introuvable
          </h1>
          <p className="text-neutral-500 mb-6">
            Ce terme n'existe pas ou n'a pas encore été validé.
          </p>
          <Link
            to="/lexique"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-bold"
          >
            <ArrowLeft className="w-4 h-4" /> Retour au lexique
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <PublicHeader />

      {/* Hero */}
      <section className="bg-gradient-to-br from-primary-800 to-primary-600 text-white">
        <div className="container mx-auto px-4 max-w-4xl py-8 sm:py-12">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 text-primary-100 hover:text-white text-sm mb-4"
          >
            <ArrowLeft className="w-4 h-4" /> Retour
          </button>

          <div className="flex flex-wrap gap-2 text-[11px] mb-3">
            {term.category?.name && (
              <span className="px-2.5 py-1 rounded-full bg-white/15 uppercase tracking-wide font-bold">
                {term.category.name}
              </span>
            )}
            <span className="px-2.5 py-1 rounded-full bg-white/15 font-bold">
              {LEVEL_LABEL[term.level] || term.level}
            </span>
            {term.domain && (
              <span className="px-2.5 py-1 rounded-full bg-white/15 font-bold">
                {term.domain}
              </span>
            )}
          </div>

          <h1 className="text-4xl sm:text-5xl font-extrabold">{term.word}</h1>
          {term.pronunciation && (
            <p className="mt-2 text-primary-100 italic">
              /{term.pronunciation}/
            </p>
          )}
          <p className="mt-4 text-lg text-primary-50 max-w-3xl">
            {term.short_definition}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {isAuthed && (
              <button
                type="button"
                disabled={toggleFavorite.isPending}
                onClick={() =>
                  toggleFavorite.mutate({
                    slug: term.slug,
                    isFavorite: term.is_favorite,
                  })
                }
                className={
                  'inline-flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition ' +
                  (term.is_favorite
                    ? 'bg-rose-500 hover:bg-rose-600 text-white'
                    : 'bg-white/20 hover:bg-white/30 text-white')
                }
              >
                <Heart
                  className={
                    'w-4 h-4 ' + (term.is_favorite ? 'fill-current' : '')
                  }
                />
                {term.is_favorite
                  ? 'Retiré des favoris'
                  : 'Ajouter aux favoris'}
              </button>
            )}
            {term.external_source && (
              <a
                href={term.external_source}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-white font-bold text-sm"
              >
                <ExternalLink className="w-4 h-4" /> Source externe
              </a>
            )}
            <span className="text-xs text-primary-100 flex items-center gap-1">
              <Users className="w-3.5 h-3.5" /> {term.view_count} vue
              {term.view_count > 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </section>

      <main className="container mx-auto max-w-4xl px-4 py-8 sm:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-6 lg:gap-8">
          {/* Contenu principal */}
          <article className="min-w-0 space-y-8">
            {term.long_definition && (
              <section>
                <h2 className="text-lg font-extrabold text-neutral-900 dark:text-white mb-3">
                  Définition complète
                </h2>
                <div
                  className="prose prose-sm sm:prose max-w-none dark:prose-invert"
                  dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(term.long_definition) }}
                />
              </section>
            )}

            {term.examples.length > 0 && (
              <section>
                <h2 className="text-lg font-extrabold text-neutral-900 dark:text-white mb-3">
                  Exemples
                </h2>
                <ul className="space-y-3">
                  {term.examples.map((ex) => (
                    <li
                      key={ex.id}
                      className="p-4 bg-primary-50 dark:bg-primary-900/20 rounded-xl border-l-4 border-primary-400"
                    >
                      <p className="text-neutral-700 dark:text-neutral-200">
                        {ex.example}
                      </p>
                      {ex.source && (
                        <p className="mt-1 text-xs text-neutral-500">
                          — {ex.source}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {term.variants.length > 0 && (
              <section>
                <h2 className="text-lg font-extrabold text-neutral-900 dark:text-white mb-3">
                  Variantes & synonymes
                </h2>
                <div className="flex flex-wrap gap-2">
                  {term.variants.map((v) => (
                    <div
                      key={v.id}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-sm"
                    >
                      <span className="font-semibold text-neutral-900 dark:text-white">
                        {v.variant}
                      </span>
                      <span className="text-[10px] uppercase tracking-wide text-neutral-500">
                        {VARIANT_LABEL[v.variant_type] || v.variant_type}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {term.related_terms.length > 0 && (
              <section>
                <h2 className="text-lg font-extrabold text-neutral-900 dark:text-white mb-3">
                  Termes connexes
                </h2>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {term.related_terms.map((r) => (
                    <li key={r.id}>
                      <Link
                        to={`/lexique/${r.slug}`}
                        className="block p-3 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 hover:border-primary-400 transition"
                      >
                        <p className="font-bold text-neutral-900 dark:text-white">
                          {r.word}
                        </p>
                        <p className="text-[11px] uppercase tracking-wide text-primary-600 dark:text-primary-400">
                          {RELATION_LABEL[r.relation_type] || r.relation_type}
                        </p>
                        <p className="text-xs text-neutral-500 line-clamp-2 mt-1">
                          {r.short_definition}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </article>

          {/* Side rail */}
          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            {term.associated_courses.length > 0 && (
              <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-4">
                <p className="text-sm font-extrabold text-neutral-900 dark:text-white mb-2 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-primary-600" />
                  Formations associées
                </p>
                <ul className="space-y-2">
                  {term.associated_courses.map((c) => (
                    <li key={c.id}>
                      <Link
                        to={`/courses/${c.slug}`}
                        className="text-sm text-neutral-700 dark:text-neutral-300 hover:text-primary-600 hover:underline"
                      >
                        {c.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {isAuthed && (
              <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-4">
                <p className="text-sm font-extrabold text-neutral-900 dark:text-white mb-2 flex items-center gap-2">
                  <Flag className="w-4 h-4 text-amber-500" />
                  Une erreur ?
                </p>
                <p className="text-xs text-neutral-500 mb-3">
                  Signalez une inexactitude ou proposez une amélioration.
                </p>
                <Link
                  to={`/lexique?suggestion=${term.slug}`}
                  className="inline-block text-xs font-bold text-primary-600 hover:underline"
                >
                  Signaler / proposer →
                </Link>
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
