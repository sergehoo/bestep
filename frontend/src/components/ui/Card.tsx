/**
 * Card.tsx — Card du design system (R3.3).
 */
import { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
}

export function Card({ elevated = true, className, children, ...rest }: CardProps) {
  return (
    <article
      className={cn(
        'bg-white border border-neutral-100 rounded-2xl overflow-hidden',
        elevated && 'shadow-soft',
        className,
      )}
      {...rest}
    >
      {children}
    </article>
  );
}

interface CardHeaderProps extends HTMLAttributes<HTMLElement> {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function CardHeader({ title, subtitle, actions, className, children, ...rest }: CardHeaderProps) {
  return (
    <header
      className={cn(
        'px-5 py-4 border-b border-neutral-100 flex items-center justify-between gap-3',
        className,
      )}
      {...rest}
    >
      {children || (
        <>
          <div className="min-w-0">
            {title && <h3 className="text-base font-bold text-neutral-900">{title}</h3>}
            {subtitle && <p className="text-xs text-neutral-500 mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </>
      )}
    </header>
  );
}

export function CardBody({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('p-5', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <footer
      className={cn('px-5 py-4 border-t border-neutral-100 bg-neutral-50/50', className)}
      {...rest}
    >
      {children}
    </footer>
  );
}
