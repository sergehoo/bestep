/**
 * EnterpriseDomainPage.tsx — Vue détail d'un domaine de formation.
 *
 * Route : /entreprise/domaines/:slug
 *
 * Le programme de chaque formation est affiché SUR LA PAGE, déplié depuis
 * `training-domains.ts` : le prospect ne quitte jamais l'application. Aucune
 * fiche ne renvoie vers un site externe.
 *
 * Rien n'est rédigé pour la circonstance. Une formation dont la fiche
 * d'origine ne porte pas de contenu (`content: null`) est listée sans
 * programme, avec la mention correspondante : inventer des objectifs ou des
 * prérequis devant un prospect entreprise reviendrait à afficher des
 * engagements sans source.
 */
import { useCallback, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, ChevronDown, Send } from 'lucide-react';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { BusinessQuoteRequestModal } from '@/components/business/BusinessQuoteRequestModal';
import {
  findDomain,
  TRAINING_DOMAINS,
  type DomainTraining,
  type TrainingSection,
} from '@/data/training-domains';

/**
 * Les puces du site d'origine sont matérialisées par un « • » en tête de
 * ligne. On le retire du texte pour le rendre avec une vraie liste, sinon la
 * puce apparaît deux fois.
 */
function Lines({ lines }: { lines: string[] }) {
  return (
    <>
      {lines.map((line, i) =>
        line.startsWith('•') ? (
          <li
            key={i}
            className="ml-5 list-disc text-sm leading-relaxed text-neutral-600 marker:text-primary-400 dark:text-neutral-400"
          >
            {line.replace(/^•\s*/, '')}
          </li>
        ) : (
          <p
            key={i}
            className="mt-3 text-sm font-semibold leading-relaxed text-neutral-800 first:mt-0 dark:text-neutral-200"
          >
            {line}
          </p>
        ),
      )}
    </>
  );
}

function Sections({ sections }: { sections: TrainingSection[] }) {
  return (
    <>
      {sections.map((section) => (
        <div key={section.title} className="mt-6 first:mt-0">
          <h4 className="text-xs font-black uppercase tracking-[0.14em] text-primary-700 dark:text-primary-300">
            {section.title}
          </h4>
          <ul className="mt-2 space-y-1">
            <Lines lines={section.lines} />
          </ul>
        </div>
      ))}
    </>
  );
}

function TrainingItem({
  training,
  onQuote,
}: {
  training: DomainTraining;
  /** Reçoit l'intitulé de la formation, pour préremplir le devis avec elle
      plutôt qu'avec le domaine entier. */
  onQuote: (title: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const panelId = `formation-${training.slug}`;
  const { content } = training;

  return (
    <li className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <h3>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full items-center justify-between gap-4 p-5 text-left transition hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-600 dark:hover:bg-neutral-800/60"
        >
          <span>
            <span className="block text-base font-bold text-primary-900 dark:text-white">
              {training.title}
            </span>
            <span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">
              {content
                ? 'Objectifs, public concerné, prérequis et programme'
                : 'Programme détaillé communiqué avec le devis'}
            </span>
          </span>
          <ChevronDown
            className={`h-5 w-5 shrink-0 text-neutral-400 transition-transform ${
              open ? 'rotate-180' : ''
            }`}
            aria-hidden="true"
          />
        </button>
      </h3>

      {open && (
        <div
          id={panelId}
          className="border-t border-neutral-200 px-5 pb-6 pt-5 dark:border-neutral-800"
        >
          {content ? (
            <>
              <Sections sections={content.course} />

              {content.programme.length > 0 && (
                <div className="mt-8 rounded-xl bg-neutral-50 p-5 dark:bg-neutral-800/50">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-primary-900 dark:text-white">
                    Programme
                  </p>
                  <div className="mt-1">
                    <Sections sections={content.programme} />
                  </div>
                </div>
              )}

              {content.trainer.length > 0 && (
                <div className="mt-8">
                  <h4 className="text-xs font-black uppercase tracking-[0.14em] text-primary-700 dark:text-primary-300">
                    Formateur
                  </h4>
                  <div className="mt-2 space-y-3">
                    {content.trainer.map((p, i) => (
                      <p
                        key={i}
                        className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400"
                      >
                        {p}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
              Le programme détaillé de cette formation est construit avec vous
              en fonction du niveau et des objectifs de vos équipes. Demandez un
              devis : nous vous transmettons le déroulé complet.
            </p>
          )}

          <button
            type="button"
            onClick={() => onQuote(training.title)}
            className="mt-6 inline-flex items-center gap-2 rounded-xl border border-primary-200 bg-primary-50 px-4 py-2.5 text-sm font-bold text-primary-800 transition hover:bg-primary-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 dark:border-primary-800 dark:bg-primary-900/30 dark:text-primary-200 dark:hover:bg-primary-900/60"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            Réserver cette formation
          </button>
        </div>
      )}
    </li>
  );
}

export default function EnterpriseDomainPage() {
  const { slug } = useParams<{ slug: string }>();
  const domain = findDomain(slug);
  /** Intitulé à préremplir dans le devis : une formation précise depuis son
      accordéon, le domaine entier depuis l'appel à l'action de bas de page.
      `null` = modale fermée. */
  const [quoteFor, setQuoteFor] = useState<string | null>(null);
  const closeQuote = useCallback(() => setQuoteFor(null), []);

  // Slug inconnu : on renvoie vers l'espace entreprise plutôt que d'afficher
  // une page vide. `replace` évite de piéger le bouton retour sur une URL morte.
  if (!domain) return <Navigate to="/entreprise" replace />;

  const others = TRAINING_DOMAINS.filter((d) => d.slug !== domain.slug).slice(0, 3);

  return (
    <>
      <PublicHeader />

      <main className="bg-white dark:bg-neutral-950">
        {/* ── Hero ────────────────────────────────────────────────── */}
        {/*
          Contraste : les visuels de domaine sont des photos claires et
          chargées (écrans, bureaux). Le texte est blanc, il lui faut donc un
          fond sombre garanti, indépendant de la photo — d'où le voile plein
          par-dessus l'image, et non un simple dégradé partiel qui laissait le
          texte passer sur des zones presque blanches.
        */}
        <section className="relative min-h-[340px] overflow-hidden bg-primary-950">
          <img
            src={domain.image}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover opacity-45"
          />
          {/* Voile plein : garantit le contraste quelle que soit la photo. */}
          <div className="absolute inset-0 bg-primary-950/75" />
          {/* Dégradé latéral : assombrit davantage le côté qui porte le texte. */}
          <div className="absolute inset-0 bg-gradient-to-r from-primary-950 via-primary-950/80 to-primary-950/40" />

          <div className="container relative mx-auto max-w-5xl px-4 py-16 sm:py-24">
            <Link
              to="/entreprise"
              className="inline-flex items-center gap-2 text-sm font-semibold text-white/90 transition hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Espace entreprise
            </Link>

            <p className="mt-8 text-xs font-black uppercase tracking-[0.18em] text-accent-300">
              Domaine de formation
            </p>
            <h1 className="mt-3 max-w-3xl text-3xl font-black leading-tight text-white sm:text-5xl">
              {domain.title}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/90">
              {domain.description}
            </p>

            <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white ring-1 ring-inset ring-white/25">
              <BookOpen className="h-4 w-4" aria-hidden="true" />
              {/* Aucun catalogue publié sur ce domaine : on annonce le sur
                  mesure plutôt qu'un « 0 formation disponible ». */}
              {domain.trainings.length === 0
                ? 'Programmes sur mesure'
                : `${domain.trainings.length} formation${
                    domain.trainings.length > 1 ? 's' : ''
                  } disponible${domain.trainings.length > 1 ? 's' : ''}`}
            </p>
          </div>
        </section>

        {/* ── Formations du domaine ───────────────────────────────── */}
        {domain.trainings.length > 0 && (
          <section className="py-16 sm:py-20">
            <div className="container mx-auto max-w-5xl px-4">
              <h2 className="text-2xl font-black text-primary-900 dark:text-white sm:text-3xl">
                Les formations de ce domaine
              </h2>
              <p className="mt-3 max-w-2xl text-neutral-600 dark:text-neutral-400">
                Chaque programme est animé en présentiel ou à distance et
                s’adapte au niveau de vos équipes. Dépliez une formation pour
                consulter son contenu, ou demandez directement un devis.
              </p>

              {/* Pas d'animation `whileInView` ici : cette liste porte le
                  contenu des formations, pas de la décoration. Une révélation
                  au défilement qui ne se déclenche pas (onglet en arrière-plan,
                  capture, lecteur d'écran) laisserait la page apparemment
                  vide. */}
              <ul className="mt-10 space-y-3">
                {domain.trainings.map((t) => (
                  <TrainingItem key={t.slug} training={t} onQuote={setQuoteFor} />
                ))}
              </ul>
            </div>
          </section>
        )}

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
              onClick={() => setQuoteFor(domain.title)}
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

      {/* `initialCourseTitle` préremplit « Décrivez votre besoin » avec la
          formation choisie — ou le domaine — pour que la demande arrive
          qualifiée côté commercial. */}
      <BusinessQuoteRequestModal
        open={quoteFor !== null}
        initialPlan="ENTERPRISE"
        source={`enterprise-domain:${domain.slug}`}
        initialCourseTitle={quoteFor ?? domain.title}
        onClose={closeQuote}
      />
    </>
  );
}
