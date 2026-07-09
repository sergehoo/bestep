/**
 * RelatedCarousel.tsx — Carrousel horizontal des cours similaires (R9.5).
 */
import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CoursePremiumCard } from './CoursePremiumCard';
import { Spinner } from '@/components/ui/Spinner';
import { useRelatedCourses } from '@/hooks/queries';
import { prefersReducedMotion } from '@/lib/course-meta';
import { cn } from '@/lib/utils';

interface RelatedCarouselProps {
  slug: string;
}

export function RelatedCarousel({ slug }: RelatedCarouselProps) {
  const { data, isLoading } = useRelatedCourses(slug);
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

  if (isLoading && !data) {
    return (
      <div className="py-8 flex justify-center">
        <Spinner label="Chargement…" />
      </div>
    );
  }

  const items = data ?? [];

  if (items.length === 0) {
    return (
      <div className="bg-neutral-50 border border-dashed border-neutral-200 rounded-2xl p-8 text-center text-sm text-neutral-500">
        Pas de cours similaire pour le moment.
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-extrabold text-neutral-900">
          Cours similaires
        </h2>
        <div className="flex items-center gap-1">
          <NavButton onClick={() => scrollBy(-1)} label="Précédent">
            <ChevronLeft className="w-4 h-4" />
          </NavButton>
          <NavButton onClick={() => scrollBy(1)} label="Suivant">
            <ChevronRight className="w-4 h-4" />
          </NavButton>
        </div>
      </div>
      <div
        ref={scroller}
        className={cn(
          'flex gap-4 overflow-x-auto pb-4',
          'snap-x snap-mandatory scroll-smooth',
          'no-scrollbar',
        )}
        role="list"
      >
        {items.map((c) => (
          <div
            key={c.id}
            role="listitem"
            className="shrink-0 w-[240px] sm:w-[280px] snap-start"
          >
            <CoursePremiumCard course={c} reducedMotion={reducedMotion} />
          </div>
        ))}
      </div>
    </div>
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
