/**
 * src/lib/api.ts — Client Axios centralisé (R3.2).
 *
 * Fonctionnalités :
 *   - Request interceptor : injecte automatiquement Authorization: Bearer <access>
 *   - Response interceptor : refresh auto sur 401, retry avec nouveau token
 *   - Race-safe : plusieurs requêtes concurrentes qui expirent en même temps
 *                 partagent le même refresh en cours (pas de refresh × N).
 *
 * Usage :
 *   import api from '@/lib/api';
 *   const { data } = await api.get<Paginated<CourseListItem>>('/public/courses/');
 */
import axios, {
  AxiosError,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
} from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const API_BASE = import.meta.env.VITE_API_BASE || '/api';

const api = axios.create({
  baseURL: `${API_URL}${API_BASE}`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
});

// ─────────────────────────────────────────────────────────────────────
// Request interceptor : inject JWT
// ─────────────────────────────────────────────────────────────────────

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  // Lecture différée du store pour éviter les cycles d'import.
  const access = getStoredAccessToken();
  if (access && config.headers) {
    config.headers.Authorization = `Bearer ${access}`;
  }
  return config;
});

// ─────────────────────────────────────────────────────────────────────
// Response interceptor : refresh auto sur 401
// ─────────────────────────────────────────────────────────────────────

// Race-safe : plusieurs requêtes qui expirent simultanément partagent
// la même Promise de refresh.
let refreshPromise: Promise<string | null> | null = null;

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as AxiosRequestConfig & { _retry?: boolean };
    if (!original || error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }

    // Ne pas boucler sur les endpoints d'auth eux-mêmes.
    if (original.url?.includes('/auth/refresh/') || original.url?.includes('/auth/login/')) {
      return Promise.reject(error);
    }

    original._retry = true;

    // Un seul refresh en vol à la fois.
    if (!refreshPromise) {
      refreshPromise = performRefresh().finally(() => {
        // Reset après completion (succès ou échec).
        refreshPromise = null;
      });
    }

    const newAccess = await refreshPromise;
    if (!newAccess) {
      // Refresh a échoué → logout + redirect login.
      onAuthFailure();
      return Promise.reject(error);
    }

    // Retry la requête originale avec le nouveau token.
    if (original.headers) {
      (original.headers as Record<string, string>).Authorization = `Bearer ${newAccess}`;
    }
    return api(original);
  },
);

// ─────────────────────────────────────────────────────────────────────
// Helpers isolés (évitent cycles d'import avec le store)
// ─────────────────────────────────────────────────────────────────────

function getStoredAccessToken(): string | null {
  try {
    const raw = localStorage.getItem('be-auth');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.state?.access ?? null;
  } catch {
    return null;
  }
}

function getStoredRefreshToken(): string | null {
  try {
    const raw = localStorage.getItem('be-auth');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.state?.refresh ?? null;
  } catch {
    return null;
  }
}

function saveTokens(access: string, refresh: string): void {
  try {
    const raw = localStorage.getItem('be-auth');
    const parsed = raw ? JSON.parse(raw) : { state: {}, version: 0 };
    parsed.state = { ...parsed.state, access, refresh };
    localStorage.setItem('be-auth', JSON.stringify(parsed));
    // Notifie les autres onglets via storage event (voir stores/auth.ts).
    window.dispatchEvent(new CustomEvent('be-auth-refreshed'));
  } catch {
    // Storage quota / private mode : les tokens restent en mémoire dans le
    // store Zustand jusqu'au prochain reload.
  }
}

async function performRefresh(): Promise<string | null> {
  const refresh = getStoredRefreshToken();
  if (!refresh) return null;
  try {
    const { data } = await axios.post(
      `${API_URL}${API_BASE}/auth/refresh/`,
      { refresh },
      { headers: { 'Content-Type': 'application/json' } },
    );
    saveTokens(data.access, data.refresh || refresh);
    return data.access;
  } catch {
    return null;
  }
}

function onAuthFailure(): void {
  try {
    localStorage.removeItem('be-auth');
  } catch { /* ignore */ }
  // Redirect login (préserver la page courante en ?next=)
  const currentPath = window.location.pathname + window.location.search;
  const next = encodeURIComponent(currentPath);
  if (!window.location.pathname.startsWith('/login')) {
    window.location.href = `/login?next=${next}`;
  }
}

export default api;

// ─────────────────────────────────────────────────────────────────────
// Client "root" pour les endpoints Django hors préfixe /api (ex. /reviews/)
// Utilise le même flow JWT + refresh que le client principal.
// ─────────────────────────────────────────────────────────────────────

export const apiRoot = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
});

apiRoot.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const access = getStoredAccessToken();
  if (access && config.headers) {
    config.headers.Authorization = `Bearer ${access}`;
  }
  return config;
});

apiRoot.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as AxiosRequestConfig & { _retry?: boolean };
    if (!original || error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }
    original._retry = true;
    if (!refreshPromise) {
      refreshPromise = performRefresh().finally(() => {
        refreshPromise = null;
      });
    }
    const newAccess = await refreshPromise;
    if (!newAccess) {
      onAuthFailure();
      return Promise.reject(error);
    }
    if (original.headers) {
      (original.headers as Record<string, string>).Authorization = `Bearer ${newAccess}`;
    }
    return apiRoot(original);
  },
);
