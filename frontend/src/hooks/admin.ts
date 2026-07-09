/**
 * hooks/admin.ts — Hooks TanStack pour les endpoints admin plateforme (R7).
 *
 * Endpoints backend :
 *   GET    /api/admin/users/                    → liste paginée
 *   GET    /api/admin/users/:id/                → détail
 *   PATCH  /api/admin/users/:id/                → update whitelisté
 *   POST   /api/admin/users/:id/reset-password/ → génère un token reset
 *   GET    /api/admin/config/                   → config runtime
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type {
  Paginated,
  AdminUserListItem,
  AdminUserDetail,
  AdminUserFilters,
  AdminUserUpdatePayload,
  AdminConfig,
} from '@/lib/types';

const KEYS = {
  users: (filters: AdminUserFilters) => ['admin-users', filters] as const,
  userDetail: (id: number | string) => ['admin-user', String(id)] as const,
  config: () => ['admin-config'] as const,
};

// ─────────────────────────────────────────────────────────────────────
// Users
// ─────────────────────────────────────────────────────────────────────

export function useAdminUsers(filters: AdminUserFilters = {}) {
  return useQuery({
    queryKey: KEYS.users(filters),
    queryFn: async () => {
      const params: Record<string, string | number> = {};
      if (filters.q) params.q = filters.q;
      if (filters.role && filters.role !== 'all') params.role = filters.role;
      if (filters.is_active) params.is_active = filters.is_active;
      if (filters.page) params.page = filters.page;
      const { data } = await api.get<Paginated<AdminUserListItem>>(
        '/admin/users/',
        { params },
      );
      return data;
    },
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

export function useAdminUserDetail(id: number | string | undefined) {
  return useQuery({
    queryKey: KEYS.userDetail(id ?? ''),
    queryFn: async () => {
      const { data } = await api.get<AdminUserDetail>(`/admin/users/${id}/`);
      return data;
    },
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useUpdateAdminUser(id: number | string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: AdminUserUpdatePayload) => {
      const { data } = await api.patch<AdminUserDetail>(
        `/admin/users/${id}/`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      qc.invalidateQueries({ queryKey: KEYS.userDetail(id) });
    },
  });
}

export function useResetPasswordAdminUser() {
  return useMutation({
    mutationFn: async (userId: number | string) => {
      const { data } = await api.post<{
        detail: string;
        token: string | null;
        expires_at: string | null;
      }>(`/admin/users/${userId}/reset-password/`);
      return data;
    },
  });
}

// ─────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────

export function useAdminConfig() {
  return useQuery({
    queryKey: KEYS.config(),
    queryFn: async () => {
      const { data } = await api.get<AdminConfig>('/admin/config/');
      return data;
    },
    staleTime: 60_000,
  });
}
