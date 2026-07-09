/**
 * src/stores/auth.ts — Store Zustand pour l'authentification JWT (R3.2).
 *
 * Persist via localStorage (clé "be-auth") pour survivre au refresh de page.
 * Le middleware persist reste synchronisé avec les tokens que le
 * request interceptor peut mettre à jour lui-même (voir api.ts).
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '@/lib/api';
import type { User, LoginPayload, RegisterPayload } from '@/lib/types';

interface AuthState {
  access: string | null;
  refresh: string | null;
  user: User | null;
  loading: boolean;
  error: string | null;

  // Actions
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  fetchMe: () => Promise<void>;
  hydrateFromStorage: () => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      access: null,
      refresh: null,
      user: null,
      loading: false,
      error: null,

      login: async (payload) => {
        set({ loading: true, error: null });
        try {
          const { data } = await api.post('/auth/login/', payload);
          set({
            access: data.access,
            refresh: data.refresh,
            user: data.user,
            loading: false,
          });
        } catch (e: unknown) {
          const err = e as { response?: { data?: { detail?: string } } };
          set({
            loading: false,
            error: err.response?.data?.detail || 'Identifiants incorrects.',
          });
          throw e;
        }
      },

      register: async (payload) => {
        set({ loading: true, error: null });
        try {
          const { data } = await api.post('/auth/register/', payload);
          set({
            access: data.access,
            refresh: data.refresh,
            user: data.user,
            loading: false,
          });
        } catch (e: unknown) {
          const err = e as { response?: { data?: Record<string, unknown> } };
          const errData = err.response?.data;
          // DRF renvoie soit {detail: "..."} soit {email: ["..."], password: ["..."]}
          let message = 'Erreur lors de la création du compte.';
          if (errData) {
            if (typeof errData.detail === 'string') {
              message = errData.detail;
            } else {
              const firstKey = Object.keys(errData)[0];
              if (firstKey) {
                const val = errData[firstKey];
                message = Array.isArray(val) ? String(val[0]) : String(val);
              }
            }
          }
          set({ loading: false, error: message });
          throw e;
        }
      },

      logout: async () => {
        const refresh = get().refresh;
        if (refresh) {
          try {
            await api.post('/auth/logout/', { refresh });
          } catch {
            // Best-effort : même si la blacklist échoue, on clear côté client.
          }
        }
        get().clear();
      },

      fetchMe: async () => {
        if (!get().access) return;
        try {
          const { data } = await api.get('/auth/me/');
          set({ user: data });
        } catch {
          // 401 → interceptor déjà en train de gérer le refresh, sinon logout.
        }
      },

      hydrateFromStorage: () => {
        // Appelé au boot dans App.tsx pour se synchroniser avec
        // d'éventuels refresh tokens mis à jour par le request interceptor
        // (qui écrit directement dans localStorage, hors du store).
        try {
          const raw = localStorage.getItem('be-auth');
          if (!raw) return;
          const parsed = JSON.parse(raw);
          const state = parsed?.state;
          if (state && (state.access !== get().access || state.refresh !== get().refresh)) {
            set({ access: state.access, refresh: state.refresh, user: state.user });
          }
        } catch {
          /* ignore */
        }
      },

      clear: () => {
        set({ access: null, refresh: null, user: null, error: null });
        try {
          localStorage.removeItem('be-auth');
        } catch { /* ignore */ }
      },
    }),
    {
      name: 'be-auth',
      partialize: (state) => ({
        access: state.access,
        refresh: state.refresh,
        user: state.user,
      }),
    },
  ),
);

// Selectors utiles pour les composants (perf : re-render minimal)
export const useAuthAccess = () => useAuthStore((s) => s.access);
export const useAuthUser = () => useAuthStore((s) => s.user);
export const useIsAuthenticated = () => useAuthStore((s) => !!s.access);
export const useHasRole = (role: string) =>
  useAuthStore((s) => s.user?.roles?.includes(role as never) ?? false);
export const useIsPlatformAdmin = () =>
  useAuthStore((s) => s.user?.is_platform_admin ?? false);
