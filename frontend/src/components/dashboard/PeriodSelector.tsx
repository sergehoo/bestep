/**
 * PeriodSelector.tsx — Bouton segmenté 7j / 30j / 90j (R5.2).
 */
import { cn } from '@/lib/utils';
import type { DashboardPeriod } from '@/lib/types';

interface PeriodSelectorProps {
  value: DashboardPeriod;
  onChange: (p: DashboardPeriod) => void;
  className?: string;
}

const OPTIONS: Array<{ value: DashboardPeriod; label: string }> = [
  { value: '7d', label: '7 jours' },
  { value: '30d', label: '30 jours' },
  { value: '90d', label: '90 jours' },
];

export function PeriodSelector({ value, onChange, className }: PeriodSelectorProps) {
  return (
    <div
      role="tablist"
      aria-label="Période"
      className={cn(
        'inline-flex bg-white border border-neutral-200 rounded-xl p-1 shadow-soft',
        className,
      )}
    >
      {OPTIONS.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'px-3 py-1.5 text-xs font-semibold rounded-lg transition',
              active
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-neutral-600 hover:text-neutral-900',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
