/**
 * hooks/quiz.ts — Hooks TanStack pour Quiz + Questions (R19.2).
 *
 * Endpoints backend :
 *   Instructor
 *   ──────────
 *   GET    /api/instructor/courses/:cid/quizzes/                Liste par cours
 *   POST   /api/instructor/quizzes/create/                       Créer quiz (+ course/section)
 *   POST   /api/instructor/courses/:cid/sections/:sid/quiz/create/   Créer quiz de section
 *   GET    /api/instructor/quizzes/:qid/                         Détail avec questions
 *   POST   /api/instructor/quizzes/:qid/update/                  Update quiz
 *   POST   /api/instructor/quizzes/:qid/questions/create/        Créer question + choix
 *   POST   /api/instructor/questions/:qid/update/                Update question + choix
 *   POST   /api/instructor/questions/:qid/delete/                Delete question
 *
 *   Learner
 *   ───────
 *   GET    /api/learner/courses/:cid/sections/:sid/quiz/         Charger quiz + questions
 *   POST   /api/learner/courses/:cid/sections/:sid/quiz/submit/  Soumettre answers → score
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface QuizChoiceInstructor {
  id: number;
  text: string;
  is_correct: boolean;
}

export interface QuizQuestionInstructor {
  id: number;
  prompt: string;
  topic: string;
  order: number;
  choices: QuizChoiceInstructor[];
}

export interface QuizDetailInstructor {
  id: number;
  title: string;
  slug: string;
  section_id: number | null;
  section_title: string;
  passing_score: number;
  max_attempts: number;
  is_active: boolean;
  questions: QuizQuestionInstructor[];
}

export interface QuizListItem {
  id: number;
  title: string;
  slug: string;
  section_id: number | null;
  section_title: string;
  lesson_id: number | null;
  is_active: boolean;
  passing_score: number;
  max_attempts: number;
  questions_count: number;
}

export interface QuizChoiceLearner {
  id: number;
  text: string;
}

export interface QuizQuestionLearner {
  id: number;
  prompt: string;
  topic: string;
  order: number;
  choices: QuizChoiceLearner[];
}

export interface QuizLearner {
  id: number;
  title: string;
  passing_score: number;
  max_attempts: number;
  attempts_count: number;
  questions: QuizQuestionLearner[];
}

export interface QuizSubmitAnswer {
  question_id: number;
  choice_id: number | null;
}

export interface QuizSubmitResult {
  ok: boolean;
  attempt_id: number;
  score_percent: number;
  passed: boolean;
  passing_score: number;
  attempts_count: number;
  max_attempts: number;
  total_questions: number;
  correct_answers: number;
}

// ─────────────────────────────────────────────────────────────
// Keys
// ─────────────────────────────────────────────────────────────

const KEYS = {
  courseQuizzes: (courseId: number | string) =>
    ['instructor-course-quizzes', String(courseId)] as const,
  quizDetail: (quizId: number | string) =>
    ['instructor-quiz', String(quizId)] as const,
  learnerQuiz: (courseId: number | string, sectionId: number | string) =>
    ['learner-section-quiz', String(courseId), String(sectionId)] as const,
};

// ─────────────────────────────────────────────────────────────
// Instructor — Quiz
// ─────────────────────────────────────────────────────────────

export function useCourseQuizzes(courseId: number | string | undefined) {
  return useQuery({
    queryKey: KEYS.courseQuizzes(courseId ?? ''),
    queryFn: async () => {
      const { data } = await api.get<QuizListItem[]>(
        `/instructor/courses/${courseId}/quizzes/`,
      );
      return data;
    },
    enabled: !!courseId,
    staleTime: 20_000,
  });
}

export function useQuizDetail(quizId: number | string | undefined) {
  return useQuery({
    queryKey: KEYS.quizDetail(quizId ?? ''),
    queryFn: async () => {
      const { data } = await api.get<QuizDetailInstructor>(
        `/instructor/quizzes/${quizId}/`,
      );
      return data;
    },
    enabled: !!quizId,
    staleTime: 10_000,
  });
}

export interface CreateQuizPayload {
  course_id: number;
  title: string;
  section_id?: number | null;
  passing_score?: number;
  max_attempts?: number;
}

export function useCreateQuiz() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateQuizPayload) => {
      const { data } = await api.post<QuizListItem>(
        `/instructor/quizzes/create/`,
        payload,
      );
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: KEYS.courseQuizzes(vars.course_id),
      });
    },
  });
}

export interface UpdateQuizPayload {
  title?: string;
  passing_score?: number;
  max_attempts?: number;
  is_active?: boolean;
  section_id?: number | null;
}

export function useUpdateQuiz(quizId: number | string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UpdateQuizPayload) => {
      const { data } = await api.post<QuizDetailInstructor>(
        `/instructor/quizzes/${quizId}/update/`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.quizDetail(quizId) });
      qc.invalidateQueries({ queryKey: ['instructor-course-quizzes'] });
    },
  });
}

// ─────────────────────────────────────────────────────────────
// Instructor — Questions
// ─────────────────────────────────────────────────────────────

export interface QuestionChoicePayload {
  text: string;
  is_correct: boolean;
}

export interface CreateQuestionPayload {
  prompt: string;
  topic?: string;
  order?: number;
  choices: QuestionChoicePayload[];
}

export function useCreateQuestion(quizId: number | string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateQuestionPayload) => {
      const { data } = await api.post<QuizQuestionInstructor>(
        `/instructor/quizzes/${quizId}/questions/create/`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.quizDetail(quizId) });
    },
  });
}

export function useUpdateQuestion(quizId: number | string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      questionId,
      payload,
    }: {
      questionId: number;
      payload: CreateQuestionPayload;
    }) => {
      const { data } = await api.post<QuizQuestionInstructor>(
        `/instructor/questions/${questionId}/update/`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.quizDetail(quizId) });
    },
  });
}

export function useDeleteQuestion(quizId: number | string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (questionId: number) => {
      await api.post(`/instructor/questions/${questionId}/delete/`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.quizDetail(quizId) });
    },
  });
}

// ─────────────────────────────────────────────────────────────
// Learner — passer un quiz
// ─────────────────────────────────────────────────────────────

export function useLearnerSectionQuiz(
  courseId: number | string | undefined,
  sectionId: number | string | undefined,
) {
  return useQuery({
    queryKey: KEYS.learnerQuiz(courseId ?? '', sectionId ?? ''),
    queryFn: async () => {
      const { data } = await api.get<QuizLearner>(
        `/learner/courses/${courseId}/sections/${sectionId}/quiz/`,
      );
      return data;
    },
    enabled: !!courseId && !!sectionId,
    retry: (failureCount, err) => {
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      if (status === 404 || status === 403) return false;
      return failureCount < 2;
    },
    staleTime: 10_000,
  });
}

export function useSubmitSectionQuiz(
  courseId: number | string,
  sectionId: number | string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (answers: QuizSubmitAnswer[]) => {
      const { data } = await api.post<QuizSubmitResult>(
        `/learner/courses/${courseId}/sections/${sectionId}/quiz/submit/`,
        { answers },
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.learnerQuiz(courseId, sectionId) });
      qc.invalidateQueries({ queryKey: ['dashboard-student'] });
      qc.invalidateQueries({ queryKey: ['course-progress'] });
    },
  });
}
