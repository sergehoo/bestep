/**
 * OnboardingStep.tsx — R24.3
 *
 * Composant réutilisable : wrapper d'une question de l'onboarding
 * apprenant. Gère le titre, sous-titre, la grille d'options
 * sélectionnables (single ou multi) et l'état "sélectionné".
 */
import { motion } from 'framer-motion';
import { Check, LucideIcon } from 'lucide-react';

export interface OnboardingOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  Icon?: LucideIcon;
}

interface Props<T extends string> {
  title: string;
  subtitle?: string;
  options: OnboardingOption<T>[];
  mode: 'single' | 'multi';
  selected: T | T[] | null;
  onSelect: (value: T) => void;
  /** Nombre max de sélections en mode multi (facultatif). */
  max?: number;
  columns?: 1 | 2 | 3;
}

export function OnboardingStep<T extends string>({
  title,
  subtitle,
  options,
  mode,
  selected,
  onSelect,
  max,
  columns = 2,
}: Props<T>) {
  const isSelected = (v: T) =>
    mode === 'multi'
      ? Array.isArray(selected) && selected.includes(v)
      : selected === v;

  const gridCol =
    columns === 1
      ? 'grid-cols-1'
      : columns === 2
        ? 'grid-cols-1 sm:grid-cols-2'
        : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';

  const selectionCount = Array.isArray(selected) ? selected.length : 0;
  const atMax = max !== undefined && selectionCount >= max;

  return (
    <motion.div
      key={title}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.3 }}
    >
      <h2 className="text-2xl sm:text-3xl font-extrabold text-neutral-900 dark:text-white">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
          {subtitle}
        </p>
      )}

      <div className={`mt-6 grid gap-3 ${gridCol}`}>
        {options.map((opt) => {
          const active = isSelected(opt.value);
          const disabled =
            mode === 'multi' && !active && atMax;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => !disabled && onSelect(opt.value)}
              disabled={disabled}
              aria-pressed={active}
              className={
                'group relative text-left p-4 rounded-2xl border-2 transition-all ' +
                (active
                  ? 'border-primary-500 bg-primary-50/60 shadow-sm dark:bg-primary-900/20'
                  : 'border-neutral-200 hover:border-neutral-300 bg-white dark:bg-neutral-800 dark:border-neutral-700') +
                (disabled ? ' opacity-40 cursor-not-allowed' : ' cursor-pointer')
              }
            >
              <div className="flex items-start gap-3">
                {opt.Icon && (
                  <span
                    className={
                      'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ' +
                      (active
                        ? 'bg-primary-500 text-white'
                        : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-700')
                    }
                  >
                    <opt.Icon className="w-4 h-4" />
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <p
                    className={
                      'font-bold text-sm ' +
                      (active
                        ? 'text-primary-900 dark:text-white'
                        : 'text-neutral-900 dark:text-white')
                    }
                  >
                    {opt.label}
                  </p>
                  {opt.description && (
                    <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                      {opt.description}
                    </p>
                  )}
                </div>
                {active && (
                  <span className="w-5 h-5 rounded-full bg-primary-600 text-white flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3" />
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {mode === 'multi' && (
        <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
          {max !== undefined
            ? `${selectionCount} / ${max} sélectionné(s)`
            : `${selectionCount} sélectionné(s)`}
        </p>
      )}
    </motion.div>
  );
}

export default OnboardingStep;
