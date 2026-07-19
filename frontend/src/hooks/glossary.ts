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

// ─────────────────────────────────────────────────────────
// Instructor CRUD (GLOSS-6)
// ─────────────────────────────────────────────────────────

export interface InstructorTermsFilters {
  q?: string;
  status?: string;
  page?: number;
  page_size?: number;
}

export function useInstructorGlossaryTerms(filters: InstructorTermsFilters = {}) {
  return useQuery({
    queryKey: [KEY, 'instructor-terms', filters],
    queryFn: async () => {
      const { data } = await api.get<GlossaryPaginatedList>(
        '/glossary/instructor/terms/',
        { params: filters },
      );
      return data;
    },
    staleTime: 30_000,
  });
}

export interface GlossaryTermWritePayload {
  word: string;
  short_definition: string;
  long_definition?: string;
  pronunciation?: string;
  language?: string;
  level?: 'beginner' | 'intermediate' | 'advanced';
  category?: number | null;
  domain?: string;
  scope?: 'global' | 'course' | 'section' | 'lesson';
  status?: 'draft' | 'pending';
  is_active?: boolean;
  is_case_sensitive?: boolean;
  enable_auto_detection?: boolean;
  illustration_url?: string;
  external_source?: string;
  variants?: Array<{
    variant: string;
    variant_type?:
      | 'synonym'
      | 'acronym'
      | 'plural'
      | 'abbreviation'
      | 'alternative_spelling';
    is_case_sensitive?: boolean;
  }>;
  examples?: Array<{ example: string; source?: string; order?: number }>;
}

export function useCreateGlossaryTerm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: GlossaryTermWritePayload) => {
      const { data } = await api.post('/glossary/instructor/terms/', payload);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, 'instructor-terms'] });
      qc.invalidateQueries({ queryKey: [KEY, 'terms'] });
    },
  });
}

export function useUpdateGlossaryTerm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: number;
      payload: Partial<GlossaryTermWritePayload>;
    }) => {
      const { data } = await api.patch(
        `/glossary/instructor/terms/${id}/`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, 'instructor-terms'] });
      qc.invalidateQueries({ queryKey: [KEY, 'terms'] });
    },
  });
}

export function useDeleteGlossaryTerm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/glossary/instructor/terms/${id}/`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, 'instructor-terms'] });
      qc.invalidateQueries({ queryKey: [KEY, 'terms'] });
    },
  });
}

export function useSubmitGlossaryTerm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.post(
        `/glossary/instructor/terms/${id}/submit/`,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, 'instructor-terms'] });
    },
  });
}

// ─────────────────────────────────────────────────────────
// Admin moderation (GLOSS-8)
// ─────────────────────────────────────────────────────────

export interface AdminTermsFilters {
  q?: string;
  status?: string;
  scope?: string;
  page?: number;
  page_size?: number;
}

export function useAdminGlossaryTerms(filters: AdminTermsFilters = {}) {
  return useQuery({
    queryKey: [KEY, 'admin-terms', filters],
    queryFn: async () => {
      const { data } = await api.get<GlossaryPaginatedList>(
        '/glossary/admin/terms/',
        { params: filters },
      );
      return data;
    },
    staleTime: 15_000,
  });
}

export function useValidateGlossaryTerm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.post(
        `/glossary/admin/terms/${id}/validate/`,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
    },
  });
}

export function useRejectGlossaryTerm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.post(
        `/glossary/admin/terms/${id}/reject/`,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, 'admin-terms'] });
    },
  });
}

export interface ImportRowResult {
  line: number;
  word: string;
  action: 'created' | 'skipped_duplicate' | 'error';
  detail: string;
}

export interface ImportReport {
  total_rows: number;
  created: number;
  skipped: number;
  errors: number;
  rows: ImportRowResult[];
}

export function useImportGlossary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      file,
      format,
      dryRun,
    }: {
      file: File;
      format: 'csv' | 'json';
      dryRun: boolean;
    }) => {
      const form = new FormData();
      form.append('file', file);
      form.append('format', format);
      form.append('dry_run', dryRun ? 'true' : 'false');
      const { data } = await api.post<{ dry_run: boolean; report: ImportReport }>(
        '/glossary/admin/import/',
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return data;
    },
    onSuccess: (data) => {
      // Rafraîchit la liste si un import effectif a eu lieu.
      if (data && !data.dry_run) {
        qc.invalidateQueries({ queryKey: [KEY] });
      }
    },
  });
}

export function buildExportUrl(format: 'csv' | 'json' = 'csv'): string {
  return `/api/glossary/admin/export/?format=${format}`;
}

export function useMergeGlossaryTerms() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      sourceId,
      targetId,
    }: {
      sourceId: number;
      targetId: number;
    }) => {
      const { data } = await api.post(
        `/glossary/admin/terms/${sourceId}/merge/`,
        { target_id: targetId },
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
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
