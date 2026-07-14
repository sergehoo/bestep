/**
 * FeaturedInstructors.tsx — Mise en avant des meilleurs formateurs (R11.3).
 * Contenu statique : les données publiques enrichies (bio, courses_count)
 * arrivent uniquement dans le detail cours (R10). Ici on mock jusqu'à ce
 * qu'un endpoint dédié soit exposé.
 */
import { motion } from 'framer-motion';
import { Star, Users, BookOpen } from 'lucide-react';

interface FeaturedInstructor {
  id: string;
  name: string;
  title: string;
  company: string;
  studentsCount: number;
  coursesCount: number;
  avgRating: number;
  avatarInitial: string;
  bgClass: string;
}

const INSTRUCTORS: FeaturedInstructor[] = [
  {
    id: 'alice',
    name: 'Alice Dupont',
    title: 'Analyste financière senior',
    company: 'BNP Paribas',
    studentsCount: 3420,
    coursesCount: 8,
    avgRating: 4.9,
    avatarInitial: 'A',
    bgClass: 'bg-gradient-to-br from-primary-400 to-primary-600',
  },
  {
    id: 'moussa',
    name: 'Moussa Diallo',
    title: 'Consultant en investissement',
    company: 'Ecobank',
    studentsCount: 2180,
    coursesCount: 5,
    avgRating: 4.8,
    avatarInitial: 'M',
    bgClass: 'bg-gradient-to-br from-emerald-400 to-emerald-600',
  },
  {
    id: 'sara',
    name: 'Sara Ndiaye',
    title: 'Coach en épargne',
    company: 'BestÉpargne',
    studentsCount: 5120,
    coursesCount: 12,
    avgRating: 5.0,
    avatarInitial: 'S',
    bgClass: 'bg-gradient-to-br from-accent-400 to-accent-600',
  },
  {
    id: 'jean',
    name: 'Jean Kouassi',
    title: 'Auditeur & conférencier',
    company: 'PwC',
    studentsCount: 1980,
    coursesCount: 4,
    avgRating: 4.7,
    avatarInitial: 'J',
    bgClass: 'bg-gradient-to-br from-violet-400 to-violet-600',
  },
];

export function FeaturedInstructors() {
  return (
    <section
      className="bg-white dark:bg-neutral-950 py-14 sm:py-16"
      aria-labelledby="instructors-title"
    >
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="flex items-end justify-between gap-4 mb-8 flex-wrap">
          <div>
            <p className="text-xs font-bold text-primary-600 uppercase tracking-wider">
              Expertise reconnue
            </p>
            <h2
              id="instructors-title"
              className="mt-1 text-2xl sm:text-3xl font-extrabold text-neutral-900 dark:text-white"
            >
              Apprenez auprès des meilleurs
            </h2>
          </div>
        </div>

        <ul className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {INSTRUCTORS.map((it, i) => (
            <motion.li
              key={it.id}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 rounded-2xl p-5 text-center hover:shadow-lift hover:border-primary-200 transition"
            >
              <div
                className={`mx-auto w-20 h-20 rounded-full ${it.bgClass} text-white text-3xl font-extrabold flex items-center justify-center shadow-lift`}
                aria-hidden
              >
                {it.avatarInitial}
              </div>
              <h3 className="mt-4 font-extrabold text-neutral-900 dark:text-white">
                {it.name}
              </h3>
              <p className="text-xs text-neutral-500">{it.title}</p>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                {it.company}
              </p>
              <dl className="mt-3 flex items-center justify-center gap-3 text-[11px] text-neutral-600">
                <div className="inline-flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 fill-accent-500 text-accent-500" />
                  <dt className="sr-only">Note</dt>
                  <dd className="font-semibold">{it.avgRating}</dd>
                </div>
                <div className="inline-flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  <dt className="sr-only">Étudiants</dt>
                  <dd>{it.studentsCount.toLocaleString('fr-FR')}</dd>
                </div>
                <div className="inline-flex items-center gap-1">
                  <BookOpen className="w-3.5 h-3.5" />
                  <dt className="sr-only">Cours</dt>
                  <dd>{it.coursesCount}</dd>
                </div>
              </dl>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}
