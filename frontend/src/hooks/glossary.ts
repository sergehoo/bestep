/**
 * hooks/glossary.ts — Queries + mutations TanStack pour le lexique.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type {
  GlossaryAlphabetIndex,
  GlossaryCategory,
  GlossaryCourseTermsResponse,
  GlossaryPaginatedList,
  GlossaryTermDetail,
  GlossaryTermListItem,
} from '@/lib/glossary-types';

const KEY = 'glossary';

// ─────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────

export interface GlossaryListFilters {
  q?: string;
  letter?: string;
  category?: string;
  domain?: string;
  level?: string;
  course?: string;
  ordering?: 'alpha' | 'recent' | 'popular';
  page?: number;
  page_size?: number;
}

export function useGlossaryTerms(filters: GlossaryListFilters = {}) {
  return useQuery({
    queryKey: [KEY, 'terms', filters],
    queryFn: async () => {
      const { data } = await api.get<GlossaryPaginatedList>(
        '/glossary/terms/',
        { params: filters },
      );
      return data;
    },
    staleTime: 60_000,
  });
}

export function useGlossaryTerm(slug: string | null | undefined) {
  return useQuery({
    queryKey: [KEY, 'term', slug],
    queryFn: async () => {
      const { data } = await api.get<GlossaryTermDetail>(
        `/glossary/terms/${slug}/`,
      );
      return data;
    },
    enabled: !!slug,
    staleTime: 5 * 60_000,
  });
}

export function useGlossarySearch(q: string) {
  return useQuery({
    queryKey: [KEY, 'search', q],
    queryFn: async () => {
      const { data } = await api.get<GlossaryTermListItem[]>(
        '/glossary/terms/search/',
        { params: { q } },
      );
      return data;
    },
    enabled: q.trim().length >= 1,
    staleTime: 30_000,
  });
}

export function useGlossaryAlphabet() {
  return useQuery({
    queryKey: [KEY, 'alphabet'],
    queryFn: async () => {
      const { data } = await api.get<GlossaryAlphabetIndex>(
        '/glossary/terms/alphabet/',
      );
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useGlossaryPopular() {
  return useQuery({
    queryKey: [KEY, 'popular'],
    queryFn: async () => {
      const { data } = await api.get<GlossaryTermListItem[]>(
        '/glossary/terms/popular/',
      );
      return data;
    },
    staleTime: 10 * 60_000,
  });
}

export function useGlossaryRecent() {
  return useQuery({
    queryKey: [KEY, 'recent'],
    queryFn: async () => {
      const { data } = await api.get<GlossaryTermListItem[]>(
        '/glossary/terms/recent/',
      );
      return data;
    },
    staleTime: 10 * 60_000,
  });
}

export function useGlossaryCategories() {
  return useQuery({
    queryKey: [KEY, 'categories'],
    queryFn: async () => {
      const { data } = await api.get<GlossaryCategory[]>(
        '/glossary/categories/',
      );
      return data;
    },
    staleTime: 10 * 60_000,
  });
}

export function useGlossaryMyFavorites(enabled = true) {
  return useQuery({
    queryKey: [KEY, 'my-favorites'],
    queryFn: async () => {
      const { data } = await api.get<GlossaryTermListItem[]>(
        '/glossary/my/favorites/',
      );
      return data;
    },
    enabled,
    staleTime: 60_000,
  });
}

/** Termes détectables pour un cours donné (payload compact). */
export function useGlossaryCourseTerms(courseSlug?: string | null) {
  return useQuery({
    queryKey: [KEY, 'course-terms', courseSlug],
    queryFn: async () => {
      const { data } = await api.get<GlossaryCourseTermsResponse>(
        `/glossary/courses/${courseSlug}/terms/`,
      );
      return data;
    },
    enabled: !!courseSlug,
    staleTime: 10 * 60_000,
  });
}

/** Termes détectables pour une leçon (backend résout le cours parent). */
export function useGlossaryLessonTerms(lessonId?: number | null) {
  return useQuery({
    queryKey: [KEY, 'lesson-terms', lessonId],
    queryFn: async () => {
      const { data } = await api.get<{
        lesson_id: number;
        course_id: number;
        terms: import('@/lib/glossary-types').GlossaryTermDetect[];
        count: number;
      }>(`/glossary/lessons/${lessonId}/terms/`);
      return data;
    },
    enabled: !!lessonId,
    staleTime: 10 * 60_000,
  });
}

// ─────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────

export function useToggleGlossaryFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      slug,
      isFavorite,
    }: {
      slug: string;
      isFavorite: boolean;
    }) => {
      if (isFavorite) {
        await api.delete(`/glossary/terms/${slug}/favorite/`);
      } else {
        await api.post(`/glossary/terms/${slug}/favorite/`);
      }
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: [KEY, 'term', variables.slug] });
      qc.invalidateQueries({ queryKey: [KEY, 'my-favorites'] });
      qc.invalidateQueries({ queryKey: [KEY, 'terms'] });
    },
  });
}

export function useSaveGlossaryNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      slug,
      note,
      status,
    }: {
      slug: string;
      note: string;
      status: 'new' | 'understood' | 'review';
    }) => {
      const { data } = await api.put(`/glossary/terms/${slug}/note/`, {
        note,
        status,
      });
      return data;
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: [KEY, 'term', variables.slug] });
    },
  });
}

export function useSubmitGlossarySuggestion() {
  return useMutation({
    mutationFn: async (payload: {
      kind: 'new_term' | 'definition_update' | 'error_report';
      term?: number | null;
      proposed_word?: string;
      proposed_definition?: string;
      context?: string;
      course?: number | null;
      lesson?: number | null;
    }) => {
      const { data } = await api.post('/glossary/suggestions/', payload);
      return data;
    },
  });
}
