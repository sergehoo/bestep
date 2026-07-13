/**
 * WhyChooseUs.tsx — 6 promesses de la plateforme (R11.2).
 */
import {
  Clock,
  Award,
  MessageCircle,
  Smartphone,
  Users,
  Lock,
  LucideIcon,
} from 'lucide-react';

interface Feature {
  Icon: LucideIcon;
  title: string;
  desc: string;
  bg: string;
  color: string;
}

const FEATURES: Feature[] = [
  {
    Icon: Clock,
    title: 'À votre rythme',
    desc: 'Accès à vie, disponible 24/7 sur ordinateur, tablette et mobile.',
    bg: 'bg-primary-100',
    color: 'text-primary-700',
  },
  {
    Icon: Award,
    title: 'Certificats reconnus',
    desc: 'Obtenez un certificat vérifiable à l’issue de chaque parcours.',
    bg: 'bg-accent-100',
    color: 'text-accent-700',
  },
  {
    Icon: MessageCircle,
    title: 'Support formateurs',
    desc: 'Posez vos questions dans l’espace Q&R, réponses sous 48h.',
    bg: 'bg-emerald-100',
    color: 'text-emerald-700',
  },
  {
    Icon: Smartphone,
    title: 'Application mobile',
    desc: 'Téléchargez vos leçons et apprenez même hors ligne.',
    bg: 'bg-violet-100',
    color: 'text-violet-700',
  },
  {
    Icon: Users,
    title: 'Communauté active',
    desc: 'Échangez avec des milliers d’apprenants passionnés.',
    bg: 'bg-cyan-100',
    color: 'text-cyan-700',
  },
  {
    Icon: Lock,
    title: 'Paiement sécurisé',
    desc: 'Paiement chiffré et garantie satisfait ou remboursé 14 jours.',
    bg: 'bg-rose-100',
    color: 'text-rose-700',
  },
];

export function WhyChooseUs() {
  return (
    <section
      className="bg-white dark:bg-neutral-950 py-14 sm:py-16"
      aria-labelledby="why-title"
    >
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-xs font-bold text-primary-600 uppercase tracking-wider">
            Nos engagements
          </p>
          <h2
            id="why-title"
            className="mt-1 text-2xl sm:text-3xl font-extrabold text-neutral-900 dark:text-white"
          >
            Pourquoi choisir BestÉpargne ?
          </h2>
          <p className="mt-3 text-sm sm:text-base text-neutral-600 dark:text-neutral-300">
            Nous conjuguons excellence pédagogique, technologie moderne et
            accompagnement humain pour rendre la formation accessible à tous.
          </p>
        </div>

        <ul className="mt-8 sm:mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {FEATURES.map((f) => (
            <li
              key={f.title}
              className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 rounded-2xl p-5 sm:p-6 hover:shadow-soft transition"
            >
              <div
                className={`w-11 h-11 rounded-xl ${f.bg} ${f.color} flex items-center justify-center mb-3`}
              >
                <f.Icon className="w-5 h-5" />
              </div>
              <h3 className="font-extrabold text-neutral-900">{f.title}</h3>
              <p className="mt-1.5 text-sm text-neutral-600 leading-relaxed">
                {f.desc}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
