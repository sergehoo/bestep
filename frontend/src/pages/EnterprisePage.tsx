/**
 * EnterprisePage.tsx — Landing publique B2B (Espace Entreprise).
 *
 * Objectifs :
 *  - Convertir les RH / dirigeants qui arrivent depuis AudienceSpaces
 *  - Présenter les bénéfices concrets pour une équipe
 *  - Afficher une offre tarifaire claire (Starter / Pro / Enterprise)
 *  - Fournir un formulaire public de contact commercial sans inscription
 *
 * Cohérent avec le design de la HomePage (PublicHeader + PublicFooter,
 * palette primary/accent, motion framer, gradients dark-aware).
 */
import { useCallback, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Building2,
  BarChart3,
  Users,
  FileSpreadsheet,
  ShieldCheck,
  Zap,
  Award,
  Check,
  ArrowRight,
  Mail,
  Sparkles,
  Briefcase,
  Landmark,
  Cpu,
  GraduationCap,
} from 'lucide-react';

import { PublicHeader } from '@/components/layout/PublicHeader';
import { PublicFooter } from '@/components/layout/PublicFooter';
import {
  BusinessQuoteRequestModal,
  type QuotePlan,
} from '@/components/business/BusinessQuoteRequestModal';

// ─────────────────────────────────────────────────────────────
// Contenu
// ─────────────────────────────────────────────────────────────

const BENEFITS = [
  {
    Icon: BarChart3,
    title: 'Dashboard analytique',
    desc: 'Visualisez l\'engagement, les taux de complétion, les compétences acquises par équipe et par collaborateur en temps réel.',
  },
  {
    Icon: Users,
    title: 'Gestion des équipes',
    desc: 'Invitez vos collaborateurs, structurez-les en groupes, assignez des parcours de formation par département ou par rôle.',
  },
  {
    Icon: FileSpreadsheet,
    title: 'Rapports exportables',
    desc: 'Générez des rapports CSV/PDF détaillés — conformes aux exigences des audits internes et des OPCO.',
  },
  {
    Icon: ShieldCheck,
    title: 'Sécurité entreprise',
    desc: 'Authentification renforcée (2FA), journalisation complète des accès, hébergement conforme RGPD.',
  },
  {
    Icon: Zap,
    title: 'Onboarding en 24 h',
    desc: 'Notre équipe configure votre espace, importe vos collaborateurs et forme vos administrateurs — en un jour ouvré.',
  },
  {
    Icon: Award,
    title: 'Certifications reconnues',
    desc: 'Vos équipes obtiennent des certificats vérifiables (QR code + URL publique) attestés par nos experts métier.',
  },
];

const SECTORS = [
  {
    Icon: Landmark,
    title: 'Banques & institutions financières',
    desc: 'Conformité, KYC/AML, marchés financiers, gestion des risques.',
  },
  {
    Icon: Briefcase,
    title: 'Assurances & mutuelles',
    desc: 'Réglementation, souscription, gestion sinistres, distribution.',
  },
  {
    Icon: Cpu,
    title: 'Fintechs & startups',
    desc: 'Croissance produit, ops finance, levée de fonds, réglementation.',
  },
  {
    Icon: GraduationCap,
    title: 'Institutions publiques',
    desc: 'Formation continue, montée en compétences des agents, digital gov.',
  },
];

interface PricingTier {
  name: string;
  price: string;
  priceHint: string;
  description: string;
  features: string[];
  cta: string;
  ctaHref?: string;
  quotePlan?: QuotePlan;
  featured?: boolean;
}

const PRICING: PricingTier[] = [
  {
    name: 'Starter',
    price: 'Gratuit',
    priceHint: 'jusqu\'à 5 collaborateurs',
    description: 'Pour tester la plateforme en équipe restreinte.',
    features: [
      "Accès à tout le catalogue public",
      "Dashboard équipe basique",
      "Assignation manuelle de cours",
      "Support par e-mail",
    ],
    cta: 'Créer un compte',
    ctaHref: '/register?role=org_admin',
  },
  {
    name: 'Pro',
    price: 'Sur devis',
    priceHint: 'à partir de 50 collaborateurs',
    description: 'La formule la plus choisie par les PME et scale-ups.',
    features: [
      "Tout Starter, plus :",
      "Parcours personnalisés par équipe",
      "Rapports CSV/PDF automatisés",
      "Certificats brandés à votre logo",
      "Support prioritaire (SLA 24 h)",
      "Onboarding assisté",
    ],
    cta: 'Demander un devis',
    quotePlan: 'PRO',
    featured: true,
  },
  {
    name: 'Enterprise',
    price: 'Sur mesure',
    priceHint: 'à partir de 500 collaborateurs',
    description: 'Grandes organisations avec besoins avancés.',
    features: [
      "Tout Pro, plus :",
      "SSO (SAML / Google Workspace)",
      "Contenu sur mesure co-produit",
      "Hébergement dédié (option)",
      "Account manager dédié",
      "Audit sécurité annuel",
    ],
    cta: 'Contacter les ventes',
    quotePlan: 'ENTERPRISE',
  },
];

const STEPS = [
  {
    n: '01',
    title: 'Discovery call',
    desc: 'Nous comprenons vos objectifs, votre effectif et vos contraintes.',
  },
  {
    n: '02',
    title: 'Configuration',
    desc: 'Nous configurons votre espace, importons vos utilisateurs et paramétrons les parcours.',
  },
  {
    n: '03',
    title: 'Lancement',
    desc: 'Vos équipes reçoivent leurs accès et commencent à apprendre. Vous suivez les résultats en direct.',
  },
];

const FAQ = [
  {
    q: 'Puis-je tester avant de m\'engager ?',
    a: "Oui. La formule Starter est gratuite jusqu'à 5 collaborateurs, sans limite de durée. Elle vous permet de vérifier la qualité du contenu et la pertinence de la plateforme avant tout engagement.",
  },
  {
    q: 'Le contenu est-il adapté au marché africain ?',
    a: "Oui. Tous nos parcours finance sont conçus par des experts locaux (BCEAO, BRVM, UEMOA, réglementation CIMA…). Ils intègrent les cas réels des marchés d'Afrique francophone.",
  },
  {
    q: 'Est-ce que je peux créer mes propres contenus ?',
    a: "Absolument. Les formateurs internes de votre organisation peuvent créer, publier et suivre leurs propres cours, réservés à vos équipes ou publiés dans le catalogue global.",
  },
  {
    q: 'Comment sont facturés les collaborateurs supplémentaires ?',
    a: "En formule Pro, la facturation est mensuelle et proportionnelle au nombre de comptes actifs. En Enterprise, un tarif dégressif s'applique dès 500 collaborateurs.",
  },
];

// ─────────────────────────────────────────────────────────────
// Composant
// ─────────────────────────────────────────────────────────────

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
    <div className="min-h-screen bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100">
      <Helmet>
        <title>Best-Épargne pour les entreprises — Formez vos équipes</title>
        <meta
          name="description"
          content="Formations premium finance & investissement pour vos équipes. Dashboards analytiques, gestion des parcours, rapports exportables. Demandez une démo."
        />
        <link rel="canonical" href="https://ayo-group.com/entreprise" />
        <meta property="og:title" content="Best-Épargne pour les entreprises" />
        <meta
          property="og:description"
          content="La plateforme e-learning finance pour former vos équipes en Afrique francophone."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://ayo-group.com/entreprise" />
      </Helmet>

      <PublicHeader />

      <main>
        {/* ── HERO ───────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-gradient-to-br from-primary-700 via-primary-600 to-accent-500 text-white">
          <div className="absolute inset-0 opacity-10 pointer-events-none"
               style={{
                 backgroundImage:
                   'radial-gradient(circle at 20% 30%, rgba(255,255,255,0.4) 0%, transparent 40%), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.3) 0%, transparent 40%)',
               }}
          />
          <div className="relative container mx-auto px-4 max-w-6xl py-20 sm:py-28">
            <div className="max-w-3xl">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm text-xs font-bold uppercase tracking-widest">
                <Building2 className="w-3.5 h-3.5" />
                Espace Entreprise
              </span>
              <h1 className="mt-5 text-3xl sm:text-5xl lg:text-6xl font-extrabold leading-tight">
                Formez vos équipes.
                <br />
                <span className="text-accent-300">Mesurez l'impact.</span>
              </h1>
              <p className="mt-5 text-base sm:text-lg text-white/85 max-w-2xl leading-relaxed">
                Best-Épargne pour l'entreprise offre à vos collaborateurs les
                meilleures formations en finance, investissement et gestion — avec
                un tableau de bord temps réel pour piloter la montée en compétences
                de vos équipes.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => openQuoteRequest('DEMO', 'enterprise_hero_demo')}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-primary-700 font-bold text-sm sm:text-base hover:bg-neutral-100 transition shadow-lift"
                >
                  <Mail className="w-4 h-4" />
                  Demander une démo
                </button>
                <Link
                  to="/register?role=org_admin"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/10 backdrop-blur-sm border border-white/25 text-white font-bold text-sm sm:text-base hover:bg-white/20 transition"
                >
                  Créer un compte gratuit
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
              <p className="mt-4 text-xs text-white/70">
                Sans engagement · Réponse sous 24 h ouvrées
              </p>
            </div>
          </div>
        </section>

        {/* ── STATS ROW ──────────────────────────────────── */}
        <section className="bg-neutral-50 dark:bg-neutral-900 py-10 border-y border-neutral-100 dark:border-neutral-800">
          <div className="container mx-auto px-4 max-w-6xl grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
            {[
              { value: '250+', label: 'Cours disponibles' },
              { value: '30+', label: 'Formateurs experts' },
              { value: '12 500+', label: 'Apprenants actifs' },
              { value: '96 %', label: 'Taux de satisfaction' },
            ].map((s) => (
              <div key={s.label}>
                <p className="text-2xl sm:text-3xl font-extrabold text-primary-600 dark:text-primary-400 tabular-nums">
                  {s.value}
                </p>
                <p className="mt-1 text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 font-semibold">
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── BÉNÉFICES ──────────────────────────────────── */}
        <section className="py-16 sm:py-20">
          <div className="container mx-auto px-4 max-w-6xl">
            <div className="max-w-2xl mx-auto text-center">
              <p className="text-xs font-bold text-primary-600 uppercase tracking-widest">
                Ce que vous obtenez
              </p>
              <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold text-neutral-900 dark:text-white">
                Une plateforme conçue pour l'entreprise
              </h2>
              <p className="mt-3 text-neutral-600 dark:text-neutral-400 leading-relaxed">
                Toutes les fonctionnalités qu'il vous faut pour piloter la
                formation de vos équipes, sans complexité inutile.
              </p>
            </div>
            <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {BENEFITS.map((b, i) => (
                <motion.div
                  key={b.title}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: i * 0.05 }}
                  viewport={{ once: true }}
                  className="p-6 rounded-2xl bg-white dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700 shadow-soft hover:shadow-lift transition"
                >
                  <div className="w-11 h-11 rounded-xl bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 flex items-center justify-center mb-4">
                    <b.Icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-extrabold text-neutral-900 dark:text-white">
                    {b.title}
                  </h3>
                  <p className="mt-1.5 text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                    {b.desc}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── SECTEURS ───────────────────────────────────── */}
        <section className="py-16 sm:py-20 bg-neutral-50 dark:bg-neutral-900">
          <div className="container mx-auto px-4 max-w-6xl">
            <div className="max-w-2xl mx-auto text-center">
              <p className="text-xs font-bold text-primary-600 uppercase tracking-widest">
                Ils nous font confiance
              </p>
              <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold text-neutral-900 dark:text-white">
                Adaptée à votre secteur
              </h2>
              <p className="mt-3 text-neutral-600 dark:text-neutral-400 leading-relaxed">
                Que vous soyez une banque, une compagnie d'assurance ou une
                fintech, notre catalogue et nos parcours répondent aux enjeux
                de votre métier.
              </p>
            </div>
            <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {SECTORS.map((s) => (
                <div
                  key={s.title}
                  className="p-6 rounded-2xl bg-white dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700"
                >
                  <div className="w-11 h-11 rounded-xl bg-accent-100 dark:bg-accent-900/40 text-accent-700 dark:text-accent-300 flex items-center justify-center mb-4">
                    <s.Icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-extrabold text-neutral-900 dark:text-white">
                    {s.title}
                  </h3>
                  <p className="mt-1.5 text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                    {s.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── COMMENT ÇA MARCHE ──────────────────────────── */}
        <section className="py-16 sm:py-20">
          <div className="container mx-auto px-4 max-w-6xl">
            <div className="max-w-2xl mx-auto text-center">
              <p className="text-xs font-bold text-primary-600 uppercase tracking-widest">
                Simple et rapide
              </p>
              <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold text-neutral-900 dark:text-white">
                Lancez-vous en 3 étapes
              </h2>
            </div>
            <ol className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-5">
              {STEPS.map((step, i) => (
                <li
                  key={step.n}
                  className="relative p-6 rounded-2xl bg-white dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700 shadow-soft"
                >
                  <span className="absolute -top-4 left-6 inline-flex items-center justify-center w-10 h-10 rounded-xl bg-primary-600 text-white font-extrabold text-lg shadow-lift">
                    {step.n}
                  </span>
                  <h3 className="mt-4 font-extrabold text-neutral-900 dark:text-white">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                    {step.desc}
                  </p>
                  {i < STEPS.length - 1 && (
                    <ArrowRight
                      className="hidden sm:block absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 text-primary-400"
                      aria-hidden="true"
                    />
                  )}
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── TARIFICATION ───────────────────────────────── */}
        <section className="py-16 sm:py-20 bg-neutral-50 dark:bg-neutral-900">
          <div className="container mx-auto px-4 max-w-6xl">
            <div className="max-w-2xl mx-auto text-center">
              <p className="text-xs font-bold text-primary-600 uppercase tracking-widest">
                Tarification transparente
              </p>
              <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold text-neutral-900 dark:text-white">
                Un plan pour chaque taille d'équipe
              </h2>
              <p className="mt-3 text-neutral-600 dark:text-neutral-400 leading-relaxed">
                Démarrez gratuitement, évoluez à votre rythme.
              </p>
            </div>
            <div className="mt-10 grid grid-cols-1 lg:grid-cols-3 gap-5">
              {PRICING.map((tier) => (
                <div
                  key={tier.name}
                  className={
                    'relative p-6 sm:p-8 rounded-3xl border shadow-soft transition ' +
                    (tier.featured
                      ? 'bg-gradient-to-br from-primary-600 to-primary-800 text-white border-primary-500 shadow-lift lg:scale-105 lg:-my-2'
                      : 'bg-white dark:bg-neutral-800 border-neutral-100 dark:border-neutral-700')
                  }
                >
                  {tier.featured && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-3 py-1 rounded-full bg-accent-400 text-neutral-900 text-xs font-extrabold uppercase tracking-widest shadow-lift">
                      <Sparkles className="w-3.5 h-3.5" />
                      Populaire
                    </span>
                  )}
                  <h3
                    className={
                      'text-xl font-extrabold '
                      + (tier.featured ? 'text-white' : 'text-neutral-900 dark:text-white')
                    }
                  >
                    {tier.name}
                  </h3>
                  <p
                    className={
                      'mt-1 text-sm '
                      + (tier.featured ? 'text-white/85' : 'text-neutral-600 dark:text-neutral-400')
                    }
                  >
                    {tier.description}
                  </p>
                  <div className="mt-5">
                    <p
                      className={
                        'text-3xl sm:text-4xl font-extrabold '
                        + (tier.featured ? 'text-white' : 'text-neutral-900 dark:text-white')
                      }
                    >
                      {tier.price}
                    </p>
                    <p
                      className={
                        'text-xs mt-1 '
                        + (tier.featured ? 'text-white/70' : 'text-neutral-500 dark:text-neutral-400')
                      }
                    >
                      {tier.priceHint}
                    </p>
                  </div>
                  <ul className="mt-6 space-y-2.5">
                    {tier.features.map((f) => (
                      <li
                        key={f}
                        className={
                          'flex items-start gap-2 text-sm '
                          + (tier.featured
                            ? 'text-white/90'
                            : 'text-neutral-700 dark:text-neutral-300')
                        }
                      >
                        <Check
                          className={
                            'w-4 h-4 shrink-0 mt-0.5 '
                            + (tier.featured ? 'text-accent-300' : 'text-emerald-500')
                          }
                        />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-7">
                    {tier.ctaHref ? (
                      <Link
                        to={tier.ctaHref}
                        className={
                          'w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition '
                          + (tier.featured
                            ? 'bg-white text-primary-700 hover:bg-neutral-100'
                            : 'bg-primary-600 hover:bg-primary-700 text-white')
                        }
                      >
                        {tier.cta}
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          openQuoteRequest(
                            tier.quotePlan ?? 'UNSURE',
                            `enterprise_pricing_${tier.name.toLowerCase()}`,
                          )
                        }
                        className={
                          'w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition '
                          + (tier.featured
                            ? 'bg-white text-primary-700 hover:bg-neutral-100'
                            : 'bg-primary-600 hover:bg-primary-700 text-white')
                        }
                      >
                        <Mail className="w-4 h-4" />
                        {tier.cta}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FAQ ────────────────────────────────────────── */}
        <section className="py-16 sm:py-20">
          <div className="container mx-auto px-4 max-w-3xl">
            <div className="text-center">
              <p className="text-xs font-bold text-primary-600 uppercase tracking-widest">
                Questions fréquentes
              </p>
              <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold text-neutral-900 dark:text-white">
                Vous avez une question ?
              </h2>
            </div>
            <dl className="mt-10 space-y-4">
              {FAQ.map((f) => (
                <details
                  key={f.q}
                  className="group rounded-2xl bg-white dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700 open:shadow-soft"
                >
                  <summary className="cursor-pointer list-none p-5 flex items-start justify-between gap-4">
                    <dt className="font-bold text-neutral-900 dark:text-white text-sm sm:text-base">
                      {f.q}
                    </dt>
                    <ArrowRight
                      aria-hidden="true"
                      className="w-4 h-4 text-primary-500 shrink-0 mt-1 rotate-90 group-open:rotate-[270deg] transition-transform"
                    />
                  </summary>
                  <dd className="px-5 pb-5 text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                    {f.a}
                  </dd>
                </details>
              ))}
            </dl>
          </div>
        </section>

        {/* ── CTA FINAL ──────────────────────────────────── */}
        <section className="py-16 sm:py-20 bg-gradient-to-br from-primary-700 via-primary-600 to-accent-500 text-white">
          <div className="container mx-auto px-4 max-w-4xl text-center">
            <h2 className="text-3xl sm:text-4xl font-extrabold">
              Prêt à transformer vos équipes ?
            </h2>
            <p className="mt-4 text-white/85 text-base sm:text-lg max-w-2xl mx-auto">
              Réservez une démo de 30 minutes avec l'un de nos consultants.
              Vous verrez concrètement comment nos parcours peuvent s'intégrer à
              votre plan de formation.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => openQuoteRequest('DEMO', 'enterprise_final_demo')}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-primary-700 font-bold text-sm sm:text-base hover:bg-neutral-100 transition shadow-lift"
              >
                <Mail className="w-4 h-4" />
                Réserver une démo
              </button>
              <Link
                to="/catalogue"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/10 backdrop-blur-sm border border-white/25 text-white font-bold text-sm sm:text-base hover:bg-white/20 transition"
              >
                Explorer le catalogue
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
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
