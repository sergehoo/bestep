/**
 * ReviewsSummaryCard.tsx — Widget récap notes (moyenne + distribution).
 */
import { Star } from 'lucide-react';
import type { ReviewsSummary } from '@/lib/types';

interface ReviewsSummaryCardProps {
  summary: ReviewsSummary;
}

export function ReviewsSummaryCard({ summary }: ReviewsSummaryCardProps) {
  const total = summary.count || 1;
  const stars: Array<keyof ReviewsSummary['distribution']> = ['5', '4', '3', '2', '1'];

  return (
    <div className="bg-white border border-neutral-100 rounded-2xl p-5">
      <div className="flex items-center gap-6">
        <div className="text-center">
          <div className="text-4xl font-extrabold text-primary-600">
            {summary.average.toFixed(1)}
          </div>
          <div className="flex items-center justify-center gap-0.5 mt-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <Star
                key={i}
                className={
                  i <= Math.round(summary.average)
                    ? 'w-4 h-4 fill-accent-500 text-accent-500'
                    : 'w-4 h-4 text-neutral-300'
                }
              />
            ))}
          </div>
          <div className="text-xs text-neutral-500 mt-1">
            {summary.count} avis
          </div>
        </div>
        <div className="flex-1 space-y-1">
          {stars.map((key) => {
            const value = summary.distribution[key];
            const percent = summary.count > 0 ? (value / total) * 100 : 0;
            return (
              <div key={key} className="flex items-center gap-2 text-xs">
                <span className="w-3 text-neutral-500">{key}</span>
                <Star className="w-3 h-3 fill-accent-500 text-accent-500" />
                <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent-500 rounded-full transition-all"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <span className="w-8 text-right text-neutral-500">{value}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
