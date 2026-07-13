/**
 * InstructorCourseEditPage.tsx — Éditeur cours instructor (R6.4).
 * Tabs : Métadonnées / Programme / Actions.
 */
import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Settings, Layers, Wrench, ExternalLink, HelpCircle } from 'lucide-react';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { useInstructorCourseDetail } from '@/hooks/instructor';
import { cn } from '@/lib/utils';
import { CourseMetadataTab } from './CourseMetadataTab';
import { CourseCurriculumTab } from './CourseCurriculumTab';
import { CourseQuizzesTab } from './CourseQuizzesTab';
import { CourseActionsTab } from './CourseActionsTab';

type Tab = 'meta' | 'curriculum' | 'quizzes' | 'actions';

const TABS: Array<{ id: Tab; label: string; Icon: typeof Settings }> = [
  { id: 'meta', label: 'Métadonnées', Icon: Settings },
  { id: 'curriculum', label: 'Programme', Icon: Layers },
  { id: 'quizzes', label: 'Quiz', Icon: HelpCircle },
  { id: 'actions', label: 'Actions', Icon: Wrench },
];

export default function InstructorCourseEditPage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('meta');
  const { data: course, isLoading, error } = useInstructorCourseDetail(id);

  if (isLoading && !course) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
        <PublicHeader />
        <div className="py-20 flex justify-center">
          <Spinner size="xl" label="Chargement du cours…" />
        </div>
      </div>
    );
  }

  if (error || !course || !id) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
        <PublicHeader />
        <div className="container mx-auto px-4 max-w-4xl py-16 text-center">
          <h1 className="text-2xl font-bold">Cours introuvable</h1>
          <Link
            to="/instructor/courses"
            className="text-primary-600 mt-4 inline-block"
          >
            ← Retour à mes cours
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <PublicHeader />
      <section className="border-b border-neutral-200 bg-white">
        <div className="container mx-auto px-4 max-w-5xl py-6">
          <Link
            to="/instructor/courses"
            className="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900 mb-3"
          >
            <ArrowLeft className="w-4 h-4" /> Mes cours
          </Link>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-extrabold">{course.title}</h1>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <Badge
                  variant={
                    course.status === 'PUBLISHED'
                      ? 'success'
                      : course.status === 'REVIEW'
                        ? 'info'
                        : course.status === 'ARCHIVED'
                          ? 'neutral'
                          : 'warning'
                  }
                  size="sm"
                >
                  {course.status}
                </Badge>
                {course.category && (
                  <Badge variant="neutral" size="sm">
                    {course.category.name}
                  </Badge>
                )}
                <span className="text-xs text-neutral-500">
                  {course.updated_at_human}
                </span>
              </div>
            </div>
            <Link
              to={`/courses/${course.slug}`}
              target="_blank"
              className="inline-flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700"
            >
              <ExternalLink className="w-4 h-4" />
              Voir la page publique
            </Link>
          </div>
        </div>
      </section>

      <main className="container mx-auto px-4 max-w-5xl py-6">
        <div
          className="flex gap-1 border-b border-neutral-200 mb-6"
          role="tablist"
        >
          {TABS.map(({ id: tid, label, Icon }) => {
            const active = tab === tid;
            return (
              <button
                key={tid}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(tid)}
                className={cn(
                  'inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition',
                  active
                    ? 'border-primary-600 text-primary-700'
                    : 'border-transparent text-neutral-500 hover:text-neutral-800',
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            );
          })}
        </div>

        <Card>
          <div className="p-5">
            {tab === 'meta' && <CourseMetadataTab course={course} />}
            {tab === 'curriculum' && <CourseCurriculumTab courseId={id} />}
            {tab === 'quizzes' && <CourseQuizzesTab courseId={id} />}
            {tab === 'actions' && <CourseActionsTab course={course} />}
          </div>
        </Card>
      </main>
    </div>
  );
}
