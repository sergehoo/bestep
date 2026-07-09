/**
 * hooks/instructor.ts — Hooks TanStack pour le CRUD instructor (R6).
 *
 * Endpoints backend :
 *   - GET    /api/instructor/courses/                    → mes cours (my_courses)
 *   - GET    /api/apis/instructor/courses-private/<id>/  → détail
 *   - POST   /api/instructor/courses/create/             → créer
 *   - PATCH  /api/instructor/courses/<id>/update/        → mettre à jour
 *   - POST   /api/instructor/courses/<id>/publish|unpublish|archive|restore/
 *   - GET/POST/PATCH/DELETE  sections + lessons
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type {
  InstructorCourseListItem,
  InstructorCourseCreatePayload,
  InstructorCourseUpdatePayload,
  InstructorCourseFilters,
  InstructorSection,
  InstructorLesson,
  SectionCreatePayload,
  SectionUpdatePayload,
  LessonCreatePayload,
  LessonUpdatePayload,
} from '@/lib/types';

const KEYS = {
  list: (filters: InstructorCourseFilters) => ['instructor-courses', filters] as const,
  detail: (id: number | string) => ['instructor-course', String(id)] as const,
  sections: (courseId: number | string) => ['instructor-sections', String(courseId)] as const,
  lessons: (courseId: number | string, sectionId: number | string) =>
    ['instructor-lessons', String(courseId), String(sectionId)] as const,
};

// ─────────────────────────────────────────────────────────────────────
// Courses
// ─────────────────────────────────────────────────────────────────────

export function useInstructorCourses(filters: InstructorCourseFilters = {}) {
  return useQuery({
    queryKey: KEYS.list(filters),
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (filters.q) params.q = filters.q;
      if (filters.status) params.status = filters.status;
      if (filters.pricing) params.pricing = filters.pricing;
      if (filters.course_type) params.course_type = filters.course_type;
      const { data } = await api.get<InstructorCourseListItem[]>(
        '/instructor/courses/',
        { params },
      );
      return data;
    },
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

export function useInstructorCourseDetail(id: number | string | undefined) {
  return useQuery({
    queryKey: KEYS.detail(id ?? ''),
    queryFn: async () => {
      const { data } = await api.get<InstructorCourseListItem>(
        `/apis/instructor/courses-private/${id}/`,
      );
      return data;
    },
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useCreateInstructorCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: InstructorCourseCreatePayload) => {
      const { data } = await api.post<InstructorCourseListItem>(
        '/instructor/courses/create/',
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instructor-courses'] });
      qc.invalidateQueries({ queryKey: ['dashboard-instructor'] });
    },
  });
}

export function useUpdateInstructorCourse(id: number | string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: InstructorCourseUpdatePayload) => {
      const { data } = await api.patch<InstructorCourseListItem>(
        `/instructor/courses/${id}/update/`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: ['instructor-courses'] });
    },
  });
}

type Transition = 'publish' | 'unpublish' | 'archive' | 'restore';

export function useCourseLifecycle(id: number | string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (transition: Transition) => {
      const { data } = await api.post(
        `/instructor/courses/${id}/${transition}/`,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: ['instructor-courses'] });
      qc.invalidateQueries({ queryKey: ['dashboard-instructor'] });
    },
  });
}

// ─────────────────────────────────────────────────────────────────────
// Sections
// ─────────────────────────────────────────────────────────────────────

export function useInstructorSections(courseId: number | string | undefined) {
  return useQuery({
    queryKey: KEYS.sections(courseId ?? ''),
    queryFn: async () => {
      const { data } = await api.get<InstructorSection[]>(
        `/instructor/courses/${courseId}/sections/`,
      );
      return data;
    },
    enabled: !!courseId,
    staleTime: 15_000,
  });
}

export function useCreateSection(courseId: number | string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SectionCreatePayload) => {
      const { data } = await api.post<InstructorSection>(
        `/instructor/courses/${courseId}/sections/create/`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.sections(courseId) });
      qc.invalidateQueries({ queryKey: KEYS.detail(courseId) });
    },
  });
}

export function useUpdateSection(courseId: number | string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      sectionId,
      payload,
    }: {
      sectionId: number;
      payload: SectionUpdatePayload;
    }) => {
      const { data } = await api.post<InstructorSection>(
        `/instructor/courses/${courseId}/sections/${sectionId}/update/`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.sections(courseId) });
    },
  });
}

export function useDeleteSection(courseId: number | string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sectionId: number) => {
      const { data } = await api.post(
        `/instructor/courses/${courseId}/sections/${sectionId}/delete/`,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.sections(courseId) });
      qc.invalidateQueries({ queryKey: KEYS.detail(courseId) });
    },
  });
}

// ─────────────────────────────────────────────────────────────────────
// Lessons
// ─────────────────────────────────────────────────────────────────────

export function useInstructorLessons(
  courseId: number | string,
  sectionId: number | string | undefined,
) {
  return useQuery({
    queryKey: KEYS.lessons(courseId, sectionId ?? ''),
    queryFn: async () => {
      const { data } = await api.get<InstructorLesson[]>(
        `/instructor/courses/${courseId}/sections/${sectionId}/lessons/`,
      );
      return data;
    },
    enabled: !!courseId && !!sectionId,
    staleTime: 15_000,
  });
}

export function useCreateLesson(courseId: number | string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      sectionId,
      payload,
    }: {
      sectionId: number;
      payload: LessonCreatePayload;
    }) => {
      const { data } = await api.post<InstructorLesson>(
        `/instructor/courses/${courseId}/sections/${sectionId}/lessons/create/`,
        payload,
      );
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.lessons(courseId, vars.sectionId) });
      qc.invalidateQueries({ queryKey: KEYS.sections(courseId) });
    },
  });
}

export function useUpdateLesson(courseId: number | string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      sectionId,
      lessonId,
      payload,
    }: {
      sectionId: number;
      lessonId: number;
      payload: LessonUpdatePayload;
    }) => {
      const { data } = await api.post<InstructorLesson>(
        `/instructor/courses/${courseId}/sections/${sectionId}/lessons/${lessonId}/update/`,
        payload,
      );
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.lessons(courseId, vars.sectionId) });
    },
  });
}

export function useDeleteLesson(courseId: number | string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      sectionId,
      lessonId,
    }: {
      sectionId: number;
      lessonId: number;
    }) => {
      const { data } = await api.post(
        `/instructor/courses/${courseId}/sections/${sectionId}/lessons/${lessonId}/delete/`,
      );
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.lessons(courseId, vars.sectionId) });
      qc.invalidateQueries({ queryKey: KEYS.sections(courseId) });
    },
  });
}
