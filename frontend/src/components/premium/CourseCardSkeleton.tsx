/**
 * CourseCardSkeleton.tsx — Placeholder animé pendant le chargement (R9.2).
 */
export function CourseCardSkeleton() {
  return (
    <div className="bg-white border border-neutral-100 rounded-2xl overflow-hidden shadow-soft animate-pulse">
      <div className="aspect-video bg-neutral-200" />
      <div className="p-4 space-y-3">
        <div className="flex gap-2">
          <div className="h-3 w-16 bg-neutral-200 rounded" />
          <div className="h-3 w-12 bg-neutral-200 rounded" />
        </div>
        <div className="h-4 w-3/4 bg-neutral-200 rounded" />
        <div className="h-3 w-1/2 bg-neutral-100 rounded" />
        <div className="h-3 w-1/3 bg-neutral-100 rounded" />
        <div className="flex justify-between items-center pt-2">
          <div className="h-5 w-16 bg-neutral-200 rounded" />
          <div className="h-8 w-20 bg-neutral-100 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
