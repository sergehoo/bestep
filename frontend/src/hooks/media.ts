/**
 * hooks/media.ts — Hooks TanStack pour la médiathèque instructeur (R16.2).
 *
 * Endpoints backend :
 *   GET    /instructor/media/                        Liste paginée
 *   GET    /instructor/media/:id/                    Détail
 *   POST   /instructor/media/:id/update/             Rename / update
 *   POST   /instructor/media/:id/delete/             Delete
 *   POST   /media/upload/init/                       Upload direct MinIO (init)
 *   POST   /media/upload/finalize/                   Upload finalize
 *   GET    /learner/media/:id/signed/                Get URL signée
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { MediaAsset, MediaKind } from '@/lib/types';

const KEYS = {
  list: (params: MediaListParams) => ['instructor-media', params] as const,
  detail: (id: string) => ['instructor-media', id] as const,
  signed: (id: string) => ['media-signed', id] as const,
};

export interface MediaListParams {
  q?: string;
  kind?: MediaKind | '';
  page?: number;
  page_size?: number;
}

interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export function useInstructorMedia(params: MediaListParams = {}) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: async () => {
      const clean: Record<string, string | number> = {};
      if (params.q) clean.q = params.q;
      if (params.kind) clean.kind = params.kind;
      if (params.page) clean.page = params.page;
      if (params.page_size) clean.page_size = params.page_size;
      const { data } = await api.get<Paginated<MediaAsset> | MediaAsset[]>(
        '/instructor/media/',
        { params: clean },
      );
      // Le backend peut renvoyer soit un tableau, soit paginé
      if (Array.isArray(data)) {
        return {
          count: data.length,
          next: null,
          previous: null,
          results: data,
        } as Paginated<MediaAsset>;
      }
      return data;
    },
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

export function useMediaAssetDetail(id: string | undefined) {
  return useQuery({
    queryKey: KEYS.detail(id ?? ''),
    queryFn: async () => {
      const { data } = await api.get<MediaAsset>(
        `/instructor/media/${id}/`,
      );
      return data;
    },
    enabled: !!id,
  });
}

export function useRenameMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const { data } = await api.post<MediaAsset>(
        `/instructor/media/${id}/update/`,
        { title },
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instructor-media'] });
    },
  });
}

export function useDeleteMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Le backend expose HTTP DELETE sur cette URL (pas POST).
      const { data } = await api.delete(`/instructor/media/${id}/delete/`);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instructor-media'] });
    },
  });
}

/**
 * Upload direct (fichier < 100 Mo). Utilise le flow presigned :
 *   1) POST /media/upload/init/ → obtient URL upload + object_key
 *   2) PUT sur l'URL signée (multipart pas nécessaire pour petit fichier)
 *   3) POST /media/upload/finalize/ → crée le MediaAsset côté backend
 */
export interface UploadInitPayload {
  filename: string;
  content_type: string;
  size: number;
  kind: MediaKind;
}

interface UploadInitResponse {
  upload_id: string;      // ← Requis par MediaUploadFinalizeSerializer
  bucket?: string;
  upload_url: string;
  object_key: string;
  method?: 'PUT' | 'POST';
  headers?: Record<string, string>;
}

export function useUploadMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      file,
      title,
      onProgress,
    }: {
      file: File;
      title?: string;
      onProgress?: (pct: number) => void;
    }) => {
      const kind: MediaKind = file.type.startsWith('video/')
        ? 'video'
        : file.type.startsWith('audio/')
          ? 'audio'
          : 'doc';

      // 1) init
      const { data: init } = await api.post<UploadInitResponse>(
        '/media/upload/init/',
        {
          filename: file.name,
          content_type: file.type,
          size: file.size,
          kind,
        },
      );

      // 2) upload direct sur MinIO (URL signée)
      const uploadResp = await fetch(init.upload_url, {
        method: init.method || 'PUT',
        headers: {
          'Content-Type': file.type,
          ...(init.headers || {}),
        },
        body: file,
      });
      if (!uploadResp.ok) {
        throw new Error(`Upload MinIO échec (${uploadResp.status})`);
      }
      onProgress?.(90);

      // 3) finalize — upload_id est OBLIGATOIRE côté backend
      const { data: asset } = await api.post<MediaAsset>(
        '/media/upload/finalize/',
        {
          upload_id: init.upload_id,
          object_key: init.object_key,
          content_type: file.type,
          size: file.size,
          kind,
          title: title || file.name,
        },
      );
      onProgress?.(100);
      qc.invalidateQueries({ queryKey: ['instructor-media'] });
      return asset;
    },
  });
}

/**
 * Récupère une URL signée pour afficher/lire un asset (streaming vidéo).
 */
export function useMediaSignedURL(id: string | undefined) {
  return useQuery({
    queryKey: KEYS.signed(id ?? ''),
    queryFn: async () => {
      const { data } = await api.get<{ url: string; expires_in?: number }>(
        `/learner/media/${id}/signed/`,
      );
      return data;
    },
    enabled: !!id,
    staleTime: 60_000,
  });
}
