/**
 * InstructorCard.tsx — Section formateur premium (R9.5).
 */
import { Users, BookOpen, Star } from 'lucide-react';
import type { PublicInstructor } from '@/lib/types';

interface InstructorCardProps {
  instructor: PublicInstructor;
  stats?: {
    coursesCount?: number;
    studentsCount?: number;
    avgRating?: number;
  };
  bio?: string;
  title?: string;
}

export function InstructorCard({
  instructor,
  stats,
  bio,
  title,
}: InstructorCardProps) {
  return (
    <div className="bg-white border border-neutral-100 rounded-2xl p-4 sm:p-6">
      <h2 className="text-base sm:text-lg font-extrabold text-neutral-900 mb-3 sm:mb-4">
        À propos du formateur
      </h2>
      <div className="flex items-start gap-3 sm:gap-4">
        {instructor.avatar_url ? (
          <img
            src={instructor.avatar_url}
            alt=""
            className="w-14 h-14 sm:w-16 sm:h-16 rounded-full object-cover ring-2 ring-primary-100 shrink-0"
          />
        ) : (
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-extrabold text-lg sm:text-xl shrink-0">
            {instructor.full_name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-lg font-bold text-primary-700">
            {instructor.full_name}
          </p>
          {title && (
            <p className="text-sm text-neutral-500">{title}</p>
          )}
          <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-neutral-600">
            {stats?.avgRating != null && stats.avgRating > 0 && (
              <div className="inline-flex items-center gap-1">
                <Star className="w-3.5 h-3.5 fill-accent-500 text-accent-500" />
                <dt className="sr-only">Note moyenne</dt>
                <dd className="font-semibold text-neutral-800">
                  {stats.avgRating.toFixed(1)}
                </dd>
              </div>
            )}
            {stats?.studentsCount != null && (
              <div className="inline-flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                <dt className="sr-only">Étudiants</dt>
                <dd>
                  <span className="font-semibold text-neutral-800">
                    {stats.studentsCount}
                  </span>{' '}
                  étudiants
                </dd>
              </div>
            )}
            {stats?.coursesCount != null && (
              <div className="inline-flex items-center gap-1">
                <BookOpen className="w-3.5 h-3.5" />
                <dt className="sr-only">Cours</dt>
                <dd>
                  <span className="font-semibold text-neutral-800">
                    {stats.coursesCount}
                  </span>{' '}
                  cours
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>
      {bio && (
        <p className="mt-4 text-sm text-neutral-700 leading-relaxed whitespace-pre-line">
          {bio}
        </p>
      )}
    </div>
  );
}
