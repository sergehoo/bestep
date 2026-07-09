/**
 * AudienceSpaces.tsx — Section "Une plateforme complète pour tous vos besoins".
 *
 * 3 cards persona colorées présentant les trois espaces principaux de la
 * plateforme (Apprenant / Entreprise / Formateur) avec bullet points et CTA
 * dédiés. Chaque card utilise une palette dédiée : bleu primary pour
 * apprenant, jaune accent pour entreprise, vert emerald pour formateur.
 */
import { Link } from 'react-router-dom';
import {
  GraduationCap,
  Building2,
  Presentation,
  CheckCircle2,
  LucideIcon,
} from 'lucide-react';

interface Bullet {
  label: string;
}

interface AudienceCard {
  Icon: LucideIcon;
  title: string;
  description: string;
  bullets: Bullet[];
  ctaLabel: string;
  ctaHref: string;
  /** Classes de fond dégradé de la carte. */
  cardBg: string;
  /** Classes de la vignette d'icône. */
  iconBg: string;
  /** Couleurs du bouton CTA. */
  ctaClass: string;
}

const CARDS: AudienceCard[] = [
  {
    Icon: GraduationCap,
    title: 'Espace Apprenant',
    description:
      'Parcours personnalisés, progression, certifications et communauté.',
    bullets: [
      { label: 'Dashboard de progression' },
      { label: 'Cours recommandés' },
      { label: 'Certificats' },
    ],
    ctaLabel: "S'inscrire comme apprenant",
    ctaHref: '/register?role=learner',
    cardBg:
      'bg-gradient-to-br from-primary-50 via-white to-primary-50/40 border-primary-100',
    iconBg: 'bg-primary-500 text-white',
    ctaClass:
      'bg-primary-600 hover:bg-primary-700 text-white focus-visible:ring-primary-200',
  },
  {
    Icon: Building2,
    title: 'Espace Entreprise',
    description:
      'Formez vos équipes et suivez les compétences.',
    bullets: [
      { label: 'Dashboard analytique' },
      { label: 'Gestion des équipes' },
      { label: 'Rapports exportables' },
    ],
    ctaLabel: 'Découvrir nos offres',
    ctaHref: '/entreprise',
    cardBg:
      'bg-gradient-to-br from-accent-50 via-white to-accent-50/40 border-accent-100',
    iconBg: 'bg-accent-400 text-neutral-900',
    ctaClass:
      'bg-accent-400 hover:bg-accent-500 text-neutral-900 focus-visible:ring-accent-200',
  },
  {
    Icon: Presentation,
    title: 'Espace Formateur',
    description: 'Créez, publiez et suivez vos performances.',
    bullets: [
      { label: 'Création avancée' },
      { label: 'Analytique' },
      { label: 'Paiements & rapports' },
    ],
    ctaLabel: 'Devenir formateur',
    ctaHref: '/register?role=instructor',
    cardBg:
      'bg-gradient-to-br from-emerald-50 via-white to-emerald-50/40 border-emerald-100',
    iconBg: 'bg-emerald-500 text-white',
    ctaClass:
      'bg-emerald-600 hover:bg-emerald-700 text-white focus-visible:ring-emerald-200',
  },
];

export function AudienceSpaces() {
  return (
    <section
      className="bg-white py-14 sm:py-20"
      aria-labelledby="audiences-title"
    >
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="text-center max-w-2xl mx-auto">
          <h2
            id="audiences-title"
            className="text-2xl sm:text-4xl font-extrabold text-neutral-900 leading-tight"
          >
            Une plateforme{' '}
            <span className="text-primary-600">complète</span> pour tous vos
            besoins
          </h2>
        </div>

        <ul className="mt-10 sm:mt-14 grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
          {CARDS.map((card) => (
            <li
              key={card.title}
              className={`rounded-3xl border p-6 sm:p-8 flex flex-col shadow-sm hover:shadow-lift transition-shadow ${card.cardBg}`}
            >
              <div
                className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center mb-5 sm:mb-6 shadow-sm ${card.iconBg}`}
              >
                <card.Icon className="w-6 h-6 sm:w-7 sm:h-7" />
              </div>

              <h3 className="text-xl sm:text-2xl font-extrabold text-neutral-900">
                {card.title}
              </h3>
              <p className="mt-2 text-sm sm:text-base text-neutral-600 leading-relaxed">
                {card.description}
              </p>

              <ul className="mt-4 sm:mt-5 space-y-2 flex-1">
                {card.bullets.map((b) => (
                  <li
                    key={b.label}
                    className="flex items-center gap-2 text-sm sm:text-base text-neutral-700"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>{b.label}</span>
                  </li>
                ))}
              </ul>

              <Link
                to={card.ctaHref}
                className={`mt-6 sm:mt-8 inline-flex items-center justify-center gap-2 rounded-xl font-bold py-3 px-4 text-sm sm:text-base transition-all active:scale-[.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-offset-1 ${card.ctaClass}`}
              >
                {card.ctaLabel}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default AudienceSpaces;
