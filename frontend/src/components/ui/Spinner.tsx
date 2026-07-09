/**
 * Spinner.tsx — Loaders (R3.3).
 */
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SpinnerProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  label?: string;
  className?: string;
}

const SIZE_CLASSES = {
  xs: 'w-4 h-4',
  sm: 'w-5 h-5',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
  xl: 'w-12 h-12',
};

export function Spinner({ size = 'md', label, className }: SpinnerProps) {
  return (
    <div className={cn('inline-flex items-center gap-2', className)} role="status" aria-live="polite">
      <Loader2 className={cn(SIZE_CLASSES[size], 'animate-spin text-primary-600')} />
      {label ? (
        <span className="text-sm text-neutral-500">{label}</span>
      ) : (
        <span className="sr-only">Chargement…</span>
      )}
    </div>
  );
}

export function PageSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Spinner size="xl" label="Chargement…" />
    </div>
  );
}
