/**
 * PartnersMarquee.tsx — Bandeau logos partenaires défilant (R11.3).
 * CSS-only marquee, respecte prefers-reduced-motion (statique si activé).
 */
import { motion } from 'framer-motion';
import { prefersReducedMotion } from '@/lib/course-meta';

const PARTNERS = [
  'BNP Paribas',
  'Ecobank',
  'Société Générale',
  'BOA Group',
  'Orange Money',
  'Wave',
  'MTN Business',
  'PwC',
  'Ministère des Finances',
];

export function PartnersMarquee() {
  const reduced = prefersReducedMotion();
  const items = [...PARTNERS, ...PARTNERS];

  return (
    <section
      className="bg-white py-10 sm:py-12 border-y border-neutral-100"
      aria-label="Nos partenaires"
    >
      <div className="container mx-auto px-4 max-w-6xl">
        <p className="text-center text-[11px] font-bold text-neutral-500 uppercase tracking-widest mb-6">
          Ils nous font confiance
        </p>
        <div className="relative overflow-hidden">
          <div
            aria-hidden
            className="absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none"
          />
          <div
            aria-hidden
            className="absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none"
          />
          {reduced ? (
            <div className="flex flex-wrap justify-center items-center gap-x-8 gap-y-3">
              {PARTNERS.map((p) => (
                <PartnerLogo key={p} name={p} />
              ))}
            </div>
          ) : (
            <motion.div
              className="flex items-center gap-8 whitespace-nowrap"
              animate={{ x: ['0%', '-50%'] }}
              transition={{
                duration: 30,
                ease: 'linear',
                repeat: Infinity,
              }}
            >
              {items.map((p, i) => (
                <PartnerLogo key={`${p}-${i}`} name={p} />
              ))}
            </motion.div>
          )}
        </div>
      </div>
    </section>
  );
}

function PartnerLogo({ name }: { name: string }) {
  return (
    <span className="shrink-0 text-neutral-400 hover:text-neutral-700 transition font-extrabold text-lg sm:text-xl tracking-tight">
      {name}
    </span>
  );
}
