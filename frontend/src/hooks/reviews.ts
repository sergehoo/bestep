/**
 * hooks/reviews.ts — Hooks TanStack pour les avis d'un cours (R17.2).
 *
 * Endpoints backend (module `reviews/urls.py`) :
 *   GET  /reviews/courses/:course_id/reviews/         Liste (public)
 *   POST /reviews/courses/:course_id/reviews/         Créer (auth + inscrit)
 *   GET  /reviews/courses/:course_id/reviews/summary/ Distribution
 *   GET  /reviews/courses/:course_id/reviews/me/      Mon avis (200 ou {exists:false})
 *   PUT  /reviews/courses/:course_id/reviews/me/      Update mon avis
 *   DEL  /reviews/courses/:course_id/reviews/me/      Supprimer mon avis
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRoot } from '@/lib/api';

export interface CourseReviewItem {
  id: number;
  course: number;
  rating: number;
  comment: string;
  user_name: string;
  is_mine: boolean;
  created_at: string;
  updated_at: string;
}

interface MyReviewResponse {
  exists: boolean;
  review: CourseReviewItem | null;
}

const KEYS = {
  me: (courseId: number | string) => ['review-me', String(courseId)] as const,
};

/**
 * Récupère l'avis courant de l'utilisateur pour un cours.
 * Renvoie `null` si l'utilisateur n'a pas encore noté.
 */
export function useMyReview(courseId: number | string | undefined) {
  return useQuery({
    queryKey: KEYS.me(courseId ?? ''),
    queryFn: async () => {
      const { data } = await apiRoot.get<MyReviewResponse>(
        `/reviews/courses/${courseId}/reviews/me/`,
      );
      return data;
    },
    enabled: !!courseId,
    retry: (failureCount, err) => {
      // 401 / 403 / 404 : ne pas retry
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      if (status && status >= 400 && status < 500) return false;
      return failureCount < 2;
    },
    staleTime: 30_000,
  });
}

export interface SubmitReviewPayload {
  rating: number;
  comment: string;
}

/**
 * Crée l'avis initial (backend : POST /reviews/courses/:id/reviews/).
 * Le backend refuse (400) si l'utilisateur n'est pas inscrit ou a déjà noté.
 */
export function useCreateReview(courseId: number | string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SubmitReviewPayload) => {
      const { data } = await apiRoot.post<CourseReviewItem>(
        `/reviews/courses/${courseId}/reviews/`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.me(courseId) });
      // Refresh listes/summary publics (R4)
      qc.invalidateQueries({ queryKey: ['course-reviews'] });
      qc.invalidateQueries({ queryKey: ['course-reviews-summary'] });
      qc.invalidateQueries({ queryKey: ['public-course'] });
    },
  });
}

/**
 * Met à jour l'avis existant (backend : PATCH /reviews/courses/:id/reviews/me/).
 */
export function useUpdateReview(courseId: number | string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SubmitReviewPayload) => {
      const { data } = await apiRoot.patch<CourseReviewItem>(
        `/reviews/courses/${courseId}/reviews/me/`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.me(courseId) });
      qc.invalidateQueries({ queryKey: ['course-reviews'] });
      qc.invalidateQueries({ queryKey: ['course-reviews-summary'] });
      qc.invalidateQueries({ queryKey: ['public-course'] });
    },
  });
}

/**
 * Supprime l'avis courant (backend : DELETE /reviews/courses/:id/reviews/me/).
 */
export function useDeleteReview(courseId: number | string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await apiRoot.delete(`/reviews/courses/${courseId}/reviews/me/`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.me(courseId) });
      qc.invalidateQueries({ queryKey: ['course-reviews'] });
      qc.invalidateQueries({ queryKey: ['course-reviews-summary'] });
      qc.invalidateQueries({ queryKey: ['public-course'] });
    },
  });
}
