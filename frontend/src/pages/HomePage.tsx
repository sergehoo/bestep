/**
 * HomePage.tsx — Landing publique premium (R11.5).
 *
 * Composition :
 *  - Helmet SEO (OG + JSON-LD Organization)
 *  - LandingHero
 *  - StatsBar
 *  - CategoriesGrid
 *  - CourseRow x 3 (Populaires / Nouveautés / Gratuits)
 *  - WhyChooseUs
 *  - HowItWorks
 *  - FeaturedInstructors
 *  - TestimonialsCarousel
 *  - PartnersMarquee
 *  - CTABanner
 *  - PublicFooter
 */
import { useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { PublicFooter } from '@/components/layout/PublicFooter';
import { LandingHero } from '@/components/landing/LandingHero';
import { StatsBar } from '@/components/landing/StatsBar';
import { CategoriesGrid } from '@/components/landing/CategoriesGrid';
import { AudienceSpaces } from '@/components/landing/AudienceSpaces';
import { CourseRow } from '@/components/landing/CourseRow';
import { WhyChooseUs } from '@/components/landing/WhyChooseUs';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { FeaturedInstructors } from '@/components/landing/FeaturedInstructors';
import { TestimonialsCarousel } from '@/components/landing/TestimonialsCarousel';
import { PartnersMarquee } from '@/components/landing/PartnersMarquee';
import { CTABanner } from '@/components/landing/CTABanner';
import { usePublicCourses } from '@/hooks/queries';

export default function HomePage() {
  const { data: popular, isLoading: loadingPop } = usePublicCourses({
    sort: 'popular',
    page_size: 8,
  });
  const { data: recent, isLoading: loadingRec } = usePublicCourses({
    sort: 'recent',
    page_size: 8,
  });
  const { data: free, isLoading: loadingFree } = usePublicCourses({
    pricing: 'FREE',
    page_size: 8,
  });

  // JSON-LD Organization + WebSite pour SEO
  const jsonLd = useMemo(
    () =>
      JSON.stringify([
        {
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: 'BestÉpargne Academy',
          url: 'https://ayo-group.com',
          logo: 'https://ayo-group.com/logo.png',
          sameAs: [
            'https://facebook.com/bestepargne',
            'https://twitter.com/bestepargne',
            'https://linkedin.com/company/bestepargne',
          ],
        },
        {
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: 'BestÉpargne Academy',
          url: 'https://ayo-group.com',
          potentialAction: {
            '@type': 'SearchAction',
            target: 'https://ayo-group.com/catalogue?q={search_term_string}',
            'query-input': 'required name=search_term_string',
          },
        },
      ]),
    [],
  );

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100">
      <Helmet>
        <title>
          BestÉpargne Academy — Formations premium en finance & investissement
        </title>
        <meta
          name="description"
          content="Rejoignez des milliers d'apprenants et développez vos compétences financières avec les meilleurs experts. Certifications reconnues, accessible partout."
        />
        <link rel="canonical" href="https://ayo-group.com/" />
        <meta
          property="og:title"
          content="BestÉpargne Academy — Formations premium en finance"
        />
        <meta
          property="og:description"
          content="Formations certifiantes en investissement, épargne, immobilier et finance. Accessibles 24/7."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://ayo-group.com/" />
        <meta name="twitter:card" content="summary_large_image" />
        <script type="application/ld+json">{jsonLd}</script>
      </Helmet>

      <PublicHeader />

      <main>
        <LandingHero />
        <StatsBar />
        <CategoriesGrid />
        <AudienceSpaces />

        <CourseRow
          title="Les plus populaires"
          subtitle="Formations plébiscitées par notre communauté"
          seeAllHref="/catalogue?sort=popular"
          courses={popular?.results ?? []}
          isLoading={loadingPop}
        />

        <CourseRow
          title="Nouveautés"
          subtitle="Fraîchement publiées"
          seeAllHref="/catalogue?sort=recent"
          courses={recent?.results ?? []}
          isLoading={loadingRec}
        />

        <CourseRow
          title="Gratuits pour bien démarrer"
          subtitle="Accédez sans engagement à nos meilleurs cours gratuits"
          seeAllHref="/catalogue?pricing=FREE"
          courses={free?.results ?? []}
          isLoading={loadingFree}
          emptyLabel="De nouveaux cours gratuits arrivent bientôt."
        />

        <WhyChooseUs />
        <HowItWorks />
        <FeaturedInstructors />
        <TestimonialsCarousel />
        <PartnersMarquee />
        <CTABanner />
      </main>

      <PublicFooter />
    </div>
  );
}
