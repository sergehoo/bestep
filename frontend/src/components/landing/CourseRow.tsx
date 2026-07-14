/**
 * CourseRow.tsx — Rangée horizontale de cours façon Netflix (R11.2).
 * Scroll horizontal snap avec boutons ← → sur desktop, swipe mobile natif.
 */
import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CoursePremiumCard } from '@/components/premium/CoursePremiumCard';
import { CourseCardSkeleton } from '@/components/premium/CourseCardSkeleton';
import { prefersReducedMotion } from '@/lib/course-meta';
import { cn } from '@/lib/utils';
import type { PublicCourseListItem } from '@/lib/types';

interface CourseRowProps {
  title: string;
  subtitle?: string;
  seeAllHref?: string;
  courses: PublicCourseListItem[];
  isLoading?: boolean;
  emptyLabel?: string;
}

export function CourseRow({
  title,
  subtitle,
  seeAllHref,
  courses,
  isLoading = false,
  emptyLabel = 'Aucun cours à afficher.',
}: CourseRowProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const reducedMotion = prefersReducedMotion();

  const scrollBy = (dir: -1 | 1) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({
      left: dir * (el.clientWidth * 0.8),
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  };

  return (
    <section
      className="py-8 sm:py-10"
      aria-label={title}
    >
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="flex items-end justify-between gap-4 mb-4 sm:mb-6 flex-wrap">
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-neutral-900 dark:text-white">
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs sm:text-sm text-neutral-500 mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {seeAllHref && (
              <Link
                to={seeAllHref}
                className="text-sm font-semibold text-primary-600 hover:text-primary-700"
              >
                Voir tout →
              </Link>
            )}
            <div className="hidden sm:flex items-center gap-1">
              <NavButton onClick={() => scrollBy(-1)} label="Précédent">
                <ChevronLeft className="w-4 h-4" />
              </NavButton>
              <NavButton onClick={() => scrollBy(1)} label="Suivant">
                <ChevronRight className="w-4 h-4" />
              </NavButton>
            </div>
          </div>
        </div>

        {isLoading && courses.length === 0 ? (
          <div
            ref={scroller}
            className={cn(
              'flex gap-4 overflow-x-auto pb-4',
              'snap-x snap-mandatory scroll-smooth no-scrollbar',
            )}
          >
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="shrink-0 w-[240px] sm:w-[280px] snap-start"
              >
                <CourseCardSkeleton />
              </div>
            ))}
          </div>
        ) : courses.length === 0 ? (
          <p className="text-sm text-neutral-500 text-center py-6">
            {emptyLabel}
          </p>
        ) : (
          <div
            ref={scroller}
            role="list"
            className={cn(
              'flex gap-4 overflow-x-auto pb-4',
              'snap-x snap-mandatory scroll-smooth no-scrollbar',
              '-mx-4 px-4', // let the scroll bleed to the edges on mobile
            )}
          >
            {courses.map((c) => (
              <div
                key={c.id}
                role="listitem"
                className="shrink-0 w-[240px] sm:w-[280px] snap-start"
              >
                <CoursePremiumCard course={c} reducedMotion={reducedMotion} />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function NavButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 transition"
      aria-label={label}
    >
      {children}
    </button>
  );
}
