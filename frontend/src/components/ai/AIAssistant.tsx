/**
 * AIAssistant.tsx — Point de montage global de Best-AI.
 *
 * Monté une seule fois dans le RootLayout du router. **Ne rend RIEN**
 * si l'utilisateur n'est pas authentifié et actif. C'est la première
 * ligne de défense côté frontend qui garantit que Best-AI n'apparaît
 * jamais sur les pages publiques (landing, /catalogue, /courses/:slug,
 * /login, /register, /certify/:code…).
 *
 * Les composants enfants ré-appliquent la même vérification en interne
 * (defense-in-depth).
 */
import { useAuthUser, useIsAuthenticated } from '@/stores/auth';
import { AIAssistantPanel } from './AIAssistantPanel';
import { AIFloatingButton } from './AIFloatingButton';

export function AIAssistant() {
  const isAuth = useIsAuthenticated();
  const user = useAuthUser();
  // is_active défaut à true si absent du payload — on considère un user
  // dont on ne connaît pas le flag comme actif (compat rétro).
  const isActive = user?.is_active !== false;

  if (!isAuth || !isActive) return null;

  return (
    <>
      <AIFloatingButton />
      <AIAssistantPanel />
    </>
  );
}
