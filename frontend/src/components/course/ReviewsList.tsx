/**
 * ReviewsList.tsx — Liste des avis d'un cours + tri.
 */
import { useState } from 'react';
import { Star, MessageSquare } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { useCourseReviews } from '@/hooks/queries';
import type { ReviewsOrdering } from '@/lib/types';

interface ReviewsListProps {
  slug: string;
}

const ORDER_OPTIONS: Array<{ value: ReviewsOrdering; label: string }> = [
  { value: 'recent', label: 'Plus récents' },
  { value: 'rating_high', label: 'Meilleure note' },
  { value: 'rating_low', label: 'Note la plus basse' },
];

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function ReviewsList({ slug }: ReviewsListProps) {
  const [ordering, setOrdering] = useState<ReviewsOrdering>('recent');
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching } = useCourseReviews(slug, { ordering, page });

  if (isLoading) {
    return (
      <div className="py-10 flex justify-center">
        <Spinner label="Chargement des avis…" />
      </div>
    );
  }

  const reviews = data?.results ?? [];
  const totalPages = data ? Math.ceil(data.count / 10) : 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-neutral-500">
          {data?.count ?? 0} avis
        </div>
        <select
          value={ordering}
          onChange={(e) => {
            setOrdering(e.target.value as ReviewsOrdering);
            setPage(1);
          }}
          className="text-sm border border-neutral-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          {ORDER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {reviews.length === 0 ? (
        <div className="bg-neutral-50 border border-dashed border-neutral-200 rounded-2xl p-8 text-center">
          <MessageSquare className="w-8 h-8 mx-auto text-neutral-400" />
          <p className="text-neutral-500 mt-2 text-sm">Aucun avis pour le moment.</p>
        </div>
      ) : (
        <ul className="space-y-3" aria-busy={isFetching}>
          {reviews.map((r) => (
            <li key={r.id} className="bg-white border border-neutral-100 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-sm">
                    {r.user_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{r.user_name}</p>
                    <p className="text-xs text-neutral-500">{formatDate(r.created_at)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star
                      key={i}
                      className={
                        i <= r.rating
                          ? 'w-4 h-4 fill-accent-500 text-accent-500'
                          : 'w-4 h-4 text-neutral-300'
                      }
                    />
                  ))}
                </div>
              </div>
              {r.comment && (
                <p className="text-sm text-neutral-700 whitespace-pre-line">{r.comment}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={!data?.previous}
            className="px-3 py-1.5 text-sm rounded-lg border border-neutral-200 disabled:opacity-40 hover:bg-neutral-50"
          >
            Précédent
          </button>
          <span className="text-sm text-neutral-500">
            Page {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={!data?.next}
            className="px-3 py-1.5 text-sm rounded-lg border border-neutral-200 disabled:opacity-40 hover:bg-neutral-50"
          >
            Suivant
          </button>
        </div>
      )}
    </div>
  );
}
