/**
 * SettingsSectionForm.tsx — R46
 *
 * Formulaire générique pour une section de PlatformSettings.
 * Rend automatiquement les champs à partir des valeurs actuelles :
 *   - boolean → toggle
 *   - number  → input number
 *   - string  → input text (multiline si long)
 *   - array de strings → chips éditables (tags)
 *   - null → input text
 *
 * L'appelant fournit :
 *   - values          : les valeurs actuelles de la section
 *   - defaults        : les valeurs par défaut (pour placeholder + reset)
 *   - fieldLabels     : override optionnel du label affiché
 *   - fieldHelp       : tooltip / description optionnel(le)
 *   - onSave(patch)   : appelé avec le sous-dict des changements uniquement
 *   - isPending       : état loading global
 *   - isDirty         : contrôlé optionnellement (sinon calculé interne)
 */
import { useEffect, useMemo, useState } from 'react';
import { Check, RotateCcw, Save, X } from 'lucide-react';

type Primitive = string | number | boolean | null;
type Value = Primitive | string[];

export interface SettingsSectionFormProps {
  values: Record<string, unknown>;
  defaults: Record<string, unknown>;
  fieldLabels?: Record<string, string>;
  fieldHelp?: Record<string, string>;
  onSave: (patch: Record<string, unknown>) => Promise<void> | void;
  isPending?: boolean;
  savedFlash?: boolean;
  hint?: string;
}

function coerceValue(v: unknown): Value {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) {
    return v.filter((x): x is string => typeof x === 'string');
  }
  if (typeof v === 'boolean' || typeof v === 'number' || typeof v === 'string') {
    return v;
  }
  return String(v);
}

function labelize(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function SettingsSectionForm({
  values,
  defaults,
  fieldLabels,
  fieldHelp,
  onSave,
  isPending = false,
  savedFlash = false,
  hint,
}: SettingsSectionFormProps) {
  // On construit un state contrôlé initialisé sur les valeurs backend.
  const [draft, setDraft] = useState<Record<string, Value>>(() => {
    const out: Record<string, Value> = {};
    for (const k of Object.keys(defaults)) {
      out[k] = coerceValue(values[k] ?? defaults[k]);
    }
    return out;
  });

  // Sync quand values change (ex: après save réussi)
  useEffect(() => {
    const next: Record<string, Value> = {};
    for (const k of Object.keys(defaults)) {
      next[k] = coerceValue(values[k] ?? defaults[k]);
    }
    setDraft(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values]);

  const isDirty = useMemo(() => {
    for (const k of Object.keys(defaults)) {
      const current = coerceValue(values[k] ?? defaults[k]);
      if (JSON.stringify(current) !== JSON.stringify(draft[k])) return true;
    }
    return false;
  }, [draft, values, defaults]);

  const changedPatch = useMemo(() => {
    const patch: Record<string, unknown> = {};
    for (const k of Object.keys(defaults)) {
      const current = coerceValue(values[k] ?? defaults[k]);
      if (JSON.stringify(current) !== JSON.stringify(draft[k])) {
        patch[k] = draft[k];
      }
    }
    return patch;
  }, [draft, values, defaults]);

  function handleReset() {
    const next: Record<string, Value> = {};
    for (const k of Object.keys(defaults)) {
      next[k] = coerceValue(values[k] ?? defaults[k]);
    }
    setDraft(next);
  }

  function handleResetToDefaults() {
    const next: Record<string, Value> = {};
    for (const k of Object.keys(defaults)) {
      next[k] = coerceValue(defaults[k]);
    }
    setDraft(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isDirty || isPending) return;
    await onSave(changedPatch);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {hint && (
        <p className="text-sm text-neutral-500 dark:text-neutral-400 italic">
          {hint}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Object.keys(defaults).map((key) => {
          const rawDefault = defaults[key];
          const value = draft[key];
          const label = fieldLabels?.[key] ?? labelize(key);
          const help = fieldHelp?.[key];

          const commonWrap = (children: React.ReactNode) => (
            <div key={key} className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
                {label}
              </label>
              {children}
              {help && (
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  {help}
                </p>
              )}
            </div>
          );

          if (typeof rawDefault === 'boolean') {
            const checked = Boolean(value);
            return commonWrap(
              <button
                type="button"
                onClick={() =>
                  setDraft((d) => ({ ...d, [key]: !checked }))
                }
                className={
                  'inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold transition w-fit ' +
                  (checked
                    ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200'
                    : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300')
                }
              >
                {checked ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <X className="w-4 h-4" />
                )}
                {checked ? 'Activé' : 'Désactivé'}
              </button>,
            );
          }

          if (typeof rawDefault === 'number') {
            return commonWrap(
              <input
                type="number"
                value={typeof value === 'number' ? value : Number(value) || 0}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    [key]: Number(e.target.value),
                  }))
                }
                className="px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />,
            );
          }

          if (Array.isArray(rawDefault)) {
            const arr = (value as string[]) ?? [];
            return commonWrap(
              <TagsInput
                values={arr}
                onChange={(next) => setDraft((d) => ({ ...d, [key]: next }))}
              />,
            );
          }

          // string / null
          const strVal = value == null ? '' : String(value);
          const isLong = strVal.length > 60 || key.includes('message');
          return commonWrap(
            isLong ? (
              <textarea
                rows={3}
                value={strVal}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, [key]: e.target.value }))
                }
                className="px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y"
              />
            ) : (
              <input
                type="text"
                value={strVal}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, [key]: e.target.value }))
                }
                className="px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            ),
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-neutral-100 dark:border-neutral-700">
        <button
          type="submit"
          disabled={!isDirty || isPending}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="w-4 h-4" />
          {isPending ? 'Enregistrement…' : 'Enregistrer la section'}
        </button>
        <button
          type="button"
          onClick={handleReset}
          disabled={!isDirty || isPending}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition disabled:opacity-50"
        >
          <RotateCcw className="w-4 h-4" />
          Annuler
        </button>
        <button
          type="button"
          onClick={handleResetToDefaults}
          disabled={isPending}
          className="text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200 underline"
        >
          Réinitialiser aux valeurs par défaut
        </button>
        {savedFlash && (
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
            <Check className="w-4 h-4" />
            Enregistré
          </span>
        )}
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────
// TagsInput — chips éditables
// ─────────────────────────────────────────────────────────────────────

function TagsInput({
  values,
  onChange,
}: {
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const [buffer, setBuffer] = useState('');

  function pushBuffer() {
    const trimmed = buffer.trim();
    if (!trimmed) return;
    if (values.includes(trimmed)) {
      setBuffer('');
      return;
    }
    onChange([...values, trimmed]);
    setBuffer('');
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 min-h-[42px]">
      {values.map((v) => (
        <span
          key={v}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary-100 dark:bg-primary-900/40 text-primary-800 dark:text-primary-200 text-xs font-semibold"
        >
          {v}
          <button
            type="button"
            onClick={() => onChange(values.filter((x) => x !== v))}
            className="text-primary-700 dark:text-primary-300 hover:text-rose-600"
            aria-label={`Retirer ${v}`}
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={buffer}
        onChange={(e) => setBuffer(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            pushBuffer();
          } else if (e.key === 'Backspace' && !buffer && values.length) {
            onChange(values.slice(0, -1));
          }
        }}
        onBlur={pushBuffer}
        placeholder="Ajouter…"
        className="flex-1 min-w-[80px] bg-transparent text-sm text-neutral-900 dark:text-white focus:outline-none"
      />
    </div>
  );
}
