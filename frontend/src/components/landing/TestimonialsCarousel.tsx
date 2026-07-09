/**
 * TestimonialsCarousel.tsx — Carrousel témoignages autoplay (R11.3).
 */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Quote, Star, ChevronLeft, ChevronRight } from 'lucide-react';
import { prefersReducedMotion } from '@/lib/course-meta';

interface Testimonial {
  id: string;
  name: string;
  role: string;
  company: string;
  text: string;
  rating: number;
  initial: string;
  bg: string;
}

const TESTIMONIALS: Testimonial[] = [
  {
    id: '1',
    name: 'Fatoumata B.',
    role: 'Gestionnaire de patrimoine',
    company: 'BOA Group',
    text: "Le cours sur l'analyse fondamentale a transformé ma façon d'évaluer les entreprises. Structuré, dense, avec un formateur exceptionnel.",
    rating: 5,
    initial: 'F',
    bg: 'from-primary-400 to-primary-600',
  },
  {
    id: '2',
    name: 'Amadou D.',
    role: 'Entrepreneur',
    company: 'AgriTech Sénégal',
    text: "J'ai pu diversifier mes investissements grâce aux cours immobilier et bourse. Le format modulaire permet vraiment d'apprendre à son rythme.",
    rating: 5,
    initial: 'A',
    bg: 'from-emerald-400 to-emerald-600',
  },
  {
    id: '3',
    name: 'Marie K.',
    role: 'Cadre bancaire',
    company: 'Société Générale',
    text: 'Certification obtenue en 3 mois. La plateforme est intuitive, le support formateur réactif. Je recommande à tous mes collègues.',
    rating: 5,
    initial: 'M',
    bg: 'from-accent-400 to-accent-600',
  },
  {
    id: '4',
    name: 'Ibrahim S.',
    role: 'Étudiant en finance',
    company: 'HEC Paris',
    text: "Les compléments idéaux à ma formation académique. Concret, pragmatique, avec des cas d'étude réels du marché africain.",
    rating: 5,
    initial: 'I',
    bg: 'from-violet-400 to-violet-600',
  },
];

export function TestimonialsCarousel() {
  const [index, setIndex] = useState(0);
  const reduced = prefersReducedMotion();

  // Autoplay 6s (désactivé si reduced motion)
  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % TESTIMONIALS.length);
    }, 6000);
    return () => clearInterval(id);
  }, [reduced]);

  const go = (dir: -1 | 1) => {
    setIndex((i) => (i + dir + TESTIMONIALS.length) % TESTIMONIALS.length);
  };

  const current = TESTIMONIALS[index];

  return (
    <section
      className="bg-gradient-to-br from-primary-700 to-primary-800 text-white py-14 sm:py-16 overflow-hidden"
      aria-labelledby="testimonials-title"
    >
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-xs font-bold text-accent-300 uppercase tracking-wider">
            Ils nous font confiance
          </p>
          <h2
            id="testimonials-title"
            className="mt-1 text-2xl sm:text-3xl font-extrabold"
          >
            Ce que disent nos apprenants
          </h2>
        </div>

        <div className="mt-8 relative">
          <AnimatePresence mode="wait">
            <motion.blockquote
              key={current.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.35 }}
              className="bg-white/10 backdrop-blur rounded-3xl p-6 sm:p-8 border border-white/20 relative"
            >
              <Quote
                className="absolute top-4 left-4 w-8 h-8 text-accent-300/40"
                aria-hidden
              />
              <div className="flex items-center justify-center gap-0.5 mb-3">
                {Array.from({ length: current.rating }).map((_, i) => (
                  <Star
                    key={i}
                    className="w-5 h-5 fill-accent-400 text-accent-400"
                    aria-hidden
                  />
                ))}
              </div>
              <p className="text-base sm:text-lg leading-relaxed text-center italic">
                “{current.text}”
              </p>
              <footer className="mt-6 flex items-center justify-center gap-3">
                <div
                  className={`w-12 h-12 rounded-full bg-gradient-to-br ${current.bg} flex items-center justify-center font-extrabold text-lg shadow-lift`}
                  aria-hidden
                >
                  {current.initial}
                </div>
                <div className="text-left">
                  <p className="font-bold">{current.name}</p>
                  <p className="text-xs text-primary-100">
                    {current.role} · {current.company}
                  </p>
                </div>
              </footer>
            </motion.blockquote>
          </AnimatePresence>

          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => go(-1)}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur border border-white/20 transition"
              aria-label="Témoignage précédent"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <ul className="flex items-center gap-1.5">
              {TESTIMONIALS.map((t, i) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setIndex(i)}
                    className={
                      i === index
                        ? 'w-6 h-2 rounded-full bg-accent-400 transition'
                        : 'w-2 h-2 rounded-full bg-white/40 hover:bg-white/60 transition'
                    }
                    aria-label={`Aller au témoignage ${i + 1}`}
                    aria-current={i === index}
                  />
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => go(1)}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur border border-white/20 transition"
              aria-label="Témoignage suivant"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
