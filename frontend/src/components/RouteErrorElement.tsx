/**
 * RouteErrorElement.tsx — R29.2
 *
 * `errorElement` global pour toutes les routes React Router. Remplace
 * la page "Unexpected Application Error" par un rendu propre et actionnable.
 * Utilisé par défaut sur chaque route du router.
 *
 * Le composant reste léger (pas de traduction, pas d'appel API), pour
 * pouvoir s'afficher même si tout le reste plante.
 */
import { useMemo } from 'react';
import { Link, isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { AlertTriangle, Home, RefreshCw, ArrowLeft } from 'lucide-react';

export function RouteErrorElement() {
  const error = useRouteError();

  const { title, hint, detail } = useMemo(() => {
    // Erreur React Router (loader/action rejeté avec Response, 404, etc.)
    if (isRouteErrorResponse(error)) {
      if (error.status === 404) {
        return {
          title: 'Page introuvable',
          hint: 'La page que vous cherchez n\'existe pas ou a été déplacée.',
          detail: undefined,
        };
      }
      if (error.status === 401 || error.status === 403) {
        return {
          title: 'Accès refusé',
          hint: 'Vous n\'êtes pas autorisé à consulter cette page. Reconnectez-vous ou contactez un administrateur.',
          detail: undefined,
        };
      }
      return {
        title: `Erreur ${error.status}`,
        hint: error.statusText || 'Une erreur est survenue côté serveur.',
        detail: typeof error.data === 'string' ? error.data : undefined,
      };
    }
    // Erreur JS classique (composant qui throw, undefined access…)
    if (error instanceof Error) {
      return {
        title: 'Une erreur inattendue est survenue',
        hint: 'Nos équipes ont été notifiées. Vous pouvez recharger la page ou revenir à l\'accueil.',
        detail: error.message,
      };
    }
    return {
      title: 'Une erreur inattendue est survenue',
      hint: 'Vous pouvez recharger la page ou revenir à l\'accueil.',
      detail: undefined,
    };
  }, [error]);

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 flex items-center justify-center">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h1 className="mt-5 text-2xl sm:text-3xl font-extrabold">{title}</h1>
        <p className="mt-2 text-sm sm:text-base text-neutral-600 dark:text-neutral-300">
          {hint}
        </p>

        {detail && (
          <details className="mt-4 text-left">
            <summary className="text-xs font-semibold text-neutral-500 cursor-pointer hover:text-neutral-900 dark:hover:text-white">
              Détail technique
            </summary>
            <pre className="mt-2 p-3 bg-neutral-100 dark:bg-neutral-800 rounded-xl text-[11px] font-mono text-neutral-700 dark:text-neutral-300 overflow-x-auto whitespace-pre-wrap break-words">
              {detail}
            </pre>
          </details>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold transition"
          >
            <RefreshCw className="w-4 h-4" />
            Recharger la page
          </button>
          <button
            type="button"
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour
          </button>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition"
          >
            <Home className="w-4 h-4" />
            Accueil
          </Link>
        </div>

        <p className="mt-8 text-xs text-neutral-400">
          Si le problème persiste, contactez le support.
        </p>
      </div>
    </div>
  );
}

export default RouteErrorElement;
