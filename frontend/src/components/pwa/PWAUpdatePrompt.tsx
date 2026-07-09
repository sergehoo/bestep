/**
 * PWAUpdatePrompt.tsx — Toast qui invite l'user à recharger quand un
 * nouveau service worker est en attente (R8.3).
 *
 * Design : notification bas-droite discrète, dismissable, cliquable
 * "Recharger" qui appelle `updateSW(true)`.
 */
import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';

/**
 * `vite-plugin-pwa` expose `registerSW` via son virtual module.
 * On l'importe dynamiquement pour ne pas casser le typecheck si le
 * plugin est désactivé.
 */
type UpdateFn = (reloadPage?: boolean) => Promise<void>;

export function PWAUpdatePrompt() {
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [updateSW, setUpdateSW] = useState<UpdateFn | null>(null);

  useEffect(() => {
    // Import dynamique du virtual module généré par vite-plugin-pwa.
    // Si le plugin n'est pas actif (SSR, tests), on ignore silencieusement.
    let cancelled = false;
    (async () => {
      try {
        const mod: {
          registerSW: (opts: {
            onNeedRefresh?: () => void;
            onOfflineReady?: () => void;
          }) => UpdateFn;
        } = await import(
          /* @vite-ignore */ 'virtual:pwa-register'
        );
        if (cancelled) return;
        const update = mod.registerSW({
          onNeedRefresh: () => setNeedsRefresh(true),
        });
        setUpdateSW(() => update);
      } catch {
        // Plugin absent : rien à faire.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!needsRefresh) return null;

  return (
    <div
      role="alert"
      className="fixed bottom-4 right-4 z-50 max-w-sm bg-white border border-primary-200 rounded-2xl shadow-lift p-4 flex items-start gap-3"
    >
      <RefreshCw className="w-5 h-5 text-primary-600 shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-sm font-bold text-neutral-900">
          Nouvelle version disponible
        </p>
        <p className="text-xs text-neutral-500 mt-0.5">
          Rechargez pour bénéficier des dernières améliorations.
        </p>
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => updateSW && updateSW(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary-600 text-white hover:bg-primary-700 transition"
          >
            Recharger
          </button>
          <button
            onClick={() => setNeedsRefresh(false)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-neutral-600 hover:bg-neutral-100 transition"
          >
            Plus tard
          </button>
        </div>
      </div>
      <button
        onClick={() => setNeedsRefresh(false)}
        className="p-1 rounded hover:bg-neutral-100"
        aria-label="Fermer"
      >
        <X className="w-4 h-4 text-neutral-400" />
      </button>
    </div>
  );
}
