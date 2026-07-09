/**
 * CurriculumAccordion.tsx — Programme du cours façon Udemy (R9.5).
 * Chaque section = <details>. Chaque leçon avec type, durée, preview.
 */
import { motion } from 'framer-motion';
import { Play, FileText, HelpCircle, Lock, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { formatDuration, cn } from '@/lib/utils';
import type { PublicCourseSection, PublicLesson } from '@/lib/types';

interface CurriculumAccordionProps {
  sections: PublicCourseSection[];
  onPreview?: (lesson: PublicLesson) => void;
  slug: string;
}

const TYPE_ICON: Record<string, typeof Play> = {
  VIDEO: Play,
  ARTICLE: FileText,
  QUIZ: HelpCircle,
  PDF: FileText,
  AUDIO: Play,
};

export function CurriculumAccordion({
  sections,
  onPreview,
  slug: _slug,
}: CurriculumAccordionProps) {
  const totalLessons = sections.reduce((s, sec) => s + sec.lessons.length, 0);
  const totalDuration = sections.reduce(
    (s, sec) => s + sec.lessons.reduce((ls, l) => ls + l.duration_sec, 0),
    0,
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 sm:mb-4">
        <h2 className="text-base sm:text-lg font-extrabold text-neutral-900">
          Programme du cours
        </h2>
        <p className="text-[11px] sm:text-xs text-neutral-500">
          {sections.length} sections · {totalLessons} leçons · {formatDuration(totalDuration)}
        </p>
      </div>

      {sections.length === 0 ? (
        <div className="bg-neutral-50 border border-dashed border-neutral-200 rounded-2xl p-8 text-center text-neutral-500 text-sm">
          Programme à venir.
        </div>
      ) : (
        <div className="space-y-3">
          {sections.map((section, i) => (
            <SectionBlock
              key={section.id}
              section={section}
              defaultOpen={i === 0}
              onPreview={onPreview}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SectionBlock({
  section,
  defaultOpen,
  onPreview,
}: {
  section: PublicCourseSection;
  defaultOpen: boolean;
  onPreview?: (lesson: PublicLesson) => void;
}) {
  const totalDur = section.lessons.reduce((s, l) => s + l.duration_sec, 0);
  return (
    <details
      className="group bg-white border border-neutral-100 rounded-2xl overflow-hidden open:shadow-soft"
      open={defaultOpen}
    >
      <summary
        className={cn(
          'px-4 sm:px-5 py-3 sm:py-4 cursor-pointer flex items-center justify-between gap-3',
          'hover:bg-neutral-50 transition list-none',
        )}
      >
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <ChevronDown className="w-4 h-4 text-neutral-400 transition-transform group-open:rotate-180 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm sm:text-base font-bold text-neutral-900 truncate">
              {section.order}. {section.title}
            </p>
            <p className="text-[11px] sm:text-xs text-neutral-500">
              {section.lessons.length} leçon
              {section.lessons.length > 1 ? 's' : ''}
              {totalDur > 0 && ` · ${formatDuration(totalDur)}`}
            </p>
          </div>
        </div>
      </summary>
      <motion.ul
        initial={false}
        className="divide-y divide-neutral-100 border-t border-neutral-100"
      >
        {section.lessons.map((lesson) => (
          <LessonRow key={lesson.id} lesson={lesson} onPreview={onPreview} />
        ))}
      </motion.ul>
    </details>
  );
}

function LessonRow({
  lesson,
  onPreview,
}: {
  lesson: PublicLesson;
  onPreview?: (lesson: PublicLesson) => void;
}) {
  const Icon = TYPE_ICON[lesson.lesson_type] ?? Play;
  return (
    <li className="px-4 sm:px-5 py-2.5 sm:py-3 flex items-center gap-2 sm:gap-3">
      {lesson.is_preview ? (
        <Icon className="w-4 h-4 text-primary-600 shrink-0" />
      ) : (
        <Lock className="w-4 h-4 text-neutral-400 shrink-0" />
      )}
      <p
        className={cn(
          'flex-1 min-w-0 truncate text-xs sm:text-sm',
          lesson.is_preview ? 'font-semibold text-neutral-900' : 'text-neutral-700',
        )}
      >
        {lesson.title}
      </p>
      {lesson.is_preview && (
        <Badge variant="accent" size="xs" className="hidden sm:inline-flex">
          Preview
        </Badge>
      )}
      <span className="text-[11px] sm:text-xs text-neutral-500 shrink-0 tabular-nums">
        {formatDuration(lesson.duration_sec)}
      </span>
      {lesson.is_preview && onPreview && (
        <button
          type="button"
          onClick={() => onPreview(lesson)}
          className="text-[11px] sm:text-xs font-semibold text-primary-600 hover:text-primary-700 shrink-0"
        >
          Aperçu
        </button>
      )}
    </li>
  );
}
