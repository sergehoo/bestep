/**
 * AIRecommendationWidget.tsx — Bloc de recommandations personnalisées (Phase 3).
 *
 * S'insère dans les dashboards apprenant (et instructor/admin pour test).
 * Groupe les recos par catégorie (chips), affiche 3-4 cartes par onglet,
 * avec bouton d'inscription + boutons de feedback (intéressé, pas
 * intéressé, déjà maîtrisé, plus tard).
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Sparkles,
  ThumbsUp,
  ThumbsDown,
  CheckCircle,
  Clock,
  ArrowRight,
  Loader2,
  RefreshCw,
} from 'lucide-react';

import {
  useAIRecommendationFeedback,
  useAIRecommendations,
} from '@/hooks/ai';
import type {
  AIRecoCategory,
  AIRecoFeedback,
  AIRecommendationItem,
} from '@/lib/ai-types';

const CATEGORY_LABELS: Record<AIRecoCategory, string> = {
  for_you: 'Pour vous',
  continue: 'Continuer',
  strengthen: 'Renforcer',
  discover: 'Découvrir',
  popular: 'Populaires',
  certifying: 'Certifiantes',
  short: 'Courtes',
  path: 'Parcours',
};

const CATEGORY_ORDER: AIRecoCategory[] = [
  'for_you',
  'continue',
  'strengthen',
  'discover',
  'popular',
  'certifying',
  'short',
];

interface Props {
  maxCards?: number;
  className?: string;
}

export function AIRecommendationWidget({ maxCards = 4, className }: Props) {
  const { data, isLoading, isFetching, refetch } = useAIRecommendations();
  const [category, setCategory] = useState<AIRecoCategory>('for_you');

  const items = useMemo(() => {
    const list = data?.categories?.[category] ?? [];
    return list.slice(0, maxCards);
  }, [data, category, maxCards]);

  const availableCategories = useMemo(() => {
    if (!data?.categories) return CATEGORY_ORDER;
    return CATEGORY_ORDER.filter(
      (c) => (data.categories[c]?.length ?? 0) > 0,
    );
  }, [data]);

  return (
    <section
      className={
        'rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 sm:p-5 ' +
        (className ?? '')
      }
    >
      <header className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-neutral-900 dark:text-white">
              Recommandé pour vous
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Suggestions IA basées sur votre profil et votre parcours
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`}
          />
          Actualiser
        </button>
      </header>

      {availableCategories.length > 0 && (
        <div className="flex items-center gap-1.5 mb-3 overflow-x-auto pb-1">
          {availableCategories.map((c) => {
            const active = c === category;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={
                  'inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition ' +
                  (active
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200')
                }
              >
                {CATEGORY_LABELS[c]}
                {data?.categories?.[c]?.length ? (
                  <span className="text-[10px] opacity-70">
                    {data.categories[c].length}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      {isLoading ? (
        <div className="py-10 flex justify-center">
          <Loader2 className="w-6 h-6 text-primary-600 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-neutral-500">
          Aucune recommandation pour l'instant. Complétez votre profil
          d'onboarding pour affiner vos suggestions.
        </p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {items.map((item) => (
            <RecoCard key={`${item.course.id}-${item.category}`} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}

function RecoCard({ item }: { item: AIRecommendationItem }) {
  const feedback = useAIRecommendationFeedback();
  const [applied, setApplied] = useState<AIRecoFeedback | null>(null);

  async function submit(action: AIRecoFeedback) {
    setApplied(action);
    try {
      await feedback.mutateAsync({
        course_id: item.course.id,
        feedback: action,
        category: item.category,
      });
    } catch {
      setApplied(null);
    }
  }

  if (applied === 'not_interested' || applied === 'already_known') {
    return (
      <li className="rounded-xl border border-neutral-100 dark:border-neutral-800 p-3 bg-neutral-50 dark:bg-neutral-800/60 text-xs text-neutral-500 flex items-center justify-between">
        <span>
          Retour enregistré — nous vous proposerons autre chose.
        </span>
        <CheckCircle className="w-4 h-4 text-emerald-600" />
      </li>
    );
  }

  return (
    <li className="rounded-xl border border-neutral-100 dark:border-neutral-800 p-3 flex flex-col gap-2 bg-white dark:bg-neutral-900">
      <div className="flex items-start gap-3">
        <div className="w-16 h-12 shrink-0 rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white text-xs font-bold">
          {item.course.title.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wide text-primary-700 dark:text-primary-300">
              {item.match_score}% match
            </span>
            {item.course.course_type === 'CERTIFIANTE' && (
              <span className="text-[10px] px-1.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 font-bold uppercase">
                Certifiant
              </span>
            )}
            {item.course.level && (
              <span className="text-[10px] px-1.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 uppercase">
                {item.course.level}
              </span>
            )}
          </div>
          <Link
            to={`/courses/${item.course.slug}`}
            className="block text-sm font-bold text-neutral-900 dark:text-white truncate hover:text-primary-600 dark:hover:text-primary-400"
          >
            {item.course.title}
          </Link>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400 italic mt-0.5 line-clamp-2">
            {item.reason}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1 pt-1 border-t border-neutral-100 dark:border-neutral-800">
        <Link
          to={`/courses/${item.course.slug}`}
          className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded-md bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold transition"
        >
          Voir <ArrowRight className="w-3 h-3" />
        </Link>
        <button
          type="button"
          onClick={() => submit('interested')}
          disabled={feedback.isPending}
          title="Intéressé"
          className={
            'p-1 rounded transition ' +
            (applied === 'interested'
              ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
              : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800')
          }
        >
          <ThumbsUp className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => submit('not_interested')}
          disabled={feedback.isPending}
          title="Pas intéressé"
          className="p-1 rounded text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
        >
          <ThumbsDown className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => submit('later')}
          disabled={feedback.isPending}
          title="Plus tard"
          className={
            'p-1 rounded transition ' +
            (applied === 'later'
              ? 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300'
              : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800')
          }
        >
          <Clock className="w-3.5 h-3.5" />
        </button>
      </div>
    </li>
  );
}
