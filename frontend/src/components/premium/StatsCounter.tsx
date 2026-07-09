/**
 * StatsCounter.tsx — Compteur qui s'anime de 0 à la valeur (R9.2).
 * Respecte prefers-reduced-motion.
 */
import { useEffect, useState } from 'react';
import { prefersReducedMotion } from '@/lib/course-meta';

interface StatsCounterProps {
  value: number;
  duration?: number; // ms
  suffix?: string;
  prefix?: string;
  formatNumber?: (v: number) => string;
  className?: string;
}

const defaultFormat = (v: number) =>
  new Intl.NumberFormat('fr-FR').format(Math.round(v));

export function StatsCounter({
  value,
  duration = 1200,
  suffix = '',
  prefix = '',
  formatNumber = defaultFormat,
  className,
}: StatsCounterProps) {
  const reduced = prefersReducedMotion();
  const [display, setDisplay] = useState(reduced ? value : 0);

  useEffect(() => {
    if (reduced) {
      setDisplay(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(value * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, reduced]);

  return (
    <span className={className}>
      {prefix}
      {formatNumber(display)}
      {suffix}
    </span>
  );
}
