/**
 * LearnerCoursePlayerPage.tsx — Lecteur de cours apprenant (R14.3).
 *
 * Layout :
 *  - Colonne gauche : lecteur (vidéo / doc / quiz)
 *  - Colonne droite : sommaire cliquable avec statuts par leçon
 *
 * Progression :
 *  - Vidéo : `timeupdate` déclenche un update throttlé (10s), marque terminé
 *    quand watchRatio >= 0.9.
 *  - Doc / article / quiz : bouton "Marquer comme terminé" → POST /complete/
 *  - Navigation prev/next + auto-select première leçon non terminée au boot.
 *  - `set-current` persisté à chaque changement de leçon.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Play,
  FileText,
  HelpCircle,
  Lock,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Award,
  CheckCircle2,
} from 'lucide-react';
import { LearnerShell } from '@/components/learner/LearnerShell';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { ProgressBar } from '@/components/premium/ProgressBar';
import { Badge } from '@/components/ui/Badge';
import {
  usePlayerData,
  useCourseProgress,
  useLessonState,
  useUpdateLessonProgress,
  useCompleteLesson,
  useSetCurrentLesson,
} from '@/hooks/player';
import { extractApiError, formatDuration, cn } from '@/lib/utils';
import type { PlayerLesson } from '@/lib/types';

// Classes prose pour le rendu du HTML riche produit par Tiptap.
const LESSON_PROSE_CLASSES = cn(
  'prose prose-sm sm:prose max-w-none text-neutral-800',
  'prose-headings:font-extrabold prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg',
  'prose-a:text-primary-600 prose-strong:font-bold',
  'prose-blockquote:border-l-4 prose-blockquote:border-primary-300',
  'prose-blockquote:bg-primary-50/50 prose-blockquote:py-2 prose-blockquote:px-3',
  'prose-blockquote:rounded-lg prose-blockquote:italic',
  'prose-code:bg-neutral-100 prose-code:px-1 prose-code:rounded',
  'prose-pre:bg-neutral-900 prose-pre:text-white',
  'prose-img:rounded-xl prose-hr:my-6 prose-table:border-collapse',
);

const VIDEO_COMPLETE_THRESHOLD = 0.9;
const PROGRESS_SYNC_INTERVAL_MS = 10_000;

function toYouTubeEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    let videoId: string | null = null;
    if (u.hostname.includes('youtube.com')) {
      videoId = u.searchParams.get('v');
      if (!videoId && u.pathname.startsWith('/embed/')) {
        videoId = u.pathname.split('/')[2] || null;
      }
    } else if (u.hostname.includes('youtu.be')) {
      videoId = u.pathname.slice(1) || null;
    }
    if (!videoId) return null;
    return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`;
  } catch {
    return null;
  }
}

const TYPE_ICON: Record<string, typeof Play> = {
  VIDEO: Play,
  ARTICLE: FileText,
  PDF: FileText,
  AUDIO: Play,
  QUIZ: HelpCircle,
};

export default function LearnerCoursePlayerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const courseId = id ? Number(id) : undefined;
  const { data: player, isLoading } = usePlayerData(courseId);
  const { data: courseProgress } = useCourseProgress(courseId);
  const setCurrent = useSetCurrentLesson(courseId ?? 0);

  // Liste plate ordonnée pour prev/next
  const flatLessons = useMemo(() => {
    if (!player) return [];
    return player.sections
      .slice()
      .sort((a, b) => a.order - b.order)
      .flatMap((s) => s.lessons);
  }, [player]);

  const [activeLessonId, setActiveLessonId] = useState<number | null>(null);

  // Auto-sélection au boot : current_lesson_id, sinon 1re non-terminée, sinon 1re
  useEffect(() => {
    if (!player || activeLessonId !== null) return;
    let target = player.current_lesson_id ?? null;
    if (!target) {
      target =
        flatLessons.find((l) => !l.completed)?.id ??
        flatLessons[0]?.id ??
        null;
    }
    if (target) setActiveLessonId(target);
  }, [player, flatLessons, activeLessonId]);

  // Persiste le "set current" quand on change de leçon
  useEffect(() => {
    if (!courseId || !activeLessonId) return;
    setCurrent.mutate(activeLessonId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLessonId]);

  const activeIndex = flatLessons.findIndex((l) => l.id === activeLessonId);
  const prevLesson = activeIndex > 0 ? flatLessons[activeIndex - 1] : null;
  const nextLesson =
    activeIndex >= 0 && activeIndex < flatLessons.length - 1
      ? flatLessons[activeIndex + 1]
      : null;

  // R19.7 — Détermine si la leçon active est la dernière d'une section qui
  // a un quiz non-passé. Si oui, le "Next" doit rediriger vers le quiz.
  const activeSection = useMemo(() => {
    if (!player || !activeLessonId) return null;
    return (
      player.sections.find((s) =>
        s.lessons.some((l) => l.id === activeLessonId),
      ) ?? null
    );
  }, [player, activeLessonId]);

  const isLastLessonOfSection = useMemo(() => {
    if (!activeSection) return false;
    const last = activeSection.lessons[activeSection.lessons.length - 1];
    return last?.id === activeLessonId;
  }, [activeSection, activeLessonId]);

  const pendingSectionQuiz =
    isLastLessonOfSection && activeSection?.quiz && !activeSection.quiz.passed
      ? activeSection.quiz
      : null;

  return (
    <LearnerShell
      title={player?.course?.title ?? 'Cours'}
      subtitle={
        courseProgress
          ? `Progression : ${courseProgress.progress_percent}% (${courseProgress.completed_lessons}/${courseProgress.total_lessons} leçons)`
          : undefined
      }
      actions={
        <Link
          to="/learn/courses"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-neutral-200 hover:bg-neutral-50"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Mes formations
        </Link>
      }
    >
      {isLoading && !player ? (
        <div className="py-20 flex justify-center">
          <Spinner size="xl" label="Chargement du cours…" />
        </div>
      ) : !player ? (
        <Card>
          <CardBody className="text-center py-10">
            <p className="text-lg font-bold">Cours introuvable</p>
            <p className="mt-1 text-sm text-neutral-500">
              Vous devez être inscrit·e à ce cours pour y accéder.
            </p>
            <button
              onClick={() => navigate('/catalogue')}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-bold"
            >
              Explorer le catalogue
            </button>
          </CardBody>
        </Card>
      ) : (
        <>
          {courseProgress && courseProgress.total_lessons > 0 && (
            <div className="mb-4">
              <ProgressBar
                value={courseProgress.progress_percent}
                showValue
                label={
                  courseProgress.progress_percent >= 100
                    ? '🎉 Cours terminé — certificat disponible'
                    : 'Progression du cours'
                }
                color={
                  courseProgress.progress_percent >= 100 ? 'success' : 'primary'
                }
              />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
            {/* Lecteur */}
            <div className="min-w-0 space-y-4">
              {courseId && activeLessonId ? (
                <>
                  {/* R19.7 — Banner quiz de section en attente */}
                  {pendingSectionQuiz && activeSection && (
                    <div className="mb-4 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                          <HelpCircle className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-amber-900">
                            Quiz à passer pour valider cette section
                          </p>
                          <p className="text-xs text-amber-800 mt-0.5">
                            {pendingSectionQuiz.title} · Seuil{' '}
                            {pendingSectionQuiz.passing_score}% ·{' '}
                            {pendingSectionQuiz.attempts_remaining} tentative(s) restante(s)
                          </p>
                        </div>
                        <Link
                          to={`/learn/courses/${courseId}/sections/${activeSection.id}/quiz`}
                          className="shrink-0 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white transition"
                        >
                          <HelpCircle className="w-3.5 h-3.5" />
                          Passer le quiz
                        </Link>
                      </div>
                    </div>
                  )}

                  <LessonPlayer
                    courseId={courseId}
                    lessonId={activeLessonId}
                    onNext={
                      pendingSectionQuiz && activeSection
                        ? () =>
                            navigate(
                              `/learn/courses/${courseId}/sections/${activeSection.id}/quiz`,
                            )
                        : nextLesson
                          ? () => setActiveLessonId(nextLesson.id)
                          : undefined
                    }
                    nextLabel={
                      pendingSectionQuiz ? 'Passer le quiz de la section' : undefined
                    }
                    onPrev={
                      prevLesson
                        ? () => setActiveLessonId(prevLesson.id)
                        : undefined
                    }
                  />
                </>
              ) : (
                <Card>
                  <CardBody className="text-center py-8 text-sm text-neutral-500">
                    Sélectionnez une leçon dans le sommaire.
                  </CardBody>
                </Card>
              )}
            </div>

            {/* Sommaire */}
            <Curriculum
              player={player}
              courseId={courseId ?? 0}
              activeLessonId={activeLessonId}
              onSelect={(id) => setActiveLessonId(id)}
            />
          </div>
        </>
      )}
    </LearnerShell>
  );
}

// ─────────────────────────────────────────────────────────────
// LessonPlayer — vidéo (avec tracking) ou doc (marquage manuel)
// ─────────────────────────────────────────────────────────────

function LessonPlayer({
  courseId,
  lessonId,
  onNext,
  onPrev,
  nextLabel,
}: {
  courseId: number;
  lessonId: number;
  onNext?: () => void;
  onPrev?: () => void;
  nextLabel?: string;
}) {
  const { data: state, isLoading } = useLessonState(courseId, lessonId);
  const updateProgress = useUpdateLessonProgress(courseId, lessonId);
  const complete = useCompleteLesson(courseId, lessonId);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastSentAtRef = useRef<number>(0);
  const [markingErr, setMarkingErr] = useState<string | null>(null);

  // Restaure la position au load
  useEffect(() => {
    if (
      state?.lesson?.lesson_type !== 'VIDEO' ||
      !videoRef.current ||
      !state?.progress
    ) {
      return;
    }
    const pos = state.progress.last_position_sec ?? 0;
    if (pos > 0) {
      videoRef.current.currentTime = pos;
    }
  }, [state?.lesson?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const isVideo = state?.lesson.lesson_type === 'VIDEO';
  const duration = state?.lesson.duration_sec ?? 0;
  const alreadyCompleted = state?.progress.completed ?? false;

  const handleTimeUpdate = () => {
    const el = videoRef.current;
    if (!el || !duration) return;
    const now = Date.now();
    if (now - lastSentAtRef.current < PROGRESS_SYNC_INTERVAL_MS) return;
    lastSentAtRef.current = now;

    const position = Math.floor(el.currentTime);
    const ratio = position / duration;
    const percent = Math.min(99, Math.round(ratio * 100));
    updateProgress.mutate({
      percent,
      last_position_sec: position,
      is_completed: ratio >= VIDEO_COMPLETE_THRESHOLD,
    });
  };

  const handleEnded = () => {
    const el = videoRef.current;
    if (!el) return;
    updateProgress.mutate({
      percent: 100,
      last_position_sec: Math.floor(el.duration || duration),
      is_completed: true,
    });
  };

  const handleManualComplete = async () => {
    setMarkingErr(null);
    try {
      await complete.mutateAsync();
    } catch (e) {
      setMarkingErr(extractApiError(e, 'Impossible de marquer cette leçon.'));
    }
  };

  if (isLoading && !state) {
    return (
      <Card>
        <CardBody className="py-10 flex justify-center">
          <Spinner label="Chargement de la leçon…" />
        </CardBody>
      </Card>
    );
  }

  if (!state) {
    return (
      <Card>
        <CardBody className="text-center py-10 text-sm text-neutral-500">
          Impossible de charger cette leçon.
        </CardBody>
      </Card>
    );
  }

  const embedUrl = state.lesson.video_url
    ? toYouTubeEmbed(state.lesson.video_url)
    : null;

  return (
    <Card>
      <div className="px-5 py-4 border-b border-neutral-100">
        <h2 className="text-base font-bold text-neutral-900">
          {state.lesson.title}
        </h2>
        <div className="mt-1 inline-flex items-center gap-3 text-xs text-neutral-500 flex-wrap">
          <span className="uppercase font-bold">
            {state.lesson.lesson_type}
          </span>
          {duration > 0 && <span>{formatDuration(duration)}</span>}
          {alreadyCompleted && (
            <Badge variant="success" size="xs">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Terminée
            </Badge>
          )}
        </div>
      </div>
      <CardBody className="space-y-4">
        {/* Vidéo */}
        {isVideo && embedUrl && (
          <div className="aspect-video bg-neutral-900 rounded-xl overflow-hidden">
            {/* YouTube : pas de tracking granulaire côté frontend — on
                s'appuiera sur le bouton "Marquer terminé" une fois la
                lecture achevée. Pour un vrai tracking, self-host + <video> */}
            <iframe
              src={embedUrl}
              title={state.lesson.title}
              className="w-full h-full"
              frameBorder={0}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}
        {isVideo && !embedUrl && state.lesson.video_url && (
          <div className="aspect-video bg-neutral-900 rounded-xl overflow-hidden">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              ref={videoRef}
              src={state.lesson.video_url}
              controls
              className="w-full h-full"
              onTimeUpdate={handleTimeUpdate}
              onEnded={handleEnded}
              preload="metadata"
            />
          </div>
        )}

        {/* Article / doc / description leçon vidéo — le content est du
            HTML riche produit par Tiptap. On le rend via
            dangerouslySetInnerHTML (contenu créé par un instructeur
            authentifié, sanitisé côté backend).

            UX-12 — Fix : la description était masquée pour les leçons
            de type VIDEO. On l'affiche maintenant en dessous du player,
            précédée d'un séparateur visuel pour distinguer clairement
            la vidéo (support principal) de sa description
            (transcription, notes, résumé, ressources complémentaires). */}
        {state.lesson.content && (
          <>
            {isVideo && (
              <div className="pt-1 mt-1 border-t border-neutral-100 dark:border-neutral-800">
                <p className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-3">
                  Description de la leçon
                </p>
              </div>
            )}
            <div
              className={LESSON_PROSE_CLASSES}
              dangerouslySetInnerHTML={{ __html: state.lesson.content }}
            />
          </>
        )}

        {!isVideo && !state.lesson.content && (
          <div className="bg-neutral-50 border border-dashed border-neutral-200 rounded-xl p-6 text-center text-sm text-neutral-500">
            Cette leçon n'a pas encore de contenu texte.
          </div>
        )}

        {isVideo && !embedUrl && !state.lesson.video_url && (
          <div className="bg-neutral-50 border border-dashed border-neutral-200 rounded-xl p-6 text-center text-sm text-neutral-500">
            Aucune vidéo attachée pour l'instant.
          </div>
        )}

        {/* T8 — Ressources externes téléchargeables */}
        {Array.isArray((state.lesson as unknown as { resources?: unknown[] }).resources)
          && ((state.lesson as unknown as { resources: unknown[] }).resources.length > 0) && (
            <div className="pt-3 mt-1 border-t border-neutral-100 dark:border-neutral-800">
              <p className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-3">
                Ressources téléchargeables
              </p>
              <ul className="space-y-2">
                {((state.lesson as unknown as { resources: Array<{
                  id: number;
                  title: string;
                  kind: string;
                  size_human: string;
                  file_url: string;
                  is_downloadable: boolean;
                }> }).resources).map((r) => {
                  const kindLabel = (
                    { pdf: 'PDF', image: 'Image', html: 'HTML', zip: 'Archive', other: 'Fichier' } as Record<string, string>
                  )[r.kind] || 'Fichier';
                  const kindColor = (
                    {
                      pdf: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
                      image: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
                      html: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
                      zip: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
                      other: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
                    } as Record<string, string>
                  )[r.kind] || 'bg-neutral-100 text-neutral-700';
                  return (
                    <li
                      key={r.id}
                      className="flex items-center gap-3 p-3 rounded-xl border border-neutral-100 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:border-primary-200 hover:shadow-soft transition"
                    >
                      <div
                        className={
                          'w-10 h-10 rounded-lg flex items-center justify-center shrink-0 font-bold text-xs uppercase '
                          + kindColor
                        }
                      >
                        {kindLabel.slice(0, 3)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-neutral-900 dark:text-white truncate">
                          {r.title}
                        </p>
                        <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                          {kindLabel} · {r.size_human}
                          {!r.is_downloadable && ' · Lecture seule'}
                        </p>
                      </div>
                      <a
                        href={r.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        download={r.is_downloadable ? r.title : undefined}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold transition shrink-0"
                      >
                        {r.is_downloadable ? 'Télécharger' : 'Ouvrir'}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

        {/* Actions bas de lecteur */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-neutral-100">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!onPrev}
              onClick={onPrev}
            >
              <ChevronLeft className="w-4 h-4" />
              Précédent
            </Button>
            <Button
              variant={nextLabel ? 'primary' : 'outline'}
              size="sm"
              disabled={!onNext}
              onClick={onNext}
            >
              {nextLabel ?? 'Suivant'}
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {!alreadyCompleted && (
            <Button
              variant="primary"
              size="sm"
              onClick={
                isVideo
                  ? () =>
                      updateProgress.mutate({
                        percent: 100,
                        is_completed: true,
                        last_position_sec: duration,
                      })
                  : handleManualComplete
              }
              loading={updateProgress.isPending || complete.isPending}
            >
              <Check className="w-4 h-4" />
              Marquer comme terminée
            </Button>
          )}
        </div>

        {markingErr && (
          <p className="text-xs text-rose-600">{markingErr}</p>
        )}
      </CardBody>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// Curriculum (sommaire) — sticky right
// ─────────────────────────────────────────────────────────────

function Curriculum({
  player,
  courseId,
  activeLessonId,
  onSelect,
}: {
  player: NonNullable<ReturnType<typeof usePlayerData>['data']>;
  courseId: number;
  activeLessonId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <aside className="lg:sticky lg:top-24 self-start">
      <Card>
        <CardHeader
          title="Sommaire"
          subtitle={`${player.sections.length} sections`}
          actions={<Award className="w-5 h-5 text-neutral-400" aria-hidden />}
        />
        <CardBody className="p-0 max-h-[70vh] overflow-y-auto">
          <ul>
            {player.sections
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((section) => (
                <li key={section.id}>
                  <details open className="group">
                    <summary className="px-4 py-3 flex items-center gap-2 cursor-pointer border-b border-neutral-100 hover:bg-neutral-50 list-none">
                      <ChevronDown className="w-3.5 h-3.5 text-neutral-400 transition-transform group-open:rotate-180 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold truncate">
                          {section.order}. {section.title}
                        </p>
                        <p className="text-[11px] text-neutral-500">
                          {section.lessons.filter((l) => l.completed).length} /{' '}
                          {section.lessons.length} terminées
                          {section.quiz && (
                            <span className="ml-1">
                              · Quiz{' '}
                              {section.quiz.passed ? (
                                <span className="text-emerald-600 font-semibold">
                                  réussi ({section.quiz.best_score}%)
                                </span>
                              ) : (
                                <span className="text-amber-600 font-semibold">
                                  à passer
                                </span>
                              )}
                            </span>
                          )}
                        </p>
                      </div>
                    </summary>
                    <ul className="divide-y divide-neutral-100 border-b border-neutral-100">
                      {section.lessons.map((lesson) => (
                        <li key={lesson.id}>
                          <LessonRow
                            lesson={lesson}
                            active={lesson.id === activeLessonId}
                            onClick={() => onSelect(lesson.id)}
                          />
                        </li>
                      ))}
                      {/* R19.7 — Entrée quiz de section (si le cours en a un) */}
                      {section.quiz && (
                        <li>
                          <QuizRow
                            courseId={courseId}
                            sectionId={section.id}
                            quiz={section.quiz}
                          />
                        </li>
                      )}
                    </ul>
                  </details>
                </li>
              ))}
          </ul>
        </CardBody>
      </Card>
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────
// QuizRow — entrée quiz dans le sommaire (R19.7)
// ─────────────────────────────────────────────────────────────

function QuizRow({
  courseId,
  sectionId,
  quiz,
}: {
  courseId: number;
  sectionId: number;
  quiz: NonNullable<
    NonNullable<ReturnType<typeof usePlayerData>['data']>['sections'][number]['quiz']
  >;
}) {
  const passed = quiz.passed;
  return (
    <Link
      to={`/learn/courses/${courseId}/sections/${sectionId}/quiz`}
      className={cn(
        'w-full flex items-center gap-2 px-4 py-2.5 text-left transition border-l-4',
        passed
          ? 'border-emerald-500 bg-emerald-50/50 hover:bg-emerald-50'
          : 'border-amber-500 bg-amber-50/50 hover:bg-amber-50',
      )}
    >
      {passed ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
      ) : (
        <HelpCircle className="w-4 h-4 text-amber-600 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            'text-sm truncate font-semibold',
            passed ? 'text-emerald-800' : 'text-amber-900',
          )}
        >
          Quiz : {quiz.title}
        </p>
        <p className="text-[10px] text-neutral-500 tabular-nums">
          {quiz.questions_count} questions · Seuil {quiz.passing_score}%
          {passed
            ? ` · Meilleur score ${quiz.best_score}%`
            : ` · ${quiz.attempts_remaining} tentative(s) restante(s)`}
        </p>
      </div>
    </Link>
  );
}

function LessonRow({
  lesson,
  active,
  onClick,
}: {
  lesson: PlayerLesson;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = TYPE_ICON[lesson.lesson_type] ?? FileText;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active}
      className={cn(
        'w-full flex items-center gap-2 px-4 py-2.5 text-left transition',
        active
          ? 'bg-primary-50 border-l-4 border-primary-600'
          : 'hover:bg-neutral-50 border-l-4 border-transparent',
      )}
    >
      {lesson.completed ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
      ) : (
        <Icon className="w-4 h-4 text-neutral-400 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            'text-sm truncate',
            active ? 'font-bold text-primary-700' : 'text-neutral-700',
            lesson.completed && !active && 'text-neutral-500',
          )}
        >
          {lesson.title}
        </p>
        {(lesson.duration_sec ?? 0) > 0 && (
          <p className="text-[11px] text-neutral-400 tabular-nums">
            {formatDuration(lesson.duration_sec)}
          </p>
        )}
      </div>
      {(lesson.progress_percent ?? 0) > 0 && !lesson.completed && (
        <span className="text-[10px] font-bold text-primary-600">
          {lesson.progress_percent}%
        </span>
      )}
      {!lesson.is_preview && !lesson.completed && (lesson.progress_percent ?? 0) === 0 && (
        <Lock className="w-3 h-3 text-neutral-300 shrink-0" aria-hidden />
      )}
    </button>
  );
}
