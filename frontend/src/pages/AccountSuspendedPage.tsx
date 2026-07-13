/**
 * AccountSuspendedPage.tsx — Écran affiché quand ``is_active=false``.
 *
 * Un admin plateforme a désactivé le compte : Best-AI, création de
 * cours, participation, tout est bloqué au niveau backend. Cette page
 * l'informe et propose une déconnexion propre.
 */
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';

export default function AccountSuspendedPage() {
  // Purge la session locale pour éviter tout accès résiduel.
  useEffect(() => {
    // On efface les tokens mais on laisse la page visible.
    useAuthStore.getState().clear();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-neutral-50 dark:bg-neutral-900">
      <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-8 shadow-sm dark:border-rose-900/50 dark:bg-neutral-950">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-rose-100 flex items-center justify-center text-rose-700 text-xl dark:bg-rose-950 dark:text-rose-300">
            ⚠
          </div>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
            Compte suspendu
          </h1>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Votre compte a été temporairement désactivé par un
            administrateur. Vous ne pouvez plus accéder à la plateforme.
          </p>
        </div>

        <div className="rounded-lg bg-rose-50 p-4 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">
          Si vous pensez qu'il s'agit d'une erreur, contactez notre équipe
          support à <a className="underline" href="mailto:support@best-epargne.local">support@best-epargne.local</a>.
        </div>

        <div className="mt-6">
          <Link
            to="/login"
            className="block text-center text-sm text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            Retour à la connexion
          </Link>
        </div>
      </div>
    </div>
  );
}
