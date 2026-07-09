/**
 * ThemeToggle.tsx — Bouton clair / sombre / système (R15.2).
 */
import { Sun, Moon, Monitor } from 'lucide-react';
import { Dropdown } from './Dropdown';
import { useUIStore, useTheme } from '@/stores/ui';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export function ThemeToggle() {
  const theme = useTheme();
  const setTheme = useUIStore((s) => s.setTheme);
  const t = useT();

  const OPTIONS = [
    { value: 'light' as const, label: t('theme.light'), Icon: Sun },
    { value: 'dark' as const, label: t('theme.dark'), Icon: Moon },
    { value: 'system' as const, label: t('theme.system'), Icon: Monitor },
  ];

  const current = OPTIONS.find((o) => o.value === theme) ?? OPTIONS[2];
  const CurrentIcon = current.Icon;

  return (
    <Dropdown
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
          aria-label={t('theme.aria')}
        >
          <CurrentIcon className="w-5 h-5 text-neutral-600 dark:text-neutral-300" />
        </button>
      )}
      panelClassName="!w-48"
    >
      {({ close }) => (
        <ul className="p-1" role="menu">
          {OPTIONS.map((o) => {
            const active = o.value === theme;
            return (
              <li key={o.value}>
                <button
                  type="button"
                  onClick={() => {
                    setTheme(o.value);
                    close();
                  }}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition',
                    active
                      ? 'bg-primary-50 text-primary-700 font-bold'
                      : 'text-neutral-700 hover:bg-neutral-50',
                  )}
                  role="menuitemradio"
                  aria-checked={active}
                >
                  <o.Icon className="w-4 h-4" />
                  {o.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Dropdown>
  );
}
