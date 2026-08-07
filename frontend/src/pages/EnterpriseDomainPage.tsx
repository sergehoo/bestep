/**
 * EnterpriseDomainPage.tsx — Vue détail d'un domaine de formation.
 *
 * Route : /entreprise/domaines/:slug
 *
 * Affiche ce qui existe réellement (intitulé, visuel, description, et les
 * formations du catalogue historique rattachées au domaine) puis propose de
 * réserver via le formulaire de demande de devis, prérempli avec le domaine.
 *
 * Aucun objectif pédagogique, prérequis ni programme n'est affiché : ce
 * contenu n'existe pas côté application, et l'inventer devant un prospect
 * entreprise reviendrait à afficher des engagements sans source. Chaque
 * formation renvoie donc vers sa fiche d'origine pour le détail.
 */
import { useCallback, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowUpRight, BookOpen, Send } from 'lucide-react';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { BusinessQuoteRequestModal } from '@/components/business/BusinessQuoteRequestModal';
import { findDomain, TRAINING_DOMAINS } from '@/data/training-domains';
import { prefersReducedMotion } from '@/lib/course-meta';

export default function EnterpriseDomainPage() {
  const { slug } = useParams<{ slug: string }>();
  const domain = findDomain(slug);
  const reducedMotion = prefersReducedMotion();
  const [quoteOpen, setQuoteOpen] = useState(false);
  const closeQuote = useCallback(() => setQuoteOpen(false), []);

  // Slug inconnu : on renvoie vers l'espace entreprise plutôt que d'afficher
  // une page vide. `replace` évite de piéger le bouton retour sur une URL morte.
  if (!domain) return <Navigate to="/entreprise" replace />;

  const others = TRAINING_DOMAINS.filter((d) => d.slug !== domain.slug).slice(0, 3);

  return (
    <>
      <PublicHeader />

      <main className="bg-white dark:bg-neutral-950">
        {/* ── Hero ────────────────────────────────────────────────── */}
        <section className="relative min-h-[340px] overflow-hidden bg-primary-950">
          <img
            src={domain.image}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-40"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-primary-950 via-primary-950/85 to-primary-950/40" />

          <div className="container relative mx-auto max-w-5xl px-4 py-16 sm:py-24">
            <Link
              to="/entreprise"
              className="inline-flex items-center gap-2 text-sm font-semibold text-white/80 transition hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Espace entreprise
            </Link>

            <p className="mt-8 text-xs font-black uppercase tracking-[0.18em] text-accent-400">
              Domaine de formation
            </p>
            <h1 className="mt-3 text-3xl font-black leading-tight text-white sm:text-5xl">
              {domain.title}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/75">
              {domain.description}
            </p>

            <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white">
              <BookOpen className="h-4 w-4" aria-hidden="true" />
              {domain.trainings.length} formation
              {domain.trainings.length > 1 ? 's' : ''} disponible
              {domain.trainings.length > 1 ? 's' : ''}
            </p>
          </div>
        </section>

        {/* ── Formations du domaine ───────────────────────────────── */}
        <section className="py-16 sm:py-20">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-black text-primary-900 dark:text-white sm:text-3xl">
              Les formations de ce domaine
            </h2>
            <p className="mt-3 max-w-2xl text-neutral-600 dark:text-neutral-400">
              Chaque programme est animé en présentiel ou à distance et
              s’adapte au niveau de vos équipes. Consultez le détail d’un
              programme ou demandez directement un devis.
            </p>

            <ul className="mt-10 space-y-3">
              {domain.trainings.map((t, i) => (
                <motion.li
                  key={t.href}
                  initial={reducedMotion ? undefined : { opacity: 0, y: 12 }}
                  whileInView={reducedMotion ? undefined : { opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ duration: 0.3, delay: i * 0.04 }}
                >
                  <a
                    href={t.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-start justify-between gap-4 rounded-2xl border border-neutral-200 bg-white p-5 transition hover:border-primary-300 hover:shadow-soft dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-primary-700"
                  >
                    <span className="text-base font-bold text-primary-900 dark:text-white">
                      {t.title}
                    </span>
                    <ArrowUpRight
                      className="mt-0.5 h-5 w-5 shrink-0 text-neutral-400 transition group-hover:text-primary-600"
                      aria-hidden="true"
                    />
                  </a>
                </motion.li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Appel à l'action ────────────────────────────────────── */}
        <section className="border-t border-neutral-200 bg-neutral-50 py-16 dark:border-neutral-800 dark:bg-neutral-900 sm:py-20">
          <div className="container mx-auto max-w-3xl px-4 text-center">
            <h2 className="text-2xl font-black text-primary-900 dark:text-white sm:text-3xl">
              Réserver une formation en {domain.title.toLowerCase()}
            </h2>
            <p className="mt-4 text-neutral-600 dark:text-neutral-400">
              Dites-nous votre effectif et vos objectifs : nous revenons vers
              vous sous un jour ouvré avec une proposition adaptée.
            </p>

            <button
              type="button"
              onClick={() => setQuoteOpen(true)}
              className="mt-8 inline-flex items-center gap-2 rounded-xl bg-primary-600 px-6 py-3.5 text-sm font-black text-white shadow-soft transition hover:bg-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
              Réserver cette formation
            </button>

            <p className="mt-4 text-xs text-neutral-500 dark:text-neutral-500">
              Devis personnalisé · Contrat encadré · Facturation entreprise
            </p>
          </div>
        </section>

        {/* ── Autres domaines ─────────────────────────────────────── */}
        {others.length > 0 && (
          <section className="py-16 sm:py-20">
            <div className="container mx-auto max-w-5xl px-4">
              <h2 className="text-xl font-black text-primary-900 dark:text-white">
                Autres domaines
              </h2>
              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                {others.map((d) => (
                  <Link
                    key={d.slug}
                    to={`/entreprise/domaines/${d.slug}`}
                    className="rounded-2xl border border-neutral-200 p-5 transition hover:border-primary-300 hover:shadow-soft dark:border-neutral-800 dark:hover:border-primary-700"
                  >
                    <span className="text-sm font-bold text-primary-900 dark:text-white">
                      {d.title}
                    </span>
                    <span className="mt-2 block text-xs text-neutral-500 dark:text-neutral-400">
                      {d.trainings.length} formation
                      {d.trainings.length > 1 ? 's' : ''}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>

      {/* `initialCourseTitle` préremplit « Décrivez votre besoin » avec le
          domaine, pour que la demande arrive qualifiée côté commercial. */}
      <BusinessQuoteRequestModal
        open={quoteOpen}
        initialPlan="ENTERPRISE"
        source={`enterprise-domain:${domain.slug}`}
        initialCourseTitle={domain.title}
        onClose={closeQuote}
      />
    </>
  );
}
