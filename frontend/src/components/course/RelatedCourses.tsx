/**
 * RelatedCourses.tsx — Grille de cours similaires.
 */
import { Spinner } from '@/components/ui/Spinner';
import { CourseCard } from './CourseCard';
import { useRelatedCourses } from '@/hooks/queries';

interface RelatedCoursesProps {
  slug: string;
}

export function RelatedCourses({ slug }: RelatedCoursesProps) {
  const { data, isLoading } = useRelatedCourses(slug);

  if (isLoading) {
    return (
      <div className="py-8 flex justify-center">
        <Spinner label="Chargement…" />
      </div>
    );
  }

  const courses = data ?? [];

  if (courses.length === 0) {
    return (
      <div className="bg-neutral-50 border border-dashed border-neutral-200 rounded-2xl p-8 text-center">
        <p className="text-neutral-500 text-sm">Aucun cours similaire pour le moment.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {courses.map((course) => (
        <CourseCard key={course.id} course={course} compact />
      ))}
    </div>
  );
}
