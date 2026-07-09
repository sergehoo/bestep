/**
 * InstructorReviewsPage.tsx — Gestion des avis reçus (R13.5).
 *
 * Utilise les avis publics de chaque cours du formateur en filtrant côté
 * client. Un vrai endpoint `/api/instructor/reviews/` agrégé sera livré
 * en R14 (avec support réponse + signalement).
 */
import { useState } from 'react';
import {
  Star,
  MessageCircle,
  Flag,
  Filter,
  Send,
} from 'lucide-react';
import { InstructorShell } from '@/components/instructor/InstructorShell';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { RatingStars } from '@/components/premium/RatingStars';
import { useInstructorCourses } from '@/hooks/instructor';
import { useCourseReviews, useCourseReviewsSummary } from '@/hooks/queries';
import { cn } from '@/lib/utils';

export default function InstructorReviewsPage() {
  const { data: courses, isLoading } = useInstructorCourses();
  const [selectedSlug, setSelectedSlug] = useState<string | undefined>();
  const [filter, setFilter] = useState<'all' | '5' | '4' | 'low'>('all');

  // Sélectionne le premier cours publié par défaut
  const activeSlug = selectedSlug
    ?? courses?.find((c) => c.status === 'PUBLISHED')?.slug;

  const { data: reviews, isLoading: loadingReviews } = useCourseReviews(
    activeSlug,
    { ordering: filter === 'low' ? 'rating_low' : 'recent' },
  );
  const { data: summary } = useCourseReviewsSummary(activeSlug);

  const published =
    courses?.filter((c) => c.status === 'PUBLISHED') ?? [];

  return (
    <InstructorShell
      title="Avis des apprenants"
      subtitle="Consultez les retours reçus sur vos formations."
    >
      {isLoading && !courses ? (
        <div className="py-16 flex justify-center">
          <Spinner size="xl" label="Chargement…" />
        </div>
      ) : published.length === 0 ? (
        <Card>
          <CardBody className="text-center py-10">
            <Star className="w-10 h-10 text-neutral-300 mx-auto" />
            <p className="mt-3 text-lg font-bold text-neutral-900">
              Aucun cours publié
            </p>
            <p className="mt-1 text-sm text-neutral-500">
              Publiez un cours pour commencer à recevoir des avis.
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          {/* Sélecteur cours */}
          <div className="space-y-2 lg:sticky lg:top-24 self-start">
            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest px-1">
              Formations
            </p>
            <ul className="space-y-1">
              {published.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedSlug(c.slug)}
                    className={cn(
                      'w-full text-left px-3 py-2 rounded-xl text-sm transition',
                      c.slug === activeSlug
                        ? 'bg-primary-600 text-white shadow-sm'
                        : 'hover:bg-neutral-100 text-neutral-700',
                    )}
                  >
                    <p className="font-semibold truncate">{c.title}</p>
                    <p
                      className={cn(
                        'text-[11px] mt-0.5',
                        c.slug === activeSlug
                          ? 'text-primary-100'
                          : 'text-neutral-500',
                      )}
                    >
                      {c.rating_count ?? 0} avis · {(c.rating_avg ?? 0).toFixed(1)}
                      ★
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Détail */}
          <div className="space-y-4 min-w-0">
            {summary && summary.count > 0 && (
              <Card>
                <CardBody className="flex flex-wrap items-center gap-6">
                  <div>
                    <p className="text-4xl font-extrabold text-primary-700">
                      {summary.average.toFixed(1)}
                    </p>
                    <RatingStars
                      value={summary.average}
                      size="md"
                      showValue={false}
                    />
                    <p className="text-xs text-neutral-500 mt-1">
                      {summary.count} avis
                    </p>
                  </div>
                  <div className="flex-1 min-w-[200px] space-y-1">
                    {(['5', '4', '3', '2', '1'] as const).map((s) => {
                      const n = summary.distribution[s];
                      const pct =
                        summary.count > 0 ? (n / summary.count) * 100 : 0;
                      return (
                        <div key={s} className="flex items-center gap-2 text-xs">
                          <span className="w-4 text-neutral-500">{s}★</span>
                          <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-accent-500 rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="w-8 text-right text-neutral-500 tabular-nums">
                            {n}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </CardBody>
              </Card>
            )}

            <Card>
              <CardHeader
                title="Avis reçus"
                subtitle={`${reviews?.count ?? 0} au total`}
                actions={
                  <div className="inline-flex bg-neutral-100 rounded-xl p-0.5">
                    {(
                      [
                        { v: 'all', label: 'Tous' },
                        { v: '5', label: '5★' },
                        { v: '4', label: '4★' },
                        { v: 'low', label: 'Faibles' },
                      ] as const
                    ).map((o) => (
                      <button
                        key={o.v}
                        onClick={() => setFilter(o.v)}
                        className={cn(
                          'px-2.5 py-1 rounded-lg text-[11px] font-semibold transition',
                          filter === o.v
                            ? 'bg-white shadow-sm text-neutral-900'
                            : 'text-neutral-500 hover:text-neutral-800',
                        )}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                }
              />
              <CardBody>
                {loadingReviews && !reviews ? (
                  <div className="py-6 flex justify-center">
                    <Spinner label="Chargement des avis…" />
                  </div>
                ) : (reviews?.results ?? []).length === 0 ? (
                  <div className="text-center py-8 text-sm text-neutral-500">
                    Aucun avis pour cette formation.
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {(reviews?.results ?? [])
                      .filter((r) =>
                        filter === 'all'
                          ? true
                          : filter === 'low'
                            ? r.rating <= 3
                            : String(r.rating) === filter,
                      )
                      .map((r) => (
                        <ReviewCard key={r.id} review={r} />
                      ))}
                  </ul>
                )}
              </CardBody>
            </Card>

            <p className="text-xs text-neutral-400 flex items-center gap-1.5">
              <Filter className="w-3 h-3" />
              La réponse aux avis et le signalement seront activés en R14
              (nouveaux endpoints backend requis).
            </p>
          </div>
        </div>
      )}
    </InstructorShell>
  );
}

function ReviewCard({
  review,
}: {
  review: {
    id: number;
    rating: number;
    comment: string;
    user_name: string;
    created_at: string;
  };
}) {
  return (
    <li className="bg-white border border-neutral-100 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-sm">
            {review.user_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold">{review.user_name}</p>
            <p className="text-[11px] text-neutral-500">
              {new Date(review.created_at).toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </p>
          </div>
        </div>
        <RatingStars value={review.rating} size="sm" showValue={false} />
      </div>
      {review.comment && (
        <p className="mt-2 text-sm text-neutral-700 whitespace-pre-line">
          {review.comment}
        </p>
      )}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled
          title="Répondre — disponible en R14"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-neutral-200 text-neutral-500 disabled:cursor-not-allowed"
        >
          <Send className="w-3 h-3" />
          Répondre
        </button>
        <button
          type="button"
          disabled
          title="Signaler — disponible en R14"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-neutral-200 text-neutral-500 disabled:cursor-not-allowed"
        >
          <Flag className="w-3 h-3" />
          Signaler
        </button>
        <span className="text-[11px] text-neutral-400 inline-flex items-center gap-1">
          <MessageCircle className="w-3 h-3" />
          Nouveau
        </span>
      </div>
    </li>
  );
}
