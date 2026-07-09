/**
 * LanguageSwitcher.tsx — Sélecteur de langue (R15.2).
 * MVP : persist localStorage. I18n complète prévue R16.
 */
import { Globe, Check } from 'lucide-react';
import { Dropdown } from './Dropdown';
import { useLanguage, useUIStore, type Language } from '@/stores/ui';
import { useT } from '@/lib/i18n';

const LANGUAGES: Array<{ value: Language; flag: string }> = [
  { value: 'fr', flag: '🇫🇷' },
  { value: 'en', flag: '🇬🇧' },
];

export function LanguageSwitcher() {
  const lang = useLanguage();
  const setLanguage = useUIStore((s) => s.setLanguage);
  const t = useT();

  return (
    <Dropdown
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className="hidden sm:inline-flex items-center gap-1.5 px-2 py-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
          aria-label={t('lang.aria')}
        >
          <Globe className="w-4 h-4 text-neutral-600 dark:text-neutral-300" />
          <span className="text-xs font-bold text-neutral-700 dark:text-neutral-200 uppercase">
            {lang}
          </span>
        </button>
      )}
      panelClassName="!w-44"
    >
      {({ close }) => (
        <ul className="p-1" role="menu">
          {LANGUAGES.map((l) => {
            const active = l.value === lang;
            return (
              <li key={l.value}>
                <button
                  type="button"
                  onClick={() => {
                    setLanguage(l.value);
                    close();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition"
                  role="menuitemradio"
                  aria-checked={active}
                >
                  <span className="text-base">{l.flag}</span>
                  <span className="flex-1 text-left">{t(`lang.${l.value}`)}</span>
                  {active && <Check className="w-3.5 h-3.5 text-primary-600" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Dropdown>
  );
}
