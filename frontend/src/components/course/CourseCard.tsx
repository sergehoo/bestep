/**
 * CourseCard.tsx — Vignette cours réutilisable (R4.3).
 * Utilisée par catalogue, related, home populaires.
 */
import { Link } from 'react-router-dom';
import { Star, Users } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { formatPrice } from '@/lib/utils';
import type { PublicCourseListItem } from '@/lib/types';

interface CourseCardProps {
  course: PublicCourseListItem;
  compact?: boolean;
}

export function CourseCard({ course, compact = false }: CourseCardProps) {
  const priceLabel =
    course.pricing_type === 'FREE' ? 'Gratuit' : formatPrice(course.price, course.currency);

  return (
    <Link
      to={`/courses/${course.slug}`}
      className="group block bg-white border border-neutral-100 rounded-2xl overflow-hidden shadow-soft hover:shadow-lift hover:border-primary-200 transition"
    >
      {course.thumbnail_url ? (
        <img
          src={course.thumbnail_url}
          alt=""
          className="w-full aspect-video object-cover group-hover:scale-[1.02] transition"
          loading="lazy"
        />
      ) : (
        <div className="w-full aspect-video bg-gradient-to-br from-primary-100 to-primary-200" />
      )}
      <div className={compact ? 'p-3' : 'p-4'}>
        <div className="flex items-center gap-2 mb-2">
          {course.category && (
            <Badge variant="neutral" size="xs">
              {course.category.name}
            </Badge>
          )}
          {course.pricing_type === 'FREE' && (
            <Badge variant="success" size="xs">
              Gratuit
            </Badge>
          )}
        </div>
        <h3
          className={
            compact
              ? 'text-sm font-bold line-clamp-2 group-hover:text-primary-600 transition'
              : 'text-base font-bold line-clamp-2 group-hover:text-primary-600 transition'
          }
        >
          {course.title}
        </h3>
        {!compact && course.instructor && (
          <p className="text-xs text-neutral-500 mt-1">Par {course.instructor.full_name}</p>
        )}
        <div className="mt-3 flex items-center justify-between text-xs text-neutral-500">
          <div className="flex items-center gap-3">
            {Number(course.rating_avg) > 0 && (
              <span className="inline-flex items-center gap-1">
                <Star className="w-3.5 h-3.5 fill-accent-500 text-accent-500" />
                {Number(course.rating_avg).toFixed(1)} ({course.rating_count})
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              {course.enrolled_count}
            </span>
          </div>
          <span className="font-bold text-primary-600">{priceLabel}</span>
        </div>
      </div>
    </Link>
  );
}
