/**
 * src/hooks/queries.ts — Hooks TanStack Query typés (R3.4).
 *
 * Chaque hook = 1 endpoint API. Cache géré par TanStack Query.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type {
  Paginated,
  PublicCourseListItem,
  PublicCourseDetail,
  PublicCategory,
} from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────
// Public
// ─────────────────────────────────────────────────────────────────────

export interface CatalogFilters {
  q?: string;
  category?: string;
  course_type?: string;
  pricing?: string;
  sort?: string;
  page?: number;
  page_size?: number;
}

export function usePublicCourses(filters: CatalogFilters = {}) {
  return useQuery({
    queryKey: ['public-courses', filters],
    queryFn: async () => {
      const { data } = await api.get<Paginated<PublicCourseListItem>>(
        '/public/courses/',
        { params: filters },
      );
      return data;
    },
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}

export function usePublicCourseDetail(slug: string | undefined) {
  return useQuery({
    queryKey: ['public-course', slug],
    queryFn: async () => {
      const { data } = await api.get<PublicCourseDetail>(`/public/courses/${slug}/`);
      return data;
    },
    enabled: !!slug,
    staleTime: 5 * 60_000,
  });
}

export function usePublicCategories() {
  return useQuery({
    queryKey: ['public-categories'],
    queryFn: async () => {
      const { data } = await api.get<PublicCategory[]>('/public/categories/');
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

// ─────────────────────────────────────────────────────────────────────
// Dashboards
// ─────────────────────────────────────────────────────────────────────

/**
 * R5 : dashboards enrichis avec période (?period=7d|30d|90d).
 * Fallback rétrocompatible : sans période → 30d côté backend.
 */
export function useStudentDashboard(period: import('@/lib/types').DashboardPeriod = '30d') {
  return useQuery({
    queryKey: ['dashboard-student', period],
    queryFn: async () => {
      const { data } = await api.get<import('@/lib/types').StudentDashboardV5>(
        '/dashboard/student/',
        { params: { period } },
      );
      return data;
    },
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

export function useInstructorDashboard(period: import('@/lib/types').DashboardPeriod = '30d') {
  return useQuery({
    queryKey: ['dashboard-instructor', period],
    queryFn: async () => {
      const { data } = await api.get<import('@/lib/types').InstructorDashboardV5>(
        '/dashboard/instructor/',
        { params: { period } },
      );
      return data;
    },
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

export function useAdminDashboard(period: import('@/lib/types').DashboardPeriod = '30d') {
  return useQuery({
    queryKey: ['dashboard-admin', period],
    queryFn: async () => {
      const { data } = await api.get<import('@/lib/types').AdminDashboardV5>(
        '/dashboard/admin/',
        { params: { period } },
      );
      return data;
    },
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

// ─────────────────────────────────────────────────────────────────────
// Enrollments (mutations)
// ─────────────────────────────────────────────────────────────────────

/**
 * Enrollment mutation — utilise l'endpoint dédié `LearnerEnrollView`
 * (`POST /api/learner/courses/<id>/enroll/`). L'ancien
 * `/api/apis/enrollments/` du DRF router ne supporte pas POST (405).
 */
export function useEnroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (course_id: number) => {
      const { data } = await api.post(`/learner/courses/${course_id}/enroll/`);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard-student'] });
      qc.invalidateQueries({ queryKey: ['public-course'] });
      qc.invalidateQueries({ queryKey: ['learner-enrollments'] });
    },
  });
}


// ─────────────────────────────────────────────────────────────────────
// R4 — Reviews + Related + Preview leçon
// ─────────────────────────────────────────────────────────────────────

import type {
  PublicReview,
  ReviewsSummary,
  LessonPreviewResponse,
  ReviewsOrdering,
} from '@/lib/types';

interface ReviewsFilters {
  ordering?: ReviewsOrdering;
  page?: number;
}

export function useCourseReviews(slug: string | undefined, filters: ReviewsFilters = {}) {
  return useQuery({
    queryKey: ['course-reviews', slug, filters],
    queryFn: async () => {
      const { data } = await api.get<Paginated<PublicReview>>(
        `/public/courses/${slug}/reviews/`,
        { params: filters },
      );
      return data;
    },
    enabled: !!slug,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}

export function useCourseReviewsSummary(slug: string | undefined) {
  return useQuery({
    queryKey: ['course-reviews-summary', slug],
    queryFn: async () => {
      const { data } = await api.get<ReviewsSummary>(
        `/public/courses/${slug}/reviews/summary/`,
      );
      return data;
    },
    enabled: !!slug,
    staleTime: 5 * 60_000,
  });
}

export function useRelatedCourses(slug: string | undefined) {
  return useQuery({
    queryKey: ['course-related', slug],
    queryFn: async () => {
      const { data } = await api.get<PublicCourseListItem[]>(
        `/public/courses/${slug}/related/`,
      );
      return data;
    },
    enabled: !!slug,
    staleTime: 5 * 60_000,
  });
}

/**
 * Récupère le contenu d'une leçon UNIQUEMENT si is_preview=True.
 * L'API renvoie 403 sinon.
 */
export function useLessonPreview(slug: string, lessonId: number | null) {
  return useQuery({
    queryKey: ['lesson-preview', slug, lessonId],
    queryFn: async () => {
      const { data } = await api.get<LessonPreviewResponse>(
        `/public/courses/${slug}/lessons/${lessonId}/preview/`,
      );
      return data;
    },
    enabled: !!slug && !!lessonId,
    staleTime: 60 * 60_000, // 1h : le contenu preview ne bouge pas souvent
  });
}
