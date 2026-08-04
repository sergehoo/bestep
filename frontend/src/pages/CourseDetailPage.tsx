/**
 * CourseDetailPage.tsx — Fiche détail cours premium (R9.4 + R9.5).
 *
 * Layout :
 *  - Hero premium (breadcrumb, meta enrichis, instructor)
 *  - Sticky sections nav
 *  - 2 colonnes : contenu principal + sticky pricing card
 *  - Sections : Ce que vous apprendrez, Programme, Formateur, Avis, FAQ, Similaires
 *  - Modal preview leçon (héritée de R4)
 */
import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { Spinner } from '@/components/ui/Spinner';
// Premium components R9
import { CourseHero } from '@/components/premium/CourseHero';
import { StickyPricingCard } from '@/components/premium/StickyPricingCard';
import { StickySectionsNav } from '@/components/premium/StickySectionsNav';
import { LearnGrid } from '@/components/premium/LearnGrid';
import { CurriculumAccordion } from '@/components/premium/CurriculumAccordion';
import { InstructorCard } from '@/components/premium/InstructorCard';
import { FAQSection } from '@/components/premium/FAQSection';
import { RelatedCarousel } from '@/components/premium/RelatedCarousel';
// Reviews existants R4
import { ReviewsList } from '@/components/course/ReviewsList';
import { ReviewsSummaryCard } from '@/components/course/ReviewsSummaryCard';
import { ReviewForm } from '@/components/course/ReviewForm';
import { LessonPreviewModal } from '@/components/course/LessonPreviewModal';
// F1 — Modal de demande de devis pour les formations professionnelles
import { BusinessQuoteRequestModal } from '@/components/business/BusinessQuoteRequestModal';
// Hooks
import {
  usePublicCourseDetail,
  useEnroll,
  useCourseReviewsSummary,
} from '@/hooks/queries';
import { useIsAuthenticated } from '@/stores/auth';
import { useMyEnrollment } from '@/hooks/player';
import { sanitizeRichHtml } from '@/lib/sanitize';
import { deriveCourseCTA } from '@/lib/enrollment-state';
import { extractApiError } from '@/lib/utils';
import type { PublicLesson } from '@/lib/types';

const SECTIONS = [
  { id: 'section-overview', label: 'Présentation' },
  { id: 'section-curriculum', label: 'Programme' },
  { id: 'section-instructor', label: 'Formateur' },
  { id: 'section-reviews', label: 'Avis' },
  { id: 'section-faq', label: 'Questions' },
  { id: 'section-related', label: 'Similaires' },
];

export default function CourseDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { data: course, isLoading } = usePublicCourseDetail(slug);
  const { data: reviewsSummary } = useCourseReviewsSummary(slug);
  const isAuthed = useIsAuthenticated();
  const enroll = useEnroll();
  const { enrollment } = useMyEnrollment(course?.id);
  const [previewLessonId, setPreviewLessonId] = useState<number | null>(null);
  const [favorite, setFavorite] = useState(false);
  // F1 — Devis Pro : ouvre BusinessQuoteRequestModal pré-remplie
  const [quoteOpen, setQuoteOpen] = useState(false);

  if (isLoading && !course) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
        <PublicHeader />
        <div className="py-20 flex justify-center">
          <Spinner size="xl" label="Chargement du cours…" />
        </div>
      </div>
    );
  }

  if (!course || !slug) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
        <PublicHeader />
        <div className="text-center py-20">
          <h1 className="text-2xl font-bold">Cours introuvable</h1>
          <Link
            to="/catalogue"
            className="text-primary-600 mt-4 inline-block"
          >
            ← Retour au catalogue
          </Link>
        </div>
      </div>
    );
  }

  const handleEnroll = async () => {
    if (!isAuthed) {
      // F3 — Un visiteur qui clique sur « S'inscrire / Commencer la formation »
      // doit être invité à créer un compte (pattern Udemy). La page /register
      // expose un lien « J'ai déjà un compte » qui renvoie vers /login, donc
      // les deux chemins restent accessibles depuis cet écran.
      navigate(`/register?next=/courses/${slug}`);
      return;
    }
    try {
      await enroll.mutateAsync(course.id);
    } catch (err) {
      // Si l'utilisateur est déjà inscrit (409/400 selon backend), on
      // ne bloque pas : on ouvre directement le lecteur.
      const msg = extractApiError(err, "Impossible de s'inscrire à ce cours.");
      const alreadyEnrolled = /déjà|already/i.test(msg);
      if (!alreadyEnrolled) {
        alert(msg);
        return;
      }
    }
    // Ouvre le lecteur (R14)
    navigate(`/learn/courses/${course.id}/player`);
  };

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: course.title,
          text: course.subtitle || course.title,
          url,
        });
        return;
      } catch {
        /* user cancel */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* ignore */
    }
  };

  const handlePreviewLesson = (lesson: PublicLesson) => {
    setPreviewLessonId(lesson.id);
  };

  const ratingAvg = reviewsSummary?.average ?? Number(course.rating_avg) ?? 0;
  const ratingCount = reviewsSummary?.count ?? course.rating_count ?? 0;
  // F1 — Une formation professionnelle est tarifée sur devis. Le bouton
  // « S'inscrire » est remplacé par « Demander un devis » qui ouvre la modal
  // B2B pré-remplie avec la formation.
  const isProfessional = course.course_type === 'PROFESSIONNELLE';

  const pricingCard = (
    <StickyPricingCard
      course={course}
      isAuthed={isAuthed}
      isPending={enroll.isPending}
      onEnroll={handleEnroll}
      cta={deriveCourseCTA({
        isAuthed,
        enrollment,
        courseId: course.id,
        courseSlug: slug,
        isFree: course.pricing_type === 'FREE',
        isCertifying: course.course_type === 'CERTIFIANTE',
      })}
      onOpenPreview={() => {
        const firstPreview = course.sections
          .flatMap((s) => s.lessons)
          .find((l) => l.is_preview);
        if (firstPreview) setPreviewLessonId(firstPreview.id);
      }}
      onToggleFavorite={() => setFavorite((v) => !v)}
      isFavorite={favorite}
      onShare={handleShare}
      onRequestQuote={isProfessional ? () => setQuoteOpen(true) : undefined}
    />
  );

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <PublicHeader />

      {/* Pattern Udemy — la pricing card flotte à droite en absolu sur
          desktop dans un wrapper relatif qui englobe le hero + main.
          Sur mobile, elle est rendue en flux normal dans <main>. */}
      <div className="relative">
        <CourseHero
          course={course}
          ratingAvg={ratingAvg}
          ratingCount={ratingCount}
        />

        {/* Pricing card desktop (absolute overlay ancrée sur le hero,
            couvre TOUTE la hauteur du wrapper .relative pour que le
            `sticky` fonctionne pendant tout le scroll du contenu). */}
        <div
          aria-hidden="false"
          className="hidden lg:block absolute inset-0 pointer-events-none z-40"
        >
          <div className="container mx-auto px-4 max-w-6xl flex justify-end h-full">
            <div className="w-[360px] pointer-events-auto pt-8 h-full">
              <div className="sticky top-24">{pricingCard}</div>
            </div>
          </div>
        </div>

        <StickySectionsNav items={SECTIONS} offset={80} />

        <main className="container mx-auto px-4 max-w-6xl py-6 sm:py-8">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 lg:gap-8">
            {/* Pricing card mobile — visible <lg uniquement (l'overlay
                desktop est absolu et pris en charge au-dessus). */}
            <aside className="order-1 lg:hidden">
              {pricingCard}
            </aside>

            {/* Spacer desktop : occupe la colonne droite pour que la
                grille reste 2-colonnes ; la vraie card est absolue. */}
            <div aria-hidden className="hidden lg:block lg:order-2" />

            {/* Colonne gauche — contenu */}
            <article className="order-2 lg:order-1 space-y-8 sm:space-y-10 min-w-0">
            <section id="section-overview" className="scroll-mt-24 space-y-5 sm:space-y-6">
              <LearnGrid description={course.description} />

              {course.description && (
                <div>
                  <h2 className="text-base sm:text-lg font-extrabold text-neutral-900 mb-2 sm:mb-3">
                    Description
                  </h2>
                  <div
                    className="prose prose-sm sm:prose max-w-none text-neutral-800 prose-headings:font-extrabold prose-a:text-primary-600 prose-blockquote:border-l-4 prose-blockquote:border-primary-300 prose-blockquote:bg-primary-50/50 prose-blockquote:italic prose-img:rounded-xl prose-hr:my-6"
                    dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(course.description) }}
                  />
                </div>
              )}
            </section>

            <section id="section-curriculum" className="scroll-mt-24">
              <CurriculumAccordion
                sections={course.sections}
                slug={slug}
                onPreview={handlePreviewLesson}
              />
            </section>

            {course.instructor && (
              <section id="section-instructor" className="scroll-mt-24">
                <InstructorCard
                  instructor={course.instructor}
                  stats={{
                    avgRating: ratingAvg,
                    studentsCount: course.enrolled_count,
                  }}
                />
              </section>
            )}

            <section id="section-reviews" className="scroll-mt-24 space-y-3 sm:space-y-4">
              <h2 className="text-base sm:text-lg font-extrabold text-neutral-900">
                Avis des étudiants
              </h2>
              {reviewsSummary && reviewsSummary.count > 0 && (
                <ReviewsSummaryCard summary={reviewsSummary} />
              )}
              <ReviewForm courseId={course.id} courseSlug={slug} />
              <ReviewsList slug={slug} />
            </section>

            <section id="section-faq" className="scroll-mt-24">
              <FAQSection />
            </section>

            <section id="section-related" className="scroll-mt-24">
              <RelatedCarousel slug={slug} />
            </section>
          </article>
          </div>
        </main>
      </div>

      {/* Modal preview leçon */}
      <LessonPreviewModal
        slug={slug}
        lessonId={previewLessonId}
        onClose={() => setPreviewLessonId(null)}
      />

      {/* F1 — Modal devis pro (uniquement pour les formations
          professionnelles ; instanciée en permanence pour permettre
          l'animation de fermeture propre). */}
      {isProfessional && (
        <BusinessQuoteRequestModal
          open={quoteOpen}
          onClose={() => setQuoteOpen(false)}
          initialPlan="PRO"
          source="course_pro_detail"
          initialCourseTitle={course.title}
          initialCourseSlug={slug}
        />
      )}
    </div>
  );
}
