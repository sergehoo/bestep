/**
 * RatingStars.tsx — 5 étoiles avec fill fractionnel (R9.2).
 */
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RatingStarsProps {
  value: number; // 0..5
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showValue?: boolean;
  count?: number;
  className?: string;
}

const SIZE = {
  xs: 'w-3 h-3',
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
};

const TEXT_SIZE = {
  xs: 'text-[10px]',
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
};

export function RatingStars({
  value,
  size = 'sm',
  showValue = true,
  count,
  className,
}: RatingStarsProps) {
  const clamped = Math.max(0, Math.min(5, value));
  const full = Math.floor(clamped);
  const partial = clamped - full;
  return (
    <span
      className={cn('inline-flex items-center gap-1.5', className)}
      role="img"
      aria-label={`Note : ${clamped.toFixed(1)} sur 5`}
    >
      <span className="inline-flex">
        {[0, 1, 2, 3, 4].map((i) => {
          const fillPct =
            i < full ? 100 : i === full ? Math.round(partial * 100) : 0;
          return (
            <span key={i} className="relative inline-block">
              <Star className={cn(SIZE[size], 'text-neutral-300')} />
              {fillPct > 0 && (
                <span
                  aria-hidden
                  className="absolute inset-0 overflow-hidden"
                  style={{ width: `${fillPct}%` }}
                >
                  <Star
                    className={cn(SIZE[size], 'fill-accent-500 text-accent-500')}
                  />
                </span>
              )}
            </span>
          );
        })}
      </span>
      {showValue && (
        <span className={cn(TEXT_SIZE[size], 'font-semibold text-neutral-800')}>
          {clamped.toFixed(1)}
        </span>
      )}
      {typeof count === 'number' && count > 0 && (
        <span className={cn(TEXT_SIZE[size], 'text-neutral-500')}>
          ({count})
        </span>
      )}
    </span>
  );
}
