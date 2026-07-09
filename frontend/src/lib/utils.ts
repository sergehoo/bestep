/**
 * src/lib/utils.ts — Utilitaires transverses.
 */
import { clsx, type ClassValue } from 'clsx';

/**
 * cn : merge de classes Tailwind avec dédoublonnage.
 * Usage : className={cn('be-btn-primary', size === 'lg' && 'be-btn-lg')}
 */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

/**
 * Formate un prix en devise locale (XOF par défaut).
 */
export function formatPrice(amount: string | number, currency = 'XOF'): string {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (currency === 'XOF') {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n) + ' FCFA';
  }
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(n);
}

/**
 * Formate une durée en secondes → "1h 25m" ou "45m 12s".
 */
export function formatDuration(sec: number): string {
  if (!sec || sec < 0) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`;
  return `${s}s`;
}

/**
 * Extrait un message d'erreur user-friendly depuis une erreur Axios.
 */
export function extractApiError(err: unknown, fallback = 'Une erreur est survenue.'): string {
  if (typeof err === 'string') return err;
  const anyErr = err as { response?: { data?: unknown }; message?: string };
  const data = anyErr?.response?.data;
  if (typeof data === 'string') return data;
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (typeof obj.detail === 'string') return obj.detail;
    const firstKey = Object.keys(obj)[0];
    if (firstKey) {
      const val = obj[firstKey];
      return Array.isArray(val) ? String(val[0]) : String(val);
    }
  }
  return anyErr?.message || fallback;
}
