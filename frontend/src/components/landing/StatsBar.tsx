/**
 * StatsBar.tsx — Bandeau de gros indicateurs sous le hero (R11.1).
 * Compteurs animés avec fade-in on-scroll.
 */
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  BookOpen,
  Users,
  Award,
  GraduationCap,
  Globe,
} from 'lucide-react';
import { StatsCounter } from '@/components/premium/StatsCounter';

interface StatItem {
  label: string;
  value: number;
  suffix?: string;
  Icon: typeof BookOpen;
}

const DEFAULT_STATS: StatItem[] = [
  { label: 'Formations', value: 350, suffix: '+', Icon: BookOpen },
  { label: 'Étudiants', value: 25000, suffix: '+', Icon: Users },
  { label: 'Certificats délivrés', value: 8500, suffix: '+', Icon: Award },
  { label: 'Formateurs experts', value: 120, suffix: '+', Icon: GraduationCap },
  { label: 'Pays', value: 24, Icon: Globe },
];

interface StatsBarProps {
  stats?: StatItem[];
}

export function StatsBar({ stats = DEFAULT_STATS }: StatsBarProps) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      className="bg-white dark:bg-neutral-950 border-y border-neutral-100 dark:border-neutral-800"
      aria-label="Statistiques de la plateforme"
    >
      <div className="container mx-auto px-4 max-w-6xl py-8 sm:py-10">
        <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 sm:gap-6">
          {stats.map(({ label, value, suffix, Icon }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 12 }}
              animate={visible ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              className="text-center"
            >
              <div className="mx-auto w-10 h-10 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center mb-2">
                <Icon className="w-5 h-5" />
              </div>
              <dd className="text-2xl sm:text-3xl font-extrabold text-neutral-900 dark:text-white tabular-nums">
                {visible ? (
                  <StatsCounter value={value} suffix={suffix ?? ''} />
                ) : (
                  '0'
                )}
              </dd>
              <dt className="mt-1 text-[11px] sm:text-xs text-neutral-500 uppercase tracking-wide">
                {label}
              </dt>
            </motion.div>
          ))}
        </dl>
      </div>
    </section>
  );
}
