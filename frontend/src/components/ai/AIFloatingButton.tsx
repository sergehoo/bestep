/**
 * AIFloatingButton.tsx — Bouton flottant global (bas-droite).
 *
 * Best-AI est réservé aux utilisateurs authentifiés et actifs :
 * le bouton est purement absent (return null) pour tout visiteur non
 * connecté. Cette vérification double celle du composant parent
 * AIAssistant pour garantir qu'aucun état bâtard ne fait fuiter le
 * bouton sur les pages publiques.
 */
import { Sparkles } from 'lucide-react';
import { useAIPanel } from '@/stores/ai';
import { useAuthUser, useIsAuthenticated } from '@/stores/auth';

export function AIFloatingButton() {
  const isAuth = useIsAuthenticated();
  const user = useAuthUser();
  const isActive = user?.is_active !== false;
  const { isOpen, open } = useAIPanel();

  if (!isAuth || !isActive || isOpen) return null;

  return (
    <button
      type="button"
      onClick={() => open()}
      className="fixed bottom-5 right-5 z-40 group inline-flex items-center gap-2 pl-3 pr-4 py-2.5 rounded-full bg-primary-600 hover:bg-primary-700 text-white shadow-lg shadow-primary-500/30 transition"
      aria-label="Ouvrir Best-AI"
    >
      <span className="relative inline-flex">
        <Sparkles className="w-5 h-5" />
        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
      </span>
      <span className="text-sm font-bold">Best-AI</span>
    </button>
  );
}
