/**
 * CourseActionsTab.tsx — Onglet Actions : lifecycle (publish/archive/…) (R6.4).
 */
import { useState } from 'react';
import { Rocket, EyeOff, Archive, Undo2 } from 'lucide-react';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useCourseLifecycle } from '@/hooks/instructor';
import { extractApiError } from '@/lib/utils';
import type { InstructorCourseListItem } from '@/lib/types';

interface Props {
  course: InstructorCourseListItem;
}

export function CourseActionsTab({ course }: Props) {
  const lifecycle = useCourseLifecycle(course.id);
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  async function run(transition: 'publish' | 'unpublish' | 'archive' | 'restore') {
    setFlash(null);
    try {
      await lifecycle.mutateAsync(transition);
      setFlash({
        kind: 'ok',
        msg:
          transition === 'publish'
            ? 'Cours publié.'
            : transition === 'unpublish'
              ? 'Cours dépublié.'
              : transition === 'archive'
                ? 'Cours archivé.'
                : 'Cours restauré.',
      });
    } catch (e) {
      setFlash({ kind: 'err', msg: extractApiError(e) });
    }
  }

  const status = course.status;
  const canPublish = status === 'DRAFT' || status === 'REVIEW';
  const canUnpublish = status === 'PUBLISHED';
  const canArchive = status !== 'ARCHIVED';
  const canRestore = status === 'ARCHIVED';

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                Statut actuel
              </p>
              <div className="mt-1 flex items-center gap-2">
                <Badge
                  variant={
                    status === 'PUBLISHED'
                      ? 'success'
                      : status === 'REVIEW'
                        ? 'info'
                        : status === 'ARCHIVED'
                          ? 'neutral'
                          : 'warning'
                  }
                  size="sm"
                >
                  {status}
                </Badge>
                {course.published_at && (
                  <span className="text-xs text-neutral-500">
                    Publié le{' '}
                    {new Date(course.published_at).toLocaleDateString('fr-FR')}
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                disabled={!canPublish}
                loading={lifecycle.isPending && lifecycle.variables === 'publish'}
                onClick={() => run('publish')}
              >
                <Rocket className="w-4 h-4" />
                Publier
              </Button>
              <Button
                variant="outline"
                disabled={!canUnpublish}
                loading={
                  lifecycle.isPending && lifecycle.variables === 'unpublish'
                }
                onClick={() => run('unpublish')}
              >
                <EyeOff className="w-4 h-4" />
                Dépublier
              </Button>
              <Button
                variant="outline"
                disabled={!canArchive}
                loading={lifecycle.isPending && lifecycle.variables === 'archive'}
                onClick={() => run('archive')}
              >
                <Archive className="w-4 h-4" />
                Archiver
              </Button>
              {canRestore && (
                <Button
                  variant="success"
                  loading={
                    lifecycle.isPending && lifecycle.variables === 'restore'
                  }
                  onClick={() => run('restore')}
                >
                  <Undo2 className="w-4 h-4" />
                  Restaurer
                </Button>
              )}
            </div>
          </div>

          {flash && (
            <p
              className={
                flash.kind === 'ok'
                  ? 'mt-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2'
                  : 'mt-4 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2'
              }
            >
              {flash.msg}
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h3 className="font-bold mb-2">Statistiques</h3>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <dt className="text-xs text-neutral-500">Inscrits</dt>
              <dd className="font-bold text-lg">{course.enrolled_count}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">Sections</dt>
              <dd className="font-bold text-lg">{course.sections_count}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">Leçons</dt>
              <dd className="font-bold text-lg">{course.lessons_count}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">Note moy.</dt>
              <dd className="font-bold text-lg">
                {(course.rating_avg ?? 0).toFixed(1)}
                <span className="text-xs text-neutral-400 font-normal">
                  {' '}
                  ({course.rating_count})
                </span>
              </dd>
            </div>
          </dl>
        </CardBody>
      </Card>
    </div>
  );
}
