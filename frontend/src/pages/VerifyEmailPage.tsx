/**
 * VerifyEmailPage.tsx — Écran de vérification e-mail (SECURITE-05).
 *
 * Deux usages :
 *   1. L'utilisateur ouvre `/verify-email?uid=...&token=...` depuis le
 *      mail reçu → POST /api/auth/verify-email/ automatique.
 *   2. L'utilisateur atterrit sur `/verify-email` sans paramètre (via le
 *      DashboardResolver quand ``email_verified===false``) → affiche
 *      "Vérifiez votre boîte mail" + bouton "Renvoyer le mail".
 */
import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import api from '@/lib/api';
import { useAuthStore, useAuthUser } from '@/stores/auth';

type Phase = 'idle' | 'verifying' | 'success' | 'error' | 'resending';

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthUser();
  const uid = params.get('uid');
  const token = params.get('token');
  const justRegistered = Boolean(
    (location.state as { justRegistered?: boolean } | null)?.justRegistered,
  );

  const [phase, setPhase] = useState<Phase>(uid && token ? 'verifying' : 'idle');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [cooldown, setCooldown] = useState(0);
  const [checking, setChecking] = useState(false);

  // Court-circuit : si le user est DÉJÀ vérifié (retour depuis un autre
  // onglet où le lien a été cliqué), on redirige immédiatement.
  useEffect(() => {
    if (user?.email_verified === true) {
      navigate('/dashboard', { replace: true });
    }
  }, [user?.email_verified, navigate]);

  // 1) Auto-verification si uid+token présents (clic depuis mail).
  useEffect(() => {
    if (!uid || !token) return;
    (async () => {
      try {
        await api.post('/auth/verify-email/', { uid: Number(uid), token });
        setPhase('success');
        // Recharge /me pour refléter le nouveau statut dans le store.
        try {
          await useAuthStore.getState().fetchMe();
        } catch {
          /* noop */
        }
        setTimeout(() => navigate('/dashboard', { replace: true }), 1500);
      } catch (e: unknown) {
        const err = e as { response?: { data?: { detail?: string } } };
        setErrorMsg(err.response?.data?.detail ?? 'Lien invalide ou expiré.');
        setPhase('error');
      }
    })();
  }, [uid, token, navigate]);

  // 2) Cooldown local pour éviter le spam du bouton.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  // 3) Poll /me périodique pour détecter la vérification faite depuis
  //    un autre onglet / device. Dépendances STABLES uniquement pour
  //    ne pas ré-exécuter l'effect à chaque fetchMe() (sinon spam).
  //    Backoff explicite si 429 (60 s) pour laisser le throttle DRF
  //    se vider.
  useEffect(() => {
    if (uid && token) return; // Auto-vérif en cours, pas de poll.

    let cancelled = false;
    let inFlight = false;
    let lastRunAt = 0;
    let backoffUntil = 0;
    const DEBOUNCE_MS = 5_000;

    const runCheck = async () => {
      if (cancelled) return;
      const now = Date.now();
      // Backoff après 429 : on skip tant que la fenêtre n'est pas passée.
      if (now < backoffUntil) return;
      // Lecture fraîche du store — évite les closures obsolètes.
      const currentUser = useAuthStore.getState().user;
      if (!currentUser) return;
      if (currentUser.email_verified === true) {
        navigate('/dashboard', { replace: true });
        return;
      }
      if (inFlight) return;
      if (now - lastRunAt < DEBOUNCE_MS) return;
      inFlight = true;
      lastRunAt = now;
      try {
        // Appel direct pour voir les erreurs (fetchMe du store les avale).
        const { data } = await api.get<typeof currentUser>('/auth/me/');
        useAuthStore.setState({ user: data });
        if (cancelled) return;
        if (data?.email_verified === true) {
          navigate('/dashboard', { replace: true });
        }
      } catch (e: unknown) {
        const status = (e as { response?: { status?: number } })?.response?.status;
        if (status === 429) {
          // On respecte le throttle : pause 60 s.
          backoffUntil = Date.now() + 60_000;
        }
        /* 401 / réseau → prochaine tick */
      } finally {
        inFlight = false;
      }
    };
    // Refresh immédiat au mount + toutes les 30 s.
    void runCheck();
    const intervalId = window.setInterval(runCheck, 30_000);
    const onFocus = () => void runCheck();
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
    };
    // Deps stables — user lu via getState() dans runCheck.
  }, [uid, token, navigate]);

  async function checkNow() {
    setChecking(true);
    setErrorMsg('');
    setPhase('idle');
    try {
      // Appel direct pour capter les 429/401 (fetchMe du store les avale).
      const { data } = await api.get<typeof user>('/auth/me/');
      useAuthStore.setState({ user: data });
      if (data?.email_verified === true) {
        navigate('/dashboard', { replace: true });
        return;
      }
      // Pas d'erreur mais toujours pas vérifié → message informatif.
      setErrorMsg(
        "Votre e-mail n'apparaît pas encore comme vérifié. Ouvrez le mail et cliquez le lien, puis retentez.",
      );
      setPhase('error');
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 429) {
        setErrorMsg(
          "Trop de vérifications successives. Merci de patienter environ 60 secondes.",
        );
      } else if (status === 401) {
        setErrorMsg(
          "Votre session a expiré. Reconnectez-vous pour reprendre la vérification.",
        );
      } else {
        setErrorMsg(
          "Impossible de contacter le serveur pour l'instant. Vérifiez votre connexion.",
        );
      }
      setPhase('error');
    } finally {
      setChecking(false);
    }
  }

  async function resend() {
    setPhase('resending');
    setErrorMsg('');
    try {
      await api.post('/auth/verify-email/resend/');
      setCooldown(60);
      setPhase('idle');
    } catch (e: unknown) {
      const err = e as {
        response?: {
          data?: { detail?: string; retry_after_seconds?: number };
        };
      };
      setErrorMsg(err.response?.data?.detail ?? 'Impossible de renvoyer.');
      setCooldown(err.response?.data?.retry_after_seconds ?? 30);
      setPhase('error');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-neutral-50 dark:bg-neutral-900">
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary text-2xl">
            @
          </div>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
            {justRegistered ? 'Bienvenue !' : 'Vérification de votre e-mail'}
          </h1>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            {justRegistered
              ? `Votre compte est créé. Nous vous avons envoyé un lien de vérification${user?.email ? ` à ${user.email}` : ''}. Cliquez dessus pour activer votre accès.`
              : user?.email
                ? `Un lien de vérification a été envoyé à ${user.email}.`
                : 'Un lien de vérification vous a été envoyé.'}
          </p>
        </div>

        {phase === 'verifying' && (
          <div
            role="status"
            aria-live="polite"
            className="rounded-lg bg-neutral-100 p-4 text-sm text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
          >
            Vérification en cours…
          </div>
        )}

        {phase === 'success' && (
          <div
            role="status"
            aria-live="polite"
            className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
          >
            E-mail vérifié. Redirection…
          </div>
        )}

        {phase === 'error' && (
          <div
            role="alert"
            className="rounded-lg bg-rose-50 p-4 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300"
          >
            {errorMsg}
          </div>
        )}

        {(phase === 'idle' || phase === 'error' || phase === 'resending') && (
          <div className="mt-6 space-y-3">
            {/*
             * SECURITE-05 — Bouton d'action principale : "Vérifier
             * maintenant". Utile si l'utilisateur a cliqué le lien
             * dans un autre onglet, cet onglet ne se met pas à jour
             * automatiquement s'il n'a pas le focus. Un poll tourne
             * quand même en arrière-plan toutes les 10s.
             */}
            <button
              type="button"
              onClick={checkNow}
              disabled={checking}
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-white text-sm font-medium disabled:opacity-50"
            >
              {checking ? 'Vérification…' : "J'ai cliqué le lien — vérifier maintenant"}
            </button>
            <button
              type="button"
              onClick={resend}
              disabled={phase === 'resending' || cooldown > 0}
              className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 px-4 py-2.5 text-sm font-medium text-neutral-800 dark:text-neutral-100 disabled:opacity-50"
            >
              {phase === 'resending'
                ? 'Envoi en cours…'
                : cooldown > 0
                  ? `Renvoyer (${cooldown}s)`
                  : 'Renvoyer le mail de vérification'}
            </button>
            {/*
             * SECURITE-05 — Ne pas utiliser <Link to="/login"> ici.
             * L'utilisateur est encore authentifié (session ouverte depuis
             * le signup) donc GuestOnlyRoute le renverrait vers
             * /dashboard → DashboardResolver → /verify-email (loop).
             * On purge la session avant de naviguer.
             */}
            <button
              type="button"
              onClick={async () => {
                try {
                  await useAuthStore.getState().logout();
                } catch {
                  useAuthStore.getState().clear();
                }
                navigate('/login', { replace: true });
              }}
              className="block w-full text-center text-sm text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
            >
              Se déconnecter et retourner à la connexion
            </button>
            <p className="text-center text-[11px] text-neutral-500 dark:text-neutral-500">
              Le statut est vérifié automatiquement toutes les 30 secondes.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
