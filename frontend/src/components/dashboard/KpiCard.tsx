/**
 * KpiCard.tsx — Tuile KPI standard des dashboards (R5.2).
 */
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KpiCardProps {
  label: string;
  value: string | number;
  hint?: string;
  Icon?: LucideIcon;
  accent?: 'primary' | 'accent' | 'success' | 'warning' | 'danger';
  className?: string;
}

const ACCENT_CLASSES: Record<NonNullable<KpiCardProps['accent']>, string> = {
  primary: 'bg-primary-50 text-primary-700',
  accent: 'bg-accent-50 text-accent-700',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-700',
};

export function KpiCard({
  label,
  value,
  hint,
  Icon,
  accent = 'primary',
  className,
}: KpiCardProps) {
  return (
    <div
      className={cn(
        'bg-white dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700 rounded-2xl p-5 shadow-soft',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            {label}
          </p>
          <p className="text-3xl font-extrabold text-neutral-900 dark:text-white mt-1 truncate">
            {value}
          </p>
          {hint && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              {hint}
            </p>
          )}
        </div>
        {Icon && (
          <div className={cn('rounded-xl p-2.5 shrink-0', ACCENT_CLASSES[accent])}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
    </div>
  );
}
