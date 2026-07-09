/**
 * ProgressBar.tsx — Barre de progression animée (R9.2).
 */
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface ProgressBarProps {
  value: number; // 0..100
  showValue?: boolean;
  className?: string;
  size?: 'sm' | 'md';
  color?: 'primary' | 'success' | 'accent';
  label?: string;
}

const COLOR = {
  primary: 'bg-gradient-to-r from-primary-500 to-primary-700',
  success: 'bg-gradient-to-r from-emerald-500 to-emerald-700',
  accent: 'bg-gradient-to-r from-accent-400 to-accent-600',
};

const HEIGHT = { sm: 'h-1.5', md: 'h-2.5' };

export function ProgressBar({
  value,
  showValue = false,
  className,
  size = 'md',
  color = 'primary',
  label,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={cn('w-full', className)}>
      {(label || showValue) && (
        <div className="flex items-center justify-between mb-1">
          {label && <span className="text-xs text-neutral-600">{label}</span>}
          {showValue && (
            <span className="text-xs font-semibold text-neutral-800">
              {Math.round(clamped)}%
            </span>
          )}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? 'Progression'}
        className={cn(
          'w-full bg-neutral-100 rounded-full overflow-hidden',
          HEIGHT[size],
        )}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${clamped}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className={cn('h-full rounded-full', COLOR[color])}
        />
      </div>
    </div>
  );
}
