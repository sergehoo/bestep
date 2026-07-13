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
      if (filters.verified) params.verified = filters.verified;
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
// Create user (R47)
// ─────────────────────────────────────────────────────────────────────

export type AdminUserCreateRole = 'LEARNER' | 'INSTRUCTOR' | 'ADMIN' | 'STAFF';

export interface AdminUserCreatePayload {
  email: string;
  full_name?: string;
  phone?: string;
  role: AdminUserCreateRole;
  password?: string;
  is_active?: boolean;
  instructor_headline?: string;
  instructor_bio?: string;
  instructor_payout_percent?: number;
  learner_job_title?: string;
}

export interface AdminUserCreateResult extends AdminUserDetail {
  created_role: AdminUserCreateRole;
  temporary_password?: string;
}

export function useCreateAdminUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: AdminUserCreatePayload) => {
      const { data } = await api.post<AdminUserCreateResult>(
        '/admin/users/',
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      qc.invalidateQueries({ queryKey: ['admin-overview'] });
      qc.invalidateQueries({ queryKey: ['admin-instructors'] });
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

// ─────────────────────────────────────────────────────────────────────
// Platform settings (R46) — persistés + versionnés
// ─────────────────────────────────────────────────────────────────────

export type PlatformSettingsSection =
  | 'identity'
  | 'auth'
  | 'emails'
  | 'storage'
  | 'limits'
  | 'maintenance';

export interface PlatformSettingsData {
  identity: Record<string, unknown>;
  auth: Record<string, unknown>;
  emails: Record<string, unknown>;
  storage: Record<string, unknown>;
  limits: Record<string, unknown>;
  maintenance: Record<string, unknown>;
}

export interface PlatformSettingsPayload {
  version: number;
  updated_at: string;
  updated_by: { id: number; email: string; full_name: string } | null;
  data: PlatformSettingsData;
  defaults: PlatformSettingsData;
}

export interface PlatformSettingsPatchInput {
  patch: Partial<Record<PlatformSettingsSection, Record<string, unknown>>>;
  note?: string;
}

export interface PlatformSettingsPatchResult extends PlatformSettingsPayload {
  diff: Array<{
    section: string;
    key: string;
    old: unknown;
    new: unknown;
  }>;
  history_id: number;
}

export interface PlatformSettingsHistoryEntry {
  id: number;
  version: number;
  created_at: string;
  actor: { id: number; email: string; full_name: string } | null;
  note: string;
  diff: Array<{ section: string; key: string; old: unknown; new: unknown }>;
  diff_count: number;
}

const PLATFORM_KEYS = {
  settings: () => ['admin-platform-settings'] as const,
  history: () => ['admin-platform-settings-history'] as const,
};

export function usePlatformSettings() {
  return useQuery({
    queryKey: PLATFORM_KEYS.settings(),
    queryFn: async () => {
      const { data } = await api.get<PlatformSettingsPayload>(
        '/admin/platform-settings/',
      );
      return data;
    },
    staleTime: 30_000,
  });
}

export function useUpdatePlatformSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PlatformSettingsPatchInput) => {
      const { data } = await api.patch<PlatformSettingsPatchResult>(
        '/admin/platform-settings/',
        input,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PLATFORM_KEYS.settings() });
      qc.invalidateQueries({ queryKey: PLATFORM_KEYS.history() });
    },
  });
}

export function usePlatformSettingsHistory(limit = 20) {
  return useQuery({
    queryKey: [...PLATFORM_KEYS.history(), limit],
    queryFn: async () => {
      const { data } = await api.get<{
        generated_at: string;
        count: number;
        results: PlatformSettingsHistoryEntry[];
      }>('/admin/platform-settings/history/', { params: { limit } });
      return data;
    },
    staleTime: 30_000,
  });
}
