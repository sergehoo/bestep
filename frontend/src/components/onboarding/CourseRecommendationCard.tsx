/**
 * CourseRecommendationCard.tsx — R24.5
 *
 * Card riche affichée sur /recommended-courses. Contient :
 *   - Image (thumbnail_url ou placeholder)
 *   - Titre + formateur
 *   - Chips niveau + durée + note + apprenants
 *   - Badge certifiant si applicable
 *   - Raisons de la recommandation (top 2)
 *   - Bouton "Voir le cours" (détail) + "S'inscrire au cours" (enroll)
 */
import { Link } from 'react-router-dom';
import {
  Star,
  Users,
  ArrowRight,
  Award,
  BarChart3,
  BookOpen,
  Sparkles,
} from 'lucide-react';

import type { PublicCourseListItem } from '@/lib/types';

interface Props {
  course: PublicCourseListItem;
  reasons: string[];
  score: number;
  onEnroll?: (courseId: number) => void;
}

const LEVEL_FR: Record<string, string> = {
  BEGINNER: 'Débutant',
  INTERMEDIATE: 'Intermédiaire',
  ADVANCED: 'Avancé',
  ALL: 'Tous niveaux',
};

export function CourseRecommendationCard({
  course,
  reasons,
  score,
  onEnroll,
}: Props) {
  const rating = Number(course.rating_avg) || 0;
  const isCertifying = course.course_type === 'CERTIFIANTE';
  const isFree = course.pricing_type === 'FREE';

  return (
    <article className="group bg-white dark:bg-neutral-800 rounded-2xl border border-neutral-100 dark:border-neutral-700 overflow-hidden hover:shadow-lift transition-shadow flex flex-col">
      {/* Thumbnail */}
      <Link
        to={`/courses/${course.slug}`}
        className="relative block aspect-video bg-gradient-to-br from-primary-100 via-primary-200 to-accent-100 overflow-hidden"
      >
        {course.thumbnail_url ? (
          <img
            src={course.thumbnail_url}
            alt={course.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <BookOpen className="w-10 h-10 text-primary-700 opacity-40" />
          </div>
        )}

        {/* Score de reco (badge coin) */}
        {score >= 30 && (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/95 backdrop-blur text-[10px] font-extrabold text-primary-700 shadow-sm">
            <Sparkles className="w-3 h-3" />
            Reco {Math.min(99, Math.round(score * 1.1))}%
          </span>
        )}

        {/* Badge certifiant */}
        {isCertifying && (
          <span className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-400 text-primary-900 text-[10px] font-extrabold shadow-sm">
            <Award className="w-3 h-3" />
            Certifiant
          </span>
        )}
      </Link>

      <div className="p-4 flex-1 flex flex-col">
        {/* Catégorie */}
        {course.category && (
          <span className="inline-block px-2 py-0.5 text-[10px] font-bold bg-primary-100 text-primary-700 rounded uppercase tracking-wide self-start">
            {course.category.name}
          </span>
        )}

        {/* Titre */}
        <h3 className="mt-2 font-extrabold text-neutral-900 dark:text-white leading-snug line-clamp-2">
          <Link to={`/courses/${course.slug}`} className="hover:underline">
            {course.title}
          </Link>
        </h3>

        {/* Instructor */}
        {course.instructor && (
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 truncate">
            par {course.instructor.full_name}
          </p>
        )}

        {/* Meta */}
        <div className="mt-3 flex items-center gap-3 text-xs text-neutral-600 dark:text-neutral-300 flex-wrap">
          {course.level && (
            <span className="inline-flex items-center gap-1">
              <BarChart3 className="w-3.5 h-3.5" />
              {LEVEL_FR[course.level] ?? course.level}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Star className="w-3.5 h-3.5 fill-accent-500 text-accent-500" />
            <span className="font-bold">{rating.toFixed(1)}</span>
            <span className="text-neutral-400">
              ({course.rating_count})
            </span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            {formatCount(course.enrolled_count)}
          </span>
        </div>

        {/* Raisons */}
        {reasons.length > 0 && (
          <ul className="mt-3 space-y-1">
            {reasons.slice(0, 2).map((r) => (
              <li
                key={r}
                className="text-[11px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5"
              >
                <Sparkles className="w-3 h-3" />
                {r}
              </li>
            ))}
          </ul>
        )}

        {/* Prix + CTA */}
        <div className="mt-4 pt-4 border-t border-neutral-100 dark:border-neutral-700 flex items-center justify-between gap-2">
          <span
            className={
              'text-base font-extrabold ' +
              (isFree
                ? 'text-emerald-600'
                : 'text-primary-700 dark:text-primary-400')
            }
          >
            {isFree ? 'Gratuit' : `${formatPrice(course.price)} ${course.currency}`}
          </span>
          <div className="flex gap-1.5">
            <Link
              to={`/courses/${course.slug}`}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border border-neutral-200 dark:border-neutral-600 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition"
            >
              Voir
              <ArrowRight className="w-3 h-3" />
            </Link>
            {onEnroll && (
              <button
                type="button"
                onClick={() => onEnroll(course.id)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-primary-600 hover:bg-primary-700 text-white transition"
              >
                S'inscrire
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function formatCount(n: number | undefined): string {
  if (!n) return '0';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatPrice(p: string): string {
  const n = Number(p);
  if (Number.isNaN(n)) return p;
  return new Intl.NumberFormat('fr-FR').format(n);
}

export default CourseRecommendationCard;
