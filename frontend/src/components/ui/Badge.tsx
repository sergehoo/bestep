/**
 * Badge.tsx — Badge du design system (R3.3).
 */
import { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type BadgeVariant =
  | 'primary'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral';

export type BadgeSize = 'xs' | 'sm' | 'md' | 'lg';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  primary: 'bg-primary-100 text-primary-800 ring-1 ring-primary-200/60',
  accent: 'bg-accent-100 text-accent-800 ring-1 ring-accent-200/60',
  success: 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200/60',
  warning: 'bg-amber-100 text-amber-800 ring-1 ring-amber-200/60',
  danger: 'bg-rose-100 text-rose-800 ring-1 ring-rose-200/60',
  info: 'bg-blue-100 text-blue-800 ring-1 ring-blue-200/60',
  neutral: 'bg-neutral-100 text-neutral-700 ring-1 ring-neutral-200/60',
};

const SIZE_CLASSES: Record<BadgeSize, string> = {
  xs: 'px-2 py-0.5 text-[10px]',
  sm: 'px-2 py-0.5 text-[11px]',
  md: 'px-2.5 py-1 text-xs',
  lg: 'px-3 py-1 text-sm',
};

export function Badge({
  variant = 'neutral',
  size = 'md',
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
