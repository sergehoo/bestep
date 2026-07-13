/**
 * DashboardResolver.tsx — Route neutre `/dashboard`.
 *
 * Sert de point d'entrée post-login/register. Résout la vraie
 * destination selon le rôle réel du user (récupéré du store, hydraté
 * depuis /api/auth/me), et ne présuppose JAMAIS un fallback admin.
 *
 * Ordre de décision (aligné sur le cahier des charges) :
 *   1. Non authentifié          → /login
 *   2. Compte désactivé          → /account/suspended (à créer si besoin)
 *   3. Email non vérifié         → /verify-email
 *   4. Platform admin            → /dashboard/admin
 *   5. Instructor                → /instructor
 *   6. Org admin                 → /instructor (gestion des cours pour l'org)
 *   7. Learner (par défaut)      → /learn
 */
import { Navigate } from 'react-router-dom';
import { useAuthUser, useIsAuthenticated } from '@/stores/auth';
import { resolvePostLoginTarget } from '@/lib/auth-redirect';

export function DashboardResolver() {
  const isAuth = useIsAuthenticated();
  const user = useAuthUser();

  if (!isAuth) {
    return <Navigate to="/login?next=/dashboard" replace />;
  }

  // Compte désactivé côté serveur — refuser silencieusement.
  if (user?.is_active === false) {
    return <Navigate to="/account-suspended" replace />;
  }

  // E-mail non vérifié : redirection vers l'écran de vérification.
  if (user?.email_verified === false) {
    return <Navigate to="/verify-email" replace />;
  }

  // Formateur en attente d'approbation → écran dédié (pas d'espace instructor).
  if (user?.approval_status === 'pending') {
    return <Navigate to="/instructor-pending" replace />;
  }

  const target = resolvePostLoginTarget(
    user?.roles,
    user?.is_platform_admin ?? false,
  );
  return <Navigate to={target} replace />;
}
