/**
 * InstructorPendingPage.tsx — Écran d'attente d'approbation formateur.
 *
 * Un compte formateur nouvellement créé est ``is_verified=False``. Il
 * doit être validé manuellement par un admin plateforme avant d'avoir
 * accès à l'espace ``/instructor``. Cette page présente ce statut et
 * propose une redirection alternative vers l'espace apprenant (que
 * tout instructor peut aussi utiliser).
 */
import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore, useAuthUser } from '@/stores/auth';

export default function InstructorPendingPage() {
  const user = useAuthUser();
  const navigate = useNavigate();

  // SECURITE-06 — poll /me toutes les 30s pour détecter l'approbation
  // sans forcer l'utilisateur à recharger la page. Dès que
  // ``approval_status === 'approved'`` on redirige vers /instructor.
  useEffect(() => {
    // Court-circuit si déjà approuvé (au cas où on arrive ici par erreur).
    if (user?.approval_status === 'approved') {
      navigate('/instructor', { replace: true });
      return;
    }
    let cancelled = false;
    const intervalId = window.setInterval(() => {
      if (cancelled) return;
      void useAuthStore.getState().fetchMe().then(() => {
        if (cancelled) return;
        const fresh = useAuthStore.getState().user;
        if (fresh?.approval_status === 'approved') {
          navigate('/instructor', { replace: true });
        }
      });
    }, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [navigate, user?.approval_status]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-neutral-50 dark:bg-neutral-900">
      <div className="w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 text-xl dark:bg-amber-950 dark:text-amber-300">
            ⏳
          </div>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
            Compte formateur en attente
          </h1>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Bonjour {user?.full_name || user?.email},<br />
            votre compte formateur a bien été créé. Un administrateur va
            examiner votre demande sous 24-72 heures. Vous recevrez un
            e-mail dès la validation.
          </p>
        </div>

        <div className="rounded-lg bg-neutral-100 p-4 text-sm text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
          <p className="font-medium mb-1">En attendant :</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Vous pouvez naviguer sur le catalogue.</li>
            <li>Vous pouvez suivre des cours en tant qu'apprenant.</li>
            <li>La création / publication de cours est bloquée jusqu'à validation.</li>
          </ul>
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => {
              void useAuthStore.getState().fetchMe().then(() => {
                const fresh = useAuthStore.getState().user;
                if (fresh?.approval_status === 'approved') {
                  navigate('/instructor', { replace: true });
                }
              });
            }}
            className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-white text-sm font-medium"
          >
            Vérifier le statut maintenant
          </button>
          <Link
            to="/learn"
            className="inline-flex items-center justify-center rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-800 dark:border-neutral-700 dark:text-neutral-100"
          >
            Continuer en tant qu'apprenant
          </Link>
          <Link
            to="/catalogue"
            className="inline-flex items-center justify-center rounded-lg text-sm text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            Explorer le catalogue
          </Link>
        </div>
        <p className="mt-4 text-center text-[11px] text-neutral-500 dark:text-neutral-500">
          Le statut est vérifié automatiquement toutes les 30 secondes.
        </p>
      </div>
    </div>
  );
}
