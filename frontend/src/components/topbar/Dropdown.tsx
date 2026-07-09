/**
 * Dropdown.tsx — Wrapper commun pour les dropdowns de la top bar (R15.2).
 * Gère : outside click, Esc close, animation Framer Motion.
 */
import { ReactNode, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface Props {
  trigger: (opts: {
    open: boolean;
    toggle: () => void;
  }) => ReactNode;
  align?: 'left' | 'right';
  panelClassName?: string;
  children: (opts: { close: () => void }) => ReactNode;
}

export function Dropdown({
  trigger,
  align = 'right',
  panelClassName,
  children,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className={cn(
              'absolute top-full mt-2 z-50 w-80 bg-white rounded-2xl shadow-lift border border-neutral-100 overflow-hidden',
              align === 'right' ? 'right-0' : 'left-0',
              panelClassName,
            )}
            role="menu"
          >
            {children({ close: () => setOpen(false) })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
