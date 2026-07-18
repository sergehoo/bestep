/**
 * CourseHero.tsx — Hero premium fiche cours façon Coursera (R9.4).
 */
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ChevronRight,
  Users,
  Clock,
  BookOpen,
  Globe,
  Award,
  RefreshCw,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { RatingStars } from './RatingStars';
import {
  deriveBadges,
  deriveLevel,
  deriveLanguage,
} from '@/lib/course-meta';
import { formatDuration } from '@/lib/utils';
import type { PublicCourseDetail } from '@/lib/types';

interface CourseHeroProps {
  course: PublicCourseDetail & { updated_at?: string; old_price?: string | null };
  ratingAvg: number;
  ratingCount: number;
}

function formatShortDate(iso?: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return null;
  }
}

export function CourseHero({ course, ratingAvg, ratingCount }: CourseHeroProps) {
  const badges = deriveBadges(course);
  const level = deriveLevel(course.course_type);
  const language = deriveLanguage();
  const publishedLabel = formatShortDate(course.published_at);
  const isCertifying = course.course_type === 'CERTIFIANTE';

  return (
    <section
      className="relative overflow-hidden bg-gradient-to-br from-neutral-900 via-primary-800 to-primary-600 text-white"
      aria-labelledby="course-title"
    >
      <div
        aria-hidden
        className="absolute inset-0 opacity-30 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 15% 20%, rgba(255,255,255,0.15) 0%, transparent 40%), radial-gradient(circle at 85% 80%, rgba(234,179,8,0.25) 0%, transparent 40%)',
        }}
      />

      <div className="relative container mx-auto px-4 max-w-6xl py-8 sm:py-10 lg:py-14 lg:pr-[400px]">
        {/* Breadcrumb */}
        <nav
          aria-label="Fil d'Ariane"
          className="text-[11px] sm:text-xs text-primary-100 flex items-center gap-1 sm:gap-1.5 flex-wrap min-w-0"
        >
          <Link to="/" className="hover:text-white shrink-0">Accueil</Link>
          <ChevronRight className="w-3 h-3 shrink-0" />
          <Link to="/catalogue" className="hover:text-white shrink-0">
            Catalogue
          </Link>
          {course.category && (
            <>
              <ChevronRight className="w-3 h-3 shrink-0" />
              <Link
                to={`/catalogue?category=${encodeURIComponent(course.category.slug)}`}
                className="hover:text-white truncate max-w-[45vw] sm:max-w-none"
              >
                {course.category.name}
              </Link>
            </>
          )}
        </nav>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="mt-4 max-w-3xl"
        >
          <div className="flex flex-wrap gap-1.5 mb-3">
            {badges.map((b) => (
              <Badge key={b.id} variant={b.variant} size="xs">
                {b.label}
              </Badge>
            ))}
          </div>
          <h1
            id="course-title"
            className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold leading-tight break-words"
          >
            {course.title}
          </h1>
          {course.subtitle && (
            <p className="mt-3 text-sm sm:text-base lg:text-lg text-primary-100">
              {course.subtitle}
            </p>
          )}

          {/* Meta ligne 1 : rating + inscrits */}
          <div className="mt-4 sm:mt-5 flex items-center gap-3 sm:gap-4 flex-wrap text-xs sm:text-sm">
            {ratingCount > 0 && (
              <span className="inline-flex items-center gap-2">
                <RatingStars
                  value={ratingAvg}
                  count={ratingCount}
                  size="md"
                  showValue
                />
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 text-primary-100">
              <Users className="w-4 h-4" />
              <span className="font-semibold text-white">
                {course.enrolled_count}
              </span>{' '}
              étudiants inscrits
            </span>
          </div>

          {/* Meta ligne 2 : durée, langue, level, certif, MAJ */}
          <ul className="mt-4 flex flex-wrap items-center gap-x-3 sm:gap-x-5 gap-y-2 text-[11px] sm:text-xs text-primary-100">
            {course.total_duration_sec > 0 && (
              <li className="inline-flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                {formatDuration(course.total_duration_sec)}
              </li>
            )}
            {course.lessons_count > 0 && (
              <li className="inline-flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5" />
                {course.lessons_count} leçons
              </li>
            )}
            <li className="inline-flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5" />
              {language}
            </li>
            <li className="inline-flex items-center gap-1.5">
              Niveau : <span className="font-semibold text-white">{level}</span>
            </li>
            {isCertifying && (
              <li className="inline-flex items-center gap-1.5 text-accent-300 font-semibold">
                <Award className="w-3.5 h-3.5" />
                Certifiant
              </li>
            )}
            {publishedLabel && (
              <li className="inline-flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" />
                Mis en ligne en {publishedLabel}
              </li>
            )}
          </ul>

          {/* Instructor */}
          {course.instructor && (
            <div className="mt-6 flex items-center gap-3">
              {course.instructor.avatar_url ? (
                <img
                  src={course.instructor.avatar_url}
                  alt=""
                  className="w-11 h-11 rounded-full object-cover ring-2 ring-white/30"
                />
              ) : (
                <div className="w-11 h-11 rounded-full bg-accent-400 text-primary-900 flex items-center justify-center font-extrabold ring-2 ring-white/30">
                  {course.instructor.full_name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="text-sm">
                <p className="text-primary-100">Enseigné par</p>
                <p className="font-semibold">{course.instructor.full_name}</p>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </section>
  );
}
