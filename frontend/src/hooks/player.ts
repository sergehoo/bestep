/**
 * hooks/player.ts — Hooks TanStack pour le lecteur apprenant (R14.2).
 *
 * Endpoints backend consommés :
 *   GET  /learner/player/:course_id/                                 → sommaire + progress
 *   GET  /learner/courses/:course_id/progress/                       → % du cours
 *   GET  /learner/courses/:course_id/lessons/:lesson_id/state/       → détail leçon + last_position
 *   POST /learner/courses/:course_id/lessons/:lesson_id/progress/    → update % (vidéo tracking)
 *   POST /learner/courses/:course_id/lessons/:lesson_id/complete/    → marquage manuel (doc/quiz)
 *   POST /learner/courses/:course_id/set-current/                    → set lesson courante
 *   GET  /learner/courses/:course_id/continue/                       → reprendre où on s'est arrêté
 *   GET  /learner/enrollments/                                       → toutes mes inscriptions
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type {
  PlayerData,
  LessonStateResponse,
  CourseProgressResponse,
  LessonProgressUpdatePayload,
  LessonProgressUpdateResponse,
} from '@/lib/types';

const KEYS = {
  player: (courseId: number | string) => ['player', String(courseId)] as const,
  courseProgress: (courseId: number | string) =>
    ['course-progress', String(courseId)] as const,
  lessonState: (courseId: number | string, lessonId: number | string) =>
    ['lesson-state', String(courseId), String(lessonId)] as const,
  enrollments: () => ['learner-enrollments'] as const,
  continueTarget: (courseId: number | string) =>
    ['continue-target', String(courseId)] as const,
};

// ─────────────────────────────────────────────────────────────
// Player + sommaire
// ─────────────────────────────────────────────────────────────

export function usePlayerData(courseId: number | string | undefined) {
  return useQuery({
    queryKey: KEYS.player(courseId ?? ''),
    queryFn: async () => {
      const { data } = await api.get<PlayerData>(`/learner/player/${courseId}/`);
      return data;
    },
    enabled: !!courseId,
    staleTime: 15_000,
  });
}

export function useCourseProgress(courseId: number | string | undefined) {
  return useQuery({
    queryKey: KEYS.courseProgress(courseId ?? ''),
    queryFn: async () => {
      const { data } = await api.get<CourseProgressResponse>(
        `/learner/courses/${courseId}/progress/`,
      );
      return data;
    },
    enabled: !!courseId,
    staleTime: 15_000,
  });
}

export function useLessonState(
  courseId: number | string | undefined,
  lessonId: number | string | null,
) {
  return useQuery({
    queryKey: KEYS.lessonState(courseId ?? '', lessonId ?? ''),
    queryFn: async () => {
      const { data } = await api.get<LessonStateResponse>(
        `/learner/courses/${courseId}/lessons/${lessonId}/state/`,
      );
      return data;
    },
    enabled: !!courseId && !!lessonId,
    staleTime: 5_000,
  });
}

// ─────────────────────────────────────────────────────────────
// Mutations progression
// ─────────────────────────────────────────────────────────────

/**
 * Update automatique de la progression (throttlé côté page).
 * `percent`, `last_position_sec`, ou combinaison.
 */
export function useUpdateLessonProgress(
  courseId: number | string,
  lessonId: number | string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: LessonProgressUpdatePayload) => {
      const { data } = await api.post<LessonProgressUpdateResponse>(
        `/learner/courses/${courseId}/lessons/${lessonId}/progress/`,
        payload,
      );
      return data;
    },
    onSuccess: (data) => {
      qc.setQueryData(KEYS.courseProgress(courseId), data.course_progress);
      qc.invalidateQueries({ queryKey: KEYS.player(courseId) });
      qc.invalidateQueries({ queryKey: KEYS.lessonState(courseId, lessonId) });
      qc.invalidateQueries({ queryKey: ['dashboard-student'] });
      qc.invalidateQueries({ queryKey: KEYS.enrollments() });
    },
  });
}

/**
 * Marquage manuel (doc, article, audio, quiz) — le backend refuse si
 * lesson_type === VIDEO avec durée > 0.
 */
export function useCompleteLesson(
  courseId: number | string,
  lessonId: number | string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<LessonProgressUpdateResponse>(
        `/learner/courses/${courseId}/lessons/${lessonId}/complete/`,
      );
      return data;
    },
    onSuccess: (data) => {
      qc.setQueryData(KEYS.courseProgress(courseId), data.course_progress);
      qc.invalidateQueries({ queryKey: KEYS.player(courseId) });
      qc.invalidateQueries({ queryKey: KEYS.lessonState(courseId, lessonId) });
      qc.invalidateQueries({ queryKey: ['dashboard-student'] });
      qc.invalidateQueries({ queryKey: KEYS.enrollments() });
    },
  });
}

/**
 * Persiste la leçon "en cours" (utilisée pour Continuer).
 */
export function useSetCurrentLesson(courseId: number | string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (lesson_id: number) => {
      const { data } = await api.post(
        `/learner/courses/${courseId}/set-current/`,
        { lesson_id },
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.player(courseId) });
      qc.invalidateQueries({ queryKey: KEYS.continueTarget(courseId) });
      qc.invalidateQueries({ queryKey: ['dashboard-student'] });
    },
  });
}

// ─────────────────────────────────────────────────────────────
// Enrollments (mes formations "réelles")
// ─────────────────────────────────────────────────────────────

export interface LearnerEnrollment {
  id: number;
  course: {
    id: number;
    slug: string;
    title: string;
    thumbnail_url: string | null;
    total_duration_sec?: number;
  };
  status: string;
  progress_percent: number;
  enrolled_at: string;
  completed_at: string | null;
  current_lesson_id: number | null;
  updated_at: string;
}

export function useLearnerEnrollments() {
  return useQuery({
    queryKey: KEYS.enrollments(),
    queryFn: async () => {
      const { data } = await api.get<{ results: LearnerEnrollment[] } | LearnerEnrollment[]>(
        '/learner/enrollments/',
      );
      // Le backend peut renvoyer soit un tableau, soit un envelope paginé
      return Array.isArray(data) ? data : data.results ?? [];
    },
    staleTime: 30_000,
  });
}

/**
 * R18 : trouve l'inscription du user courant sur un cours précis. Renvoie
 * `null` si l'utilisateur n'est pas inscrit ou pas authentifié.
 *
 * Piggyback sur `useLearnerEnrollments()` — 1 seul fetch pour toutes les
 * inscriptions, filtré côté client par `courseId`.
 */
export function useMyEnrollment(courseId: number | string | undefined) {
  const { data, isLoading, isFetching } = useLearnerEnrollments();
  const enrollment =
    courseId && data
      ? data.find((e) => e.course.id === Number(courseId)) ?? null
      : null;
  return { enrollment, isLoading, isFetching };
}

/**
 * Résout la cible "Continuer" côté serveur (renvoie lesson_id + course info).
 */
export function useContinueTarget(courseId: number | string | undefined) {
  return useQuery({
    queryKey: KEYS.continueTarget(courseId ?? ''),
    queryFn: async () => {
      const { data } = await api.get<{
        course_id: number;
        current_lesson_id: number | null;
        next_lesson_id: number | null;
      }>(`/learner/courses/${courseId}/continue/`);
      return data;
    },
    enabled: !!courseId,
    staleTime: 5_000,
  });
}
