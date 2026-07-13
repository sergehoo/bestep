/**
 * HowItWorks.tsx — Timeline 4 étapes (R11.3).
 */
import { UserPlus, Search, PlayCircle, Award } from 'lucide-react';
import { motion } from 'framer-motion';

const STEPS = [
  {
    n: 1,
    Icon: UserPlus,
    title: 'Créer un compte',
    desc: 'Inscription en 30 secondes, sans carte bancaire.',
  },
  {
    n: 2,
    Icon: Search,
    title: 'Choisir une formation',
    desc: 'Parcourez le catalogue et sélectionnez le cours qui vous convient.',
  },
  {
    n: 3,
    Icon: PlayCircle,
    title: 'Apprendre à votre rythme',
    desc: 'Vidéos HD, quiz interactifs, ressources téléchargeables.',
  },
  {
    n: 4,
    Icon: Award,
    title: 'Obtenir votre certificat',
    desc: 'Certificat vérifiable + badge numérique partageable.',
  },
];

export function HowItWorks() {
  return (
    <section
      className="bg-gradient-to-b from-white to-neutral-50 dark:from-neutral-950 dark:to-neutral-900 py-14 sm:py-16"
      aria-labelledby="how-title"
    >
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-xs font-bold text-primary-600 uppercase tracking-wider">
            En 4 étapes
          </p>
          <h2
            id="how-title"
            className="mt-1 text-2xl sm:text-3xl font-extrabold text-neutral-900 dark:text-white"
          >
            Comment ça fonctionne
          </h2>
        </div>

        <ol className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 relative">
          {/* Ligne décorative desktop */}
          <div
            aria-hidden
            className="hidden lg:block absolute top-8 left-[12%] right-[12%] h-0.5 bg-gradient-to-r from-primary-200 via-accent-300 to-primary-200"
          />
          {STEPS.map((s, i) => (
            <motion.li
              key={s.n}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="relative bg-white dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700 rounded-2xl p-5 sm:p-6 shadow-soft text-center"
            >
              <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white flex items-center justify-center shadow-lift mb-3">
                <s.Icon className="w-7 h-7" />
              </div>
              <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-accent-400 text-primary-900 shadow">
                Étape {s.n}
              </span>
              <h3 className="mt-2 font-extrabold text-neutral-900">
                {s.title}
              </h3>
              <p className="mt-1.5 text-sm text-neutral-600 leading-relaxed">
                {s.desc}
              </p>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}
