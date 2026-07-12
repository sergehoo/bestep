/**
 * RootLayout.tsx — Layout racine monté au-dessus de toutes les routes.
 *
 * Rôle : rendre l'``<Outlet />`` de React Router + les éléments globaux
 * qui doivent apparaître sur toutes les pages (assistant IA flottant,
 * plus tard : bannière de maintenance, cookie banner, etc.).
 *
 * Doit rester léger : ne pas y mettre de logique métier lourde qui
 * s'exécuterait à chaque navigation.
 */
import { Outlet } from 'react-router-dom';
import { AIAssistant } from '@/components/ai/AIAssistant';

export function RootLayout() {
  return (
    <>
      <Outlet />
      <AIAssistant />
    </>
  );
}
