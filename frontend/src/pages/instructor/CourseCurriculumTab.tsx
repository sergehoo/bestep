/**
 * CourseCurriculumTab.tsx — Programme du cours (R16.4).
 *
 * DnD via @dnd-kit :
 *  - Sections réordonnables verticalement (drag par la poignée).
 *  - Leçons réordonnables au sein d'une section.
 *  - Chaque déplacement déclenche PATCH order = index+1 côté backend.
 *
 * Actions par leçon : renommer inline, ouvrir l'éditeur Tiptap, dupliquer
 * (stub), toggle preview, supprimer.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus,
  Trash2,
  PenSquare,
  Check,
  X,
  Play,
  FileText,
  GripVertical,
  Copy,
  Eye,
  Lock,
  ExternalLink,
} from 'lucide-react';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import {
  useInstructorSections,
  useCreateSection,
  useUpdateSection,
  useDeleteSection,
  useInstructorLessons,
  useCreateLesson,
  useUpdateLesson,
  useDeleteLesson,
} from '@/hooks/instructor';
import { extractApiError, formatDuration, cn } from '@/lib/utils';
import type { InstructorLesson, InstructorSection } from '@/lib/types';

interface Props {
  courseId: number | string;
}

export function CourseCurriculumTab({ courseId }: Props) {
  const { data: sections, isLoading } = useInstructorSections(courseId);
  const create = useCreateSection(courseId);
  const update = useUpdateSection(courseId);
  const remove = useDeleteSection(courseId);
  const [newTitle, setNewTitle] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [localSections, setLocalSections] = useState<InstructorSection[]>([]);

  // Sync local state depuis backend (permet drag optimiste)
  useEffect(() => {
    if (sections) {
      setLocalSections(
        [...sections].sort((a, b) => a.order - b.order),
      );
    }
  }, [sections]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  async function addSection(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!newTitle.trim()) return;
    try {
      await create.mutateAsync({ title: newTitle.trim() });
      setNewTitle('');
    } catch (e) {
      setErr(extractApiError(e));
    }
  }

  async function deleteSection(section: InstructorSection) {
    if (
      !confirm(`Supprimer la section « ${section.title} » et toutes ses leçons ?`)
    )
      return;
    try {
      await remove.mutateAsync(section.id);
    } catch (e) {
      setErr(extractApiError(e));
    }
  }

  async function handleSectionsDrag(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = localSections.findIndex((s) => s.id === Number(active.id));
    const newIndex = localSections.findIndex((s) => s.id === Number(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const newList = arrayMove(localSections, oldIndex, newIndex);
    setLocalSections(newList); // optimistic
    try {
      // Le backend utilise un swap → on itère et met à jour order
      const moved = newList[newIndex];
      await update.mutateAsync({
        sectionId: moved.id,
        payload: { order: newIndex + 1 },
      });
    } catch (e) {
      setErr(extractApiError(e));
    }
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={addSection}
        className="flex gap-2 items-end bg-white border border-neutral-100 rounded-2xl p-4"
      >
        <div className="flex-1">
          <Input
            label="Nouvelle section"
            placeholder="Ex : Module 1 — Introduction"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
        </div>
        <Button type="submit" variant="primary" loading={create.isPending}>
          <Plus className="w-4 h-4" />
          Ajouter
        </Button>
      </form>

      {err && (
        <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
          {err}
        </p>
      )}

      {isLoading && !sections ? (
        <div className="py-8 flex justify-center">
          <Spinner label="Chargement du programme…" />
        </div>
      ) : localSections.length === 0 ? (
        <Card>
          <CardBody className="text-center text-sm text-neutral-500 py-8">
            Ce cours n'a pas encore de section. Ajoutez-en une ci-dessus.
          </CardBody>
        </Card>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleSectionsDrag}
        >
          <SortableContext
            items={localSections.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-3">
              {localSections.map((section) => (
                <li key={section.id}>
                  <SortableSection
                    section={section}
                    courseId={courseId}
                    onDelete={() => deleteSection(section)}
                    onEditTitle={(t) =>
                      update.mutateAsync({
                        sectionId: section.id,
                        payload: { title: t },
                      })
                    }
                  />
                </li>
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <p className="text-xs text-neutral-400">
        Astuce : glissez la poignée verticale à gauche pour réorganiser
        sections et leçons.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SortableSection
// ─────────────────────────────────────────────────────────────

function SortableSection({
  section,
  courseId,
  onDelete,
  onEditTitle,
}: {
  section: InstructorSection;
  courseId: number | string;
  onDelete: () => void;
  onEditTitle: (title: string) => Promise<unknown>;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(section.title);
  const [expanded, setExpanded] = useState(true);

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={cn(
        'bg-white border border-neutral-100 rounded-2xl overflow-hidden',
        !isDragging && 'shadow-soft',
        isDragging && 'shadow-lift ring-2 ring-primary-400',
      )}
    >
      <div className="px-4 py-3 flex items-center justify-between gap-3 border-b border-neutral-100">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="p-1 rounded cursor-grab active:cursor-grabbing hover:bg-neutral-100"
            aria-label="Déplacer la section"
          >
            <GripVertical className="w-4 h-4 text-neutral-400" />
          </button>
          <span className="text-neutral-400 font-bold text-sm shrink-0">
            #{section.order}
          </span>
          {editing ? (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="flex-1 min-w-0 border border-neutral-200 rounded-lg px-3 py-1.5 text-sm"
              />
              <button
                onClick={async () => {
                  if (title.trim()) await onEditTitle(title.trim());
                  setEditing(false);
                }}
                className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600"
                aria-label="Enregistrer"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setTitle(section.title);
                  setEditing(false);
                }}
                className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500"
                aria-label="Annuler"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-left min-w-0 flex-1"
            >
              <p className="font-bold truncate">{section.title}</p>
              <p className="text-xs text-neutral-500">
                {section.lessons?.length ?? section.lessons_count ?? 0} leçon(s)
              </p>
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setEditing(true)}
            className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500"
            aria-label="Renommer"
          >
            <PenSquare className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-600"
            aria-label="Supprimer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="p-5">
          <LessonsList courseId={courseId} sectionId={section.id} />
        </div>
      )}
    </article>
  );
}

// ─────────────────────────────────────────────────────────────
// LessonsList
// ─────────────────────────────────────────────────────────────

function LessonsList({
  courseId,
  sectionId,
}: {
  courseId: number | string;
  sectionId: number;
}) {
  const { data: lessons, isLoading } = useInstructorLessons(courseId, sectionId);
  const create = useCreateLesson(courseId);
  const update = useUpdateLesson(courseId);
  const remove = useDeleteLesson(courseId);
  const [title, setTitle] = useState('');
  const [type, setType] = useState('VIDEO');
  const [err, setErr] = useState<string | null>(null);
  const [localLessons, setLocalLessons] = useState<InstructorLesson[]>([]);

  useEffect(() => {
    if (lessons) {
      setLocalLessons([...lessons].sort((a, b) => a.order - b.order));
    }
  }, [lessons]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  async function addLesson(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!title.trim()) return;
    try {
      await create.mutateAsync({
        sectionId,
        payload: { title: title.trim(), lesson_type: type },
      });
      setTitle('');
    } catch (e) {
      setErr(extractApiError(e));
    }
  }

  async function togglePreview(lesson: InstructorLesson) {
    await update.mutateAsync({
      sectionId,
      lessonId: lesson.id,
      payload: { is_preview: !lesson.is_preview },
    });
  }

  async function deleteLesson(lesson: InstructorLesson) {
    if (!confirm(`Supprimer la leçon « ${lesson.title} » ?`)) return;
    await remove.mutateAsync({ sectionId, lessonId: lesson.id });
  }

  async function duplicateLesson(lesson: InstructorLesson) {
    await create.mutateAsync({
      sectionId,
      payload: {
        title: `${lesson.title} (copie)`,
        lesson_type: lesson.lesson_type,
        content: lesson.content,
        video_url: lesson.video_url,
      },
    });
  }

  async function handleDrag(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = localLessons.findIndex((l) => l.id === Number(active.id));
    const newIndex = localLessons.findIndex((l) => l.id === Number(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const newList = arrayMove(localLessons, oldIndex, newIndex);
    setLocalLessons(newList);
    try {
      const moved = newList[newIndex];
      await update.mutateAsync({
        sectionId,
        lessonId: moved.id,
        payload: { order: newIndex + 1 },
      });
    } catch (e) {
      setErr(extractApiError(e));
    }
  }

  return (
    <div className="space-y-3">
      {isLoading && !lessons ? (
        <div className="py-4 flex justify-center">
          <Spinner label="Chargement des leçons…" />
        </div>
      ) : localLessons.length === 0 ? (
        <p className="text-sm text-neutral-400 text-center py-4">
          Aucune leçon dans cette section.
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDrag}
        >
          <SortableContext
            items={localLessons.map((l) => l.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="divide-y divide-neutral-100">
              {localLessons.map((lesson) => (
                <SortableLessonRow
                  key={lesson.id}
                  lesson={lesson}
                  courseId={courseId}
                  onTogglePreview={() => togglePreview(lesson)}
                  onDelete={() => deleteLesson(lesson)}
                  onDuplicate={() => duplicateLesson(lesson)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <form
        onSubmit={addLesson}
        className="flex flex-wrap gap-2 items-end pt-3 border-t border-neutral-100"
      >
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs font-semibold text-neutral-600 mb-1">
            Nouvelle leçon
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titre de la leçon"
            className="w-full border border-neutral-200 rounded-lg px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-neutral-600 mb-1">
            Type
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="border border-neutral-200 rounded-lg px-3 py-1.5 text-sm bg-white"
          >
            <option value="VIDEO">Vidéo</option>
            <option value="ARTICLE">Article</option>
            <option value="PDF">PDF</option>
            <option value="AUDIO">Audio</option>
            <option value="QUIZ">Quiz</option>
          </select>
        </div>
        <Button
          type="submit"
          variant="outline"
          size="sm"
          loading={create.isPending}
        >
          <Plus className="w-3.5 h-3.5" />
          Ajouter
        </Button>
      </form>

      {err && <p className="text-xs text-rose-600">{err}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────

function SortableLessonRow({
  lesson,
  courseId,
  onTogglePreview,
  onDelete,
  onDuplicate,
}: {
  lesson: InstructorLesson;
  courseId: number | string;
  onTogglePreview: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lesson.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        'py-2.5 flex items-center gap-2 first:pt-0 last:pb-0',
        isDragging && 'bg-primary-50 rounded-lg',
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="p-1 rounded cursor-grab active:cursor-grabbing hover:bg-neutral-100 shrink-0"
        aria-label="Déplacer la leçon"
      >
        <GripVertical className="w-3.5 h-3.5 text-neutral-400" />
      </button>
      <span className="text-xs text-neutral-400 font-bold shrink-0 w-6">
        {lesson.order}.
      </span>
      {lesson.lesson_type === 'VIDEO' ? (
        <Play className="w-4 h-4 text-primary-600 shrink-0" />
      ) : (
        <FileText className="w-4 h-4 text-neutral-500 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{lesson.title}</p>
        <p className="text-xs text-neutral-500">
          {lesson.lesson_type} · {formatDuration(lesson.duration_sec)}
        </p>
      </div>
      <button
        onClick={onTogglePreview}
        className="shrink-0"
        aria-label={lesson.is_preview ? 'Désactiver preview' : 'Activer preview'}
      >
        <Badge variant={lesson.is_preview ? 'accent' : 'neutral'} size="xs">
          {lesson.is_preview ? (
            <>
              <Eye className="w-3 h-3 mr-0.5" />
              Preview
            </>
          ) : (
            <>
              <Lock className="w-3 h-3 mr-0.5" />
              Privé
            </>
          )}
        </Badge>
      </button>
      <div className="flex items-center gap-0.5 shrink-0">
        <Link
          to={`/instructor/courses/${courseId}/lessons/${lesson.id}/edit`}
          className="p-1 rounded hover:bg-neutral-100 text-neutral-500"
          aria-label="Éditer la leçon"
          title="Éditer avec l'éditeur riche"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
        <button
          onClick={onDuplicate}
          className="p-1 rounded hover:bg-neutral-100 text-neutral-500"
          aria-label="Dupliquer"
          title="Dupliquer la leçon"
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onDelete}
          className="p-1 rounded hover:bg-rose-50 text-rose-600"
          aria-label="Supprimer"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </li>
  );
}
