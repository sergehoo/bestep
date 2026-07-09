/**
 * StickySectionsNav.tsx — Nav sticky des sections détail cours (R9.4).
 * Utilise IntersectionObserver pour détecter la section active.
 */
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface Item {
  id: string;
  label: string;
}

interface StickySectionsNavProps {
  items: Item[];
  offset?: number; // top offset scroll (px)
}

export function StickySectionsNav({ items, offset = 96 }: StickySectionsNavProps) {
  const [active, setActive] = useState(items[0]?.id ?? '');

  useEffect(() => {
    const handler = () => {
      const y = window.scrollY + offset + 20;
      let current = items[0]?.id ?? '';
      for (const it of items) {
        const el = document.getElementById(it.id);
        if (el && el.offsetTop <= y) current = it.id;
      }
      setActive(current);
    };
    handler();
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, [items, offset]);

  const goTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const y = el.offsetTop - offset + 1;
    window.scrollTo({ top: y, behavior: 'smooth' });
  };

  return (
    <nav
      aria-label="Sections du cours"
      className="border-b border-neutral-200 bg-white/95 backdrop-blur sticky top-0 z-30"
    >
      <ul className="container mx-auto px-4 max-w-6xl flex gap-1 overflow-x-auto no-scrollbar">
        {items.map((it) => {
          const isActive = it.id === active;
          return (
            <li key={it.id} className="shrink-0">
              <button
                onClick={() => goTo(it.id)}
                className={cn(
                  'px-3 py-3 text-xs sm:text-sm font-semibold border-b-2 whitespace-nowrap transition',
                  isActive
                    ? 'border-primary-600 text-primary-700'
                    : 'border-transparent text-neutral-500 hover:text-neutral-800',
                )}
                aria-current={isActive ? 'true' : undefined}
              >
                {it.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
