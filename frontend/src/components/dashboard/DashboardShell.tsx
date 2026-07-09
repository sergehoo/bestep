/**
 * DashboardShell.tsx — Layout commun aux 3 dashboards (R5.2).
 * Header sticky avec titre + PeriodSelector + slot children.
 */
import { ReactNode } from 'react';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { PeriodSelector } from './PeriodSelector';
import type { DashboardPeriod } from '@/lib/types';

interface DashboardShellProps {
  title: string;
  subtitle?: string;
  period: DashboardPeriod;
  onPeriodChange: (p: DashboardPeriod) => void;
  headerRight?: ReactNode;
  children: ReactNode;
}

export function DashboardShell({
  title,
  subtitle,
  period,
  onPeriodChange,
  headerRight,
  children,
}: DashboardShellProps) {
  return (
    <div className="min-h-screen bg-neutral-50">
      <PublicHeader />
      <section className="border-b border-neutral-200 bg-white">
        <div className="container mx-auto px-4 max-w-7xl py-6 flex flex-wrap items-center gap-4 justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-neutral-900">{title}</h1>
            {subtitle && (
              <p className="text-sm text-neutral-500 mt-1">{subtitle}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {headerRight}
            <PeriodSelector value={period} onChange={onPeriodChange} />
          </div>
        </div>
      </section>
      <main className="container mx-auto px-4 max-w-7xl py-8 space-y-6">
        {children}
      </main>
    </div>
  );
}
