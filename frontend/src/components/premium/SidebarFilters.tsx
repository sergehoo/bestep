/**
 * SidebarFilters.tsx — Filtres catalogue façon marketplace (R9.2).
 *
 * Filtres :
 *  - Catégorie (checkboxes)
 *  - Niveau (checkboxes)
 *  - Prix (radio Gratuit / Payant / Tous)
 *  - Durée (radio courtes / moyennes / longues / toutes)
 *  - Note (radio 4+ / 3+ / all)
 *  - Certification (toggle)
 *
 * Composant contrôlé — toute la source de vérité vit dans le parent.
 * Sur mobile, wrap dans un drawer côté page.
 */
import { X } from 'lucide-react';
import type { PublicCategory } from '@/lib/types';
import type { CourseLevel } from '@/lib/course-meta';
import { cn } from '@/lib/utils';

export type PriceFilter = 'all' | 'free' | 'paid';
export type DurationFilter = 'all' | 'short' | 'medium' | 'long';
export type RatingFilter = 'all' | '4+' | '3+';

export interface CatalogSidebarState {
  categories: string[]; // slugs
  levels: CourseLevel[];
  price: PriceFilter;
  duration: DurationFilter;
  rating: RatingFilter;
  certifiedOnly: boolean;
}

export const DEFAULT_SIDEBAR: CatalogSidebarState = {
  categories: [],
  levels: [],
  price: 'all',
  duration: 'all',
  rating: 'all',
  certifiedOnly: false,
};

interface SidebarFiltersProps {
  state: CatalogSidebarState;
  onChange: (next: CatalogSidebarState) => void;
  categories: PublicCategory[];
  onReset: () => void;
  onClose?: () => void; // affiche X sur mobile
  className?: string;
}

const LEVELS: CourseLevel[] = ['Débutant', 'Intermédiaire', 'Avancé', 'Tous niveaux'];

export function SidebarFilters({
  state,
  onChange,
  categories,
  onReset,
  onClose,
  className,
}: SidebarFiltersProps) {
  const toggleCategory = (slug: string) => {
    const has = state.categories.includes(slug);
    onChange({
      ...state,
      categories: has
        ? state.categories.filter((s) => s !== slug)
        : [...state.categories, slug],
    });
  };

  const toggleLevel = (level: CourseLevel) => {
    const has = state.levels.includes(level);
    onChange({
      ...state,
      levels: has ? state.levels.filter((l) => l !== level) : [...state.levels, level],
    });
  };

  return (
    <aside
      className={cn(
        'bg-white border border-neutral-100 rounded-2xl p-4 space-y-5',
        className,
      )}
      aria-label="Filtres catalogue"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-neutral-800">
          Filtres
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onReset}
            className="text-xs font-semibold text-primary-600 hover:text-primary-700 px-2 py-1 rounded"
          >
            Réinitialiser
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="lg:hidden p-1.5 rounded-lg hover:bg-neutral-100"
              aria-label="Fermer les filtres"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Catégories */}
      <Section title="Catégorie">
        {categories.length === 0 ? (
          <p className="text-xs text-neutral-400">Aucune catégorie.</p>
        ) : (
          <ul className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
            {categories.map((c) => {
              const checked = state.categories.includes(c.slug);
              return (
                <li key={c.slug}>
                  <label className="flex items-center gap-2 text-sm cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCategory(c.slug)}
                      className="accent-primary-600"
                    />
                    <span className="text-neutral-700 group-hover:text-primary-700 transition">
                      {c.name}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {/* Niveau */}
      <Section title="Niveau">
        <ul className="space-y-1.5">
          {LEVELS.map((lv) => {
            const checked = state.levels.includes(lv);
            return (
              <li key={lv}>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleLevel(lv)}
                    className="accent-primary-600"
                  />
                  <span className="text-neutral-700">{lv}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </Section>

      {/* Prix */}
      <Section title="Tarification">
        <RadioGroup
          name="price"
          value={state.price}
          onChange={(v) => onChange({ ...state, price: v as PriceFilter })}
          options={[
            { value: 'all', label: 'Tous' },
            { value: 'free', label: 'Gratuit' },
            { value: 'paid', label: 'Payant' },
          ]}
        />
      </Section>

      {/* Durée */}
      <Section title="Durée">
        <RadioGroup
          name="duration"
          value={state.duration}
          onChange={(v) => onChange({ ...state, duration: v as DurationFilter })}
          options={[
            { value: 'all', label: 'Toutes' },
            { value: 'short', label: '< 2 h' },
            { value: 'medium', label: '2 – 6 h' },
            { value: 'long', label: '> 6 h' },
          ]}
        />
      </Section>

      {/* Note */}
      <Section title="Note minimum">
        <RadioGroup
          name="rating"
          value={state.rating}
          onChange={(v) => onChange({ ...state, rating: v as RatingFilter })}
          options={[
            { value: 'all', label: 'Toutes' },
            { value: '4+', label: '★ 4+' },
            { value: '3+', label: '★ 3+' },
          ]}
        />
      </Section>

      {/* Certification */}
      <Section title="Certification">
        <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={state.certifiedOnly}
            onChange={(e) =>
              onChange({ ...state, certifiedOnly: e.target.checked })
            }
            className="accent-primary-600"
          />
          <span className="text-neutral-700">Cours certifiants seulement</span>
        </label>
      </Section>
    </aside>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-xs font-bold text-neutral-800 mb-2 uppercase tracking-wide">
        {title}
      </h3>
      {children}
    </div>
  );
}

function RadioGroup({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <ul className="space-y-1.5">
      {options.map((o) => (
        <li key={o.value}>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              name={name}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="accent-primary-600"
            />
            <span className="text-neutral-700">{o.label}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}
