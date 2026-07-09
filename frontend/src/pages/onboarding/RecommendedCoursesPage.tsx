/**
 * RecommendedCoursesPage.tsx — R24.5
 *
 * Affiche les cours recommandés au sortir de l'onboarding (ou depuis le
 * dashboard apprenant). Route : /recommended-courses
 *
 * Composition :
 *   - Header retour + accroche
 *   - LearnerProfileSummary (à droite desktop, top mobile)
 *   - Grille de CourseRecommendationCard scorées par `recommendCourses`
 *   - CTA "Aller à mon espace" en bas
 *
 * Si le profil n'est pas complété, on redirige vers l'onboarding.
 */
import { useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Search,
} from 'lucide-react';

import { usePublicCourses } from '@/hooks/queries';
import { useEnroll } from '@/hooks/queries';
import { useLearnerEnrollments } from '@/hooks/player';
import {
  useLearnerProfileAnswers,
  useDerivedLearnerProfile,
} from '@/stores/learner-profile';
import { recommendCourses } from '@/lib/course-recommender';
import { CourseRecommendationCard } from '@/components/onboarding/CourseRecommendationCard';
import { LearnerProfileSummary } from '@/components/onboarding/LearnerProfileSummary';
import { Spinner } from '@/components/ui/Spinner';

export default function RecommendedCoursesPage() {
  const navigate = useNavigate();
  const answers = useLearnerProfileAnswers();
  const profile = useDerivedLearnerProfile();

  const enrollMutation = useEnroll();

  // Grand pool de cours publiés — le tri est fait côté client
  const { data: courses, isLoading } = usePublicCourses({
    page_size: 30,
    sort: 'popular',
  });

  const { data: enrollments } = useLearnerEnrollments();
  const enrolledIds = useMemo(
    () => new Set((enrollments ?? []).map((e) => e.course.id)),
    [enrollments],
  );

  const recommendations = useMemo(() => {
    if (!courses?.results) return [];
    return recommendCourses(
      courses.results,
      profile,
      answers.level,
      answers.domains,
      { enrolledIds, limit: 12 },
    );
  }, [courses, profile, answers.level, answers.domains, enrolledIds]);

  // Si l'onboarding n'a jamais été démarré ET pas non plus dismissed → onboarding
  if (!profile.isCompleted && profile.maturityScore < 20) {
    return <Navigate to="/onboarding/learner" replace />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-50/60 via-white to-white dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-900 text-neutral-900 dark:text-neutral-100">
      <Helmet>
        <title>Vos cours recommandés — BestÉpargne Academy</title>
      </Helmet>

      {/* Header */}
      <header className="border-b border-neutral-100 dark:border-neutral-800 bg-white/70 dark:bg-neutral-900/70 backdrop-blur sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link
            to="/learn"
            className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
            Mon espace
          </Link>
          <Link
            to="/catalogue"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 hover:text-primary-800"
          >
            <Search className="w-3.5 h-3.5" />
            Parcourir tout le catalogue
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 sm:py-12">
        {/* Intro */}
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-widest text-primary-600 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            Recommandations personnalisées
          </p>
          <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold text-neutral-900 dark:text-white">
            Voici {recommendations.length} cours faits pour vous
          </h1>
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
            Sélection basée sur votre profil : {profile.archetypeLabel.toLowerCase()}.
            Vous pouvez affiner vos préférences à tout moment.
          </p>
        </div>

        {/* Contenu principal */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 lg:gap-8">
          {/* Colonne recommandations */}
          <div>
            {isLoading ? (
              <div className="py-16 flex justify-center">
                <Spinner size="xl" label="Sélection en cours…" />
              </div>
            ) : recommendations.length === 0 ? (
              <div className="text-center py-12 bg-white dark:bg-neutral-800 rounded-2xl border border-neutral-100 dark:border-neutral-700">
                <p className="text-neutral-600 dark:text-neutral-300 font-semibold">
                  Aucun cours ne correspond encore à vos critères.
                </p>
                <p className="mt-1 text-sm text-neutral-500">
                  Élargissez vos domaines ou explorez le catalogue.
                </p>
                <Link
                  to="/catalogue"
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold"
                >
                  Voir tout le catalogue
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {recommendations.map(({ course, score, reasons }) => (
                  <CourseRecommendationCard
                    key={course.id}
                    course={course}
                    score={score}
                    reasons={reasons}
                    onEnroll={(id) => {
                      enrollMutation.mutate(id, {
                        onSuccess: () => {
                          // Redirige vers le cours pour démarrer immédiatement
                          navigate(`/learn/courses/${id}`);
                        },
                      });
                    }}
                  />
                ))}
              </div>
            )}

            {/* CTA final */}
            {recommendations.length > 0 && (
              <div className="mt-8 flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700 rounded-2xl p-5">
                <div>
                  <p className="font-bold text-neutral-900 dark:text-white">
                    Prêt à démarrer ?
                  </p>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    Rejoignez votre espace apprenant et suivez votre
                    progression.
                  </p>
                </div>
                <Link
                  to="/learn"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold shadow-sm transition"
                >
                  Aller à mon espace
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            )}
          </div>

          {/* Colonne profil */}
          <aside className="lg:sticky lg:top-20 self-start">
            <LearnerProfileSummary />
          </aside>
        </div>
      </main>
    </div>
  );
}
