/**
 * CoursePremiumCard.tsx — Carte cours premium façon Udemy (R9.2).
 *
 * Features :
 *  - Grande image avec zoom subtil au hover
 *  - Overlay boutons "Voir" / "Aperçu" au hover
 *  - Badges (Nouveau, Best Seller, Promo, Gratuit, Certificat)
 *  - Meta : catégorie, niveau, durée, leçons, langue
 *  - Rating stars + count
 *  - Prix + ancien prix barré
 *  - Barre de progression si commencé
 */
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Clock,
  BookOpen,
  Users,
  Award,
  Globe,
  Play,
  Bookmark,
  Eye,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { RatingStars } from './RatingStars';
import { ProgressBar } from './ProgressBar';
import {
  deriveBadges,
  deriveLevel,
  deriveLanguage,
  derivePrice,
  getCourseProgress,
} from '@/lib/course-meta';
import { formatDuration, cn } from '@/lib/utils';
import type { PublicCourseListItem } from '@/lib/types';

interface CoursePremiumCardProps {
  course: PublicCourseListItem & {
    duration_sec?: number;
    lessons_count?: number;
    old_price?: string | number | null;
  };
  onPreview?: (course: PublicCourseListItem) => void;
  onSave?: (course: PublicCourseListItem) => void;
  className?: string;
  reducedMotion?: boolean;
}

export function CoursePremiumCard({
  course,
  onPreview,
  onSave,
  className,
  reducedMotion = false,
}: CoursePremiumCardProps) {
  const badges = deriveBadges(course);
  const level = deriveLevel(course.course_type);
  const language = deriveLanguage();
  const price = derivePrice(course);
  const progress = getCourseProgress(course.id);

  const durationSec = course.duration_sec ?? 0;
  const lessonsCount = course.lessons_count ?? 0;

  return (
    <motion.article
      whileHover={reducedMotion ? undefined : { y: -4 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={cn(
        'group relative bg-white border border-neutral-100 rounded-2xl overflow-hidden',
        'shadow-soft hover:shadow-lift hover:border-primary-200',
        'transition-shadow duration-300 flex flex-col',
        className,
      )}
    >
      {/* Image + overlay */}
      <Link
        to={`/courses/${course.slug}`}
        className="relative block overflow-hidden aspect-video"
        aria-label={`Voir le cours ${course.title}`}
      >
        {course.thumbnail_url ? (
          <img
            src={course.thumbnail_url}
            alt=""
            loading="lazy"
            className={cn(
              'w-full h-full object-cover',
              !reducedMotion && 'transition-transform duration-500 group-hover:scale-105',
            )}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary-100 via-primary-200 to-accent-100" />
        )}
        {/* Badges overlay top-left */}
        {badges.length > 0 && (
          <div className="absolute top-2 left-2 flex flex-wrap gap-1 max-w-[80%]">
            {badges.slice(0, 3).map((b) => (
              <Badge key={b.id} variant={b.variant} size="xs" className="shadow-sm">
                {b.label}
              </Badge>
            ))}
          </div>
        )}
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-neutral-900/0 group-hover:bg-neutral-900/40 transition-colors flex items-end justify-center pb-3 opacity-0 group-hover:opacity-100">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/95 text-neutral-900 text-xs font-bold shadow">
            <Play className="w-3.5 h-3.5 text-primary-600" />
            Voir le cours
          </span>
        </div>
      </Link>

      {/* Body */}
      <div className="p-3 sm:p-4 flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-2 text-[11px] text-neutral-500 mb-2">
          {course.category && (
            <>
              <span className="font-semibold text-primary-600">
                {course.category.name}
              </span>
              <span aria-hidden>·</span>
            </>
          )}
          <span>{level}</span>
        </div>

        <Link to={`/courses/${course.slug}`}>
          <h3 className="text-base font-bold line-clamp-2 group-hover:text-primary-700 transition">
            {course.title}
          </h3>
        </Link>

        {course.subtitle && (
          <p className="text-xs text-neutral-500 mt-1 line-clamp-2">
            {course.subtitle}
          </p>
        )}

        {course.instructor && (
          <p className="text-xs text-neutral-600 mt-2">
            <span className="text-neutral-400">Par</span>{' '}
            <span className="font-semibold">{course.instructor.full_name}</span>
          </p>
        )}

        {/* Rating */}
        <div className="mt-2">
          <RatingStars
            value={Number(course.rating_avg) || 0}
            count={course.rating_count}
            size="sm"
          />
        </div>

        {/* Meta grid */}
        <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-neutral-500">
          {durationSec > 0 && (
            <li className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDuration(durationSec)}
            </li>
          )}
          {lessonsCount > 0 && (
            <li className="inline-flex items-center gap-1">
              <BookOpen className="w-3 h-3" />
              {lessonsCount} leçon{lessonsCount > 1 ? 's' : ''}
            </li>
          )}
          <li className="inline-flex items-center gap-1">
            <Users className="w-3 h-3" />
            {course.enrolled_count} inscrits
          </li>
          <li className="inline-flex items-center gap-1">
            <Globe className="w-3 h-3" />
            {language}
          </li>
          {course.course_type === 'CERTIFIANTE' && (
            <li className="inline-flex items-center gap-1 text-primary-600">
              <Award className="w-3 h-3" />
              Certificat
            </li>
          )}
        </ul>

        {/* Progress */}
        {progress !== null && (
          <div className="mt-3">
            <ProgressBar
              value={progress}
              label={`Progression ${Math.round(progress)}%`}
              size="sm"
              color="primary"
            />
          </div>
        )}

        {/* Pricing */}
        <div className="mt-auto pt-3 flex items-end justify-between gap-3">
          <div>
            {price.isFree ? (
              <p className="text-lg font-extrabold text-emerald-600">Gratuit</p>
            ) : (
              <div className="flex items-baseline gap-2 flex-wrap">
                <p className="text-lg font-extrabold text-primary-700">
                  {price.main}
                </p>
                {price.old && (
                  <>
                    <p className="text-xs text-neutral-400 line-through">
                      {price.old}
                    </p>
                    {price.discountPercent && (
                      <Badge variant="danger" size="xs">
                        -{price.discountPercent}%
                      </Badge>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
            {onPreview && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  onPreview(course);
                }}
                className="p-2 rounded-lg hover:bg-neutral-100 text-neutral-500 hover:text-primary-600 transition"
                aria-label="Aperçu du cours"
              >
                <Eye className="w-4 h-4" />
              </button>
            )}
            {onSave && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  onSave(course);
                }}
                className="p-2 rounded-lg hover:bg-neutral-100 text-neutral-500 hover:text-accent-600 transition"
                aria-label="Ajouter à ma liste"
              >
                <Bookmark className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.article>
  );
}
