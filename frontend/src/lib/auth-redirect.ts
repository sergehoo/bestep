/**
 * lib/auth-redirect.ts — Résolution centralisée de la route post-login.
 *
 * Utilisé à la fois par le router (`GuestOnlyRoute`) et par la LoginPage
 * pour rediriger un utilisateur fraîchement authentifié vers son espace.
 *
 * Ordre de priorité :
 *   1. `is_platform_admin` → /dashboard/admin
 *   2. Rôle `platform_admin`, `org_admin` → /instructor (gèrent des cours)
 *   3. Rôle `instructor` → /instructor
 *   4. Sinon (apprenant par défaut) → /learn
 */
import type { UserRole } from '@/lib/types';

export function resolvePostLoginTarget(
  roles: UserRole[] | undefined | null,
  isPlatformAdmin: boolean | undefined | null,
): string {
  if (isPlatformAdmin) return '/dashboard/admin';
  const r = roles ?? [];
  if (r.includes('platform_admin')) return '/dashboard/admin';
  if (r.includes('org_admin')) return '/instructor';
  if (r.includes('instructor')) return '/instructor';
  return '/learn';
}

/**
 * Vérifie que la destination `next` fournie par la query string est sûre
 * (URL interne, pas d'open redirect). Retourne `null` sinon.
 */
export function sanitizeNextTarget(next: string | null): string | null {
  if (!next) return null;
  // Doit commencer par un slash et ne pas être un protocole (http://, //, …)
  if (!next.startsWith('/') || next.startsWith('//')) return null;
  return next;
}
