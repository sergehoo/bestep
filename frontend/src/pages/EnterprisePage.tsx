/**
 * Landing publique consacrée à l'offre de formation pour les entreprises.
 *
 * Le contenu adapte l'offre historique de formation.bestepargne.com au design
 * de la plateforme, tout en conservant le formulaire public de demande de devis.
 */
import { useCallback, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { TRAINING_DOMAINS } from '@/data/training-domains';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Award,
  BookOpenCheck,
  Building2,
  GraduationCap,
  Laptop,
  Mail,
  Presentation,
  Sparkles,
  Target,
  Users,
  Video,
} from 'lucide-react';

import {
  BusinessQuoteRequestModal,
  type QuotePlan,
} from '@/components/business/BusinessQuoteRequestModal';
import { PublicFooter } from '@/components/layout/PublicFooter';
import { PublicHeader } from '@/components/layout/PublicHeader';

const HERO_IMAGE =
  'https://formation.bestepargne.com/wp-content/uploads/2023/05/m2-scaled.jpeg';



const FORMATS = [
  {
    Icon: Presentation,
    title: 'Séminaires en présentiel',
    description:
      'Des sessions interactives dans vos locaux ou dans un espace spécialement réservé.',
  },
  {
    Icon: Video,
    title: 'Webinaires en direct',
    description:
      'Des formations à distance animées par nos experts sur des plateformes interactives.',
  },
  {
    Icon: Laptop,
    title: 'Formations en ligne',
    description:
      'Des parcours accessibles sans date limite pour progresser selon votre propre rythme.',
  },
  {
    Icon: Target,
    title: 'Modules sur mesure',
    description:
      'Des contenus conçus à partir de vos métiers, de vos objectifs et de vos contraintes.',
  },
];

const TRUST_POINTS = [
  {
    Icon: BookOpenCheck,
    title: 'Expertise technique et sectorielle',
    description:
      'Nos formations développent les compétences clés de l’industrie financière : gestion des risques, gouvernance, conformité, banque et gestion d’actifs.',
    image:
      'https://formation.bestepargne.com/wp-content/uploads/2023/07/sean-pollock-PhYq704ffdA-unsplash-scaled.jpg',
  },
  {
    Icon: Sparkles,
    title: 'Pédagogie simple et innovante',
    description:
      'En présentiel comme en ligne, nous privilégions des méthodes claires, pratiques et soutenues par des outils numériques actuels.',
    image:
      'https://formation.bestepargne.com/wp-content/uploads/2023/07/sincerely-media-dGxOgeXAXm8-unsplash-1-scaled.jpg',
  },
  {
    Icon: Award,
    title: 'Formateurs reconnus et certifiés',
    description:
      'Nos intervenants associent plusieurs années d’expérience métier à des parcours académiques et professionnels exigeants.',
    image:
      'https://formation.bestepargne.com/wp-content/uploads/2023/07/charles-forerunner-3fPXt37X6UQ-unsplash-scaled.jpg',
  },
];

const FAQ = [
  {
    question: 'Quels types de formations proposez-vous ?',
    answer:
      'Nous proposons des séminaires en présentiel, des webinaires et des cours en ligne accessibles à votre rythme, dans les principaux domaines de la banque, de la finance d’entreprise, de l’investissement et de la gestion d’actifs.',
  },
  {
    question: 'Quelle est la durée des formations ?',
    answer:
      'Les séminaires et webinaires sont généralement organisés sur un ou deux jours minimum. Les formations en ligne restent accessibles sans date limite afin que chaque participant avance à son rythme.',
  },
  {
    question: 'Où les formations sont-elles dispensées ?',
    answer:
      'Les séminaires peuvent se tenir dans vos locaux ou dans un lieu réservé par Best-Épargne. Les webinaires sont diffusés sur une plateforme interactive accessible avec un lien de connexion.',
  },
];

export default function EnterprisePage() {
  const [quoteRequest, setQuoteRequest] = useState<{
    plan: QuotePlan;
    source: string;
  } | null>(null);

  const openQuoteRequest = (plan: QuotePlan, source: string) => {
    setQuoteRequest({ plan, source });
  };
  const closeQuoteRequest = useCallback(() => setQuoteRequest(null), []);

  return (
    <div className="min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <Helmet>
        <title>Formations en banque, investissement et finance | Best-Épargne</title>
        <meta
          name="description"
          content="Développez les compétences de vos équipes avec nos formations en banque, finance, investissement, gestion des risques et conformité."
        />
        <link rel="canonical" href="https://ayo-group.com/entreprise" />
        <meta
          property="og:title"
          content="Best-Épargne Formation — Banque, investissement et finance"
        />
        <meta
          property="og:description"
          content="Formations en présentiel, webinaires, parcours en ligne et modules sur mesure pour les entreprises."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://ayo-group.com/entreprise" />
      </Helmet>

      <PublicHeader />

      <main>
        <section
          className="relative isolate min-h-[640px] overflow-hidden bg-primary-950 bg-cover bg-center text-white"
          style={{
            backgroundImage: `linear-gradient(90deg, rgba(8, 34, 71, 0.96) 0%, rgba(8, 34, 71, 0.78) 52%, rgba(8, 34, 71, 0.48) 100%), url("${HERO_IMAGE}")`,
          }}
        >
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_78%_25%,rgba(245,158,11,0.2),transparent_34%)]" />
          <div className="container mx-auto flex min-h-[640px] max-w-6xl items-center px-4 py-20 sm:py-28">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55 }}
              className="max-w-3xl"
            >
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-extrabold uppercase tracking-[0.18em] backdrop-blur-sm">
                <GraduationCap className="h-4 w-4 text-accent-300" />
                Best-Épargne Formation
              </span>
              <h1 className="mt-6 text-4xl font-black leading-[1.08] sm:text-6xl lg:text-7xl">
                Formation en banque,
                <span className="block text-accent-300">investissement et finance</span>
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-relaxed text-white/85 sm:text-xl">
                Donnez à vos équipes les compétences nécessaires pour progresser,
                innover et se distinguer dans un environnement financier en constante
                évolution.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <a
                  href="#domaines"
                  className="inline-flex items-center gap-2 rounded-xl bg-accent-400 px-6 py-3.5 text-sm font-extrabold text-neutral-950 shadow-lift transition hover:bg-accent-300 sm:text-base"
                >
                  Découvrir nos formations
                  <ArrowRight className="h-4 w-4" />
                </a>
                <button
                  type="button"
                  onClick={() => openQuoteRequest('DEMO', 'enterprise_training_hero')}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-6 py-3.5 text-sm font-extrabold text-white backdrop-blur-sm transition hover:bg-white/20 sm:text-base"
                >
                  <Mail className="h-4 w-4" />
                  Demander des informations
                </button>
              </div>
              <p className="mt-4 text-sm font-medium text-white/65">
                Présentiel · Webinaires · En ligne · Formations sur mesure
              </p>
            </motion.div>
          </div>
        </section>

        <section className="bg-accent-400 py-9 text-neutral-950">
          <div className="container mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 px-4 text-center sm:flex-row sm:text-left">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-primary-900/70">
                Un projet de formation ?
              </p>
              <h2 className="mt-1 text-xl font-black sm:text-2xl">
                Besoin de conseils ou d’informations sur nos formations ?
              </h2>
            </div>
            <button
              type="button"
              onClick={() => openQuoteRequest('UNSURE', 'enterprise_training_advice')}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary-900 px-6 py-3 text-sm font-extrabold text-white transition hover:bg-primary-800"
            >
              Contactez-nous
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>

        <section id="domaines" className="scroll-mt-24 py-16 sm:py-24">
          <div className="container mx-auto max-w-6xl px-4">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-accent-600 dark:text-accent-400">
                Développez vos expertises
              </p>
              <h2 className="mt-3 text-3xl font-black text-primary-900 dark:text-white sm:text-5xl">
                Nos domaines de formation
              </h2>
              <p className="mt-4 text-neutral-600 dark:text-neutral-400">
                Des parcours conçus pour répondre aux exigences opérationnelles,
                réglementaires et stratégiques des métiers financiers.
              </p>
            </div>

            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {TRAINING_DOMAINS.map((domain, index) => (
                <motion.article
                  key={domain.slug}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ duration: 0.4, delay: index * 0.04 }}
                  className="group relative min-h-[300px] overflow-hidden rounded-2xl bg-primary-950 shadow-soft"
                >
                  <img
                    src={domain.image}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover grayscale transition duration-500 group-hover:scale-105 group-hover:grayscale-0"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-primary-950 via-primary-950/75 to-primary-950/20" />
                  <Link
                    to={`/entreprise/domaines/${domain.slug}`}
                    className="relative flex min-h-[300px] flex-col justify-end p-5 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    <h3 className="text-lg font-black leading-tight">{domain.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-white/75">
                      {domain.description}
                    </p>
                    <span className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-accent-300">
                      Voir le détail
                      <span aria-hidden="true">→</span>
                    </span>
                  </Link>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-neutral-50 py-16 dark:bg-neutral-900 sm:py-24">
          <div className="container mx-auto max-w-6xl px-4">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-accent-600 dark:text-accent-400">
                Une pédagogie adaptée
              </p>
              <h2 className="mt-3 text-3xl font-black text-primary-900 dark:text-white sm:text-5xl">
                Choisissez le format qui vous convient
              </h2>
            </div>
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {FORMATS.map(({ Icon, title, description }) => (
                <article
                  key={title}
                  className="rounded-2xl border border-neutral-100 bg-white p-6 shadow-soft dark:border-neutral-700 dark:bg-neutral-800"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-5 text-lg font-black text-neutral-900 dark:text-white">
                    {title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                    {description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-24">
          <div className="container mx-auto max-w-6xl px-4">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-accent-600 dark:text-accent-400">
                Notre engagement
              </p>
              <h2 className="mt-3 text-3xl font-black text-primary-900 dark:text-white sm:text-5xl">
                Pourquoi nous faire confiance ?
              </h2>
            </div>
            <div className="mt-12 grid gap-6 lg:grid-cols-3">
              {TRUST_POINTS.map(({ Icon, title, description, image }) => (
                <article
                  key={title}
                  className="overflow-hidden rounded-2xl border border-neutral-100 bg-white shadow-soft dark:border-neutral-700 dark:bg-neutral-800"
                >
                  <div className="relative h-52 overflow-hidden bg-neutral-200">
                    <img
                      src={image}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover grayscale"
                    />
                    <div className="absolute inset-0 bg-primary-950/15" />
                  </div>
                  <div className="p-6">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-100 text-accent-700 dark:bg-accent-900/40 dark:text-accent-300">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 text-xl font-black text-neutral-900 dark:text-white">
                      {title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                      {description}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="overflow-hidden bg-primary-950 py-16 text-white sm:py-24">
          <div className="container mx-auto grid max-w-6xl items-center gap-10 px-4 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="relative">
              <div className="absolute -inset-5 rounded-3xl bg-accent-400/20 blur-2xl" />
              <div className="relative rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-sm sm:p-10">
                <Building2 className="h-12 w-12 text-accent-300" />
                <p className="mt-8 text-2xl font-black leading-snug sm:text-3xl">
                  Acquérir des compétences pour progresser dans le monde de la
                  finance.
                </p>
              </div>
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-accent-300">
                À propos
              </p>
              <h2 className="mt-3 text-3xl font-black sm:text-5xl">
                Des savoirs actuels transmis par des experts de terrain
              </h2>
              <p className="mt-5 text-base leading-relaxed text-white/75 sm:text-lg">
                Best-Épargne Formation accompagne les professionnels qui souhaitent
                approfondir leurs connaissances en banque, réglementation, gestion de
                fonds, investissement et patrimoine. Nos parcours associent expertise
                métier, cas pratiques et outils pédagogiques modernes.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => openQuoteRequest('ENTERPRISE', 'enterprise_training_about')}
                  className="inline-flex items-center gap-2 rounded-xl bg-accent-400 px-6 py-3.5 text-sm font-extrabold text-neutral-950 transition hover:bg-accent-300"
                >
                  Construire un programme sur mesure
                  <ArrowRight className="h-4 w-4" />
                </button>
                <Link
                  to="/catalogue"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-6 py-3.5 text-sm font-extrabold text-white transition hover:bg-white/10"
                >
                  Explorer le catalogue
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-neutral-50 py-16 dark:bg-neutral-900 sm:py-24">
          <div className="container mx-auto max-w-4xl px-4">
            <div className="text-center">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-accent-600 dark:text-accent-400">
                Questions fréquentes
              </p>
              <h2 className="mt-3 text-3xl font-black text-primary-900 dark:text-white sm:text-5xl">
                Tout savoir sur nos formations
              </h2>
            </div>
            <div className="mt-10 space-y-4">
              {FAQ.map(({ question, answer }, index) => (
                <details
                  key={question}
                  open={index === 0}
                  className="group rounded-2xl border border-neutral-100 bg-white shadow-soft dark:border-neutral-700 dark:bg-neutral-800"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-5 p-5 font-extrabold text-neutral-900 dark:text-white sm:p-6">
                    {question}
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-100 text-xl text-accent-700 transition group-open:rotate-45 dark:bg-accent-900/40 dark:text-accent-300">
                      +
                    </span>
                  </summary>
                  <p className="px-5 pb-5 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400 sm:px-6 sm:pb-6">
                    {answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-gradient-to-br from-primary-800 via-primary-700 to-primary-950 py-16 text-white sm:py-20">
          <div className="container mx-auto max-w-4xl px-4 text-center">
            <Users className="mx-auto h-12 w-12 text-accent-300" />
            <h2 className="mt-5 text-3xl font-black sm:text-5xl">
              Faites grandir les compétences de vos équipes
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-white/75 sm:text-lg">
              Parlez-nous de vos métiers, de votre effectif et de vos objectifs.
              Nous vous proposerons le format et le programme les plus adaptés.
            </p>
            <button
              type="button"
              onClick={() => openQuoteRequest('UNSURE', 'enterprise_training_final')}
              className="mt-8 inline-flex items-center gap-2 rounded-xl bg-accent-400 px-7 py-3.5 text-sm font-extrabold text-neutral-950 shadow-lift transition hover:bg-accent-300 sm:text-base"
            >
              <Mail className="h-4 w-4" />
              Demander un devis
            </button>
          </div>
        </section>
      </main>

      <BusinessQuoteRequestModal
        open={quoteRequest !== null}
        initialPlan={quoteRequest?.plan}
        source={quoteRequest?.source}
        onClose={closeQuoteRequest}
      />
      <PublicFooter />
    </div>
  );
}
