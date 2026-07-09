/**
 * LoginPage.tsx — Page de connexion premium (R23).
 *
 * Layout split-screen desktop (visuel gauche, formulaire droite), single
 * column mobile. Consomme `POST /api/auth/login/`.
 *
 * Fonctionnalités :
 * - Validation temps réel (React Hook Form + Zod)
 * - Toggle affichage mot de passe
 * - "Se souvenir de moi" persisté (email seul, jamais le mot de passe)
 * - Redirection intelligente par rôle après connexion (résolue via
 *   `resolvePostLoginTarget`)
 * - Détection utilisateur déjà connecté → redirect automatique
 * - Support ?next=<path> avec sanitize anti open-redirect
 * - Messages d'erreur clairs : identifiants invalides / compte désactivé
 *   / erreur réseau
 * - Boutons de connexion sociale (Google, LinkedIn, Microsoft) — désactivés
 *   par défaut, activables via variables d'environnement Vite
 * - Version dark-mode compatible via classes `dark:*` Tailwind
 * - Animations d'entrée Framer Motion
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Navigate,
  useNavigate,
  useSearchParams,
  Link,
} from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  BookOpen,
  Award,
  Users,
  Loader2,
} from 'lucide-react';

import {
  useAuthStore,
  useAuthUser,
  useIsAuthenticated,
} from '@/stores/auth';
import {
  resolvePostLoginTarget,
  sanitizeNextTarget,
} from '@/lib/auth-redirect';

// ─────────────────────────────────────────────────────────────
// Schéma de validation
// ─────────────────────────────────────────────────────────────

const schema = z.object({
  email: z
    .string()
    .min(1, 'Adresse email requise')
    .email('Adresse email invalide'),
  password: z
    .string()
    .min(1, 'Mot de passe requis')
    .min(6, 'Au moins 6 caractères'),
  remember: z.boolean().optional(),
});
type Form = z.infer<typeof schema>;

// Clé localStorage du "remember me"
const REMEMBER_KEY = 'be-login-remember-email';

// ─────────────────────────────────────────────────────────────
// Feature flags — connexion sociale (activés via .env)
// ─────────────────────────────────────────────────────────────

interface SocialProvider {
  id: 'google' | 'linkedin' | 'microsoft';
  label: string;
  enabled: boolean;
  /** Chemin brand icon simplifié (SVG inline). */
  Icon: () => JSX.Element;
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 5c1.6 0 3 .6 4.1 1.6l3-3C17.2 1.9 14.8 1 12 1 7.7 1 4 3.5 2.3 7l3.5 2.7C6.7 6.9 9.2 5 12 5z"
      />
      <path
        fill="#34A853"
        d="M23 12c0-.8-.1-1.6-.2-2.3H12v4.5h6.2c-.3 1.5-1.2 2.8-2.5 3.6l3.4 2.6c2-1.9 3.1-4.7 3.1-8z"
      />
      <path
        fill="#FBBC05"
        d="M5.8 14.3c-.2-.6-.3-1.2-.3-2s.1-1.4.3-2L2.3 7.6C1.5 9.1 1 10.8 1 12.5s.5 3.4 1.3 4.9l3.5-3.1z"
      />
      <path
        fill="#4285F4"
        d="M12 23c2.7 0 5-1 6.7-2.6l-3.4-2.6c-.9.6-2.1 1-3.3 1-2.8 0-5.3-1.9-6.2-4.5l-3.5 3.1C4 20.5 7.7 23 12 23z"
      />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden>
      <path
        fill="#0A66C2"
        d="M20.5 3H3.5A.5.5 0 003 3.5v17a.5.5 0 00.5.5h17a.5.5 0 00.5-.5v-17a.5.5 0 00-.5-.5zM8.3 18.3H5.7V9.7h2.6v8.6zM7 8.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm11.3 9.8h-2.6v-4.2c0-1 0-2.3-1.4-2.3s-1.6 1.1-1.6 2.2v4.3H10V9.7h2.5v1.2h.1c.4-.7 1.3-1.4 2.7-1.4 2.9 0 3.4 1.9 3.4 4.3v4.5z"
      />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden>
      <rect x="2" y="2" width="9.5" height="9.5" fill="#F25022" />
      <rect x="12.5" y="2" width="9.5" height="9.5" fill="#7FBA00" />
      <rect x="2" y="12.5" width="9.5" height="9.5" fill="#00A4EF" />
      <rect x="12.5" y="12.5" width="9.5" height="9.5" fill="#FFB900" />
    </svg>
  );
}

/**
 * Lecture safe des feature flags Vite. Non activés → boutons désactivés.
 * (import.meta.env est typé via Vite ; on lit via any pour éviter d'imposer
 *  un vite-env.d.ts dédié.)
 */
function useSocialProviders(): SocialProvider[] {
  return useMemo(() => {
    const env = (import.meta as { env?: Record<string, unknown> }).env ?? {};
    return [
      {
        id: 'google',
        label: 'Continuer avec Google',
        enabled: !!env.VITE_OAUTH_GOOGLE_CLIENT_ID,
        Icon: GoogleIcon,
      },
      {
        id: 'linkedin',
        label: 'Continuer avec LinkedIn',
        enabled: !!env.VITE_OAUTH_LINKEDIN_CLIENT_ID,
        Icon: LinkedInIcon,
      },
      {
        id: 'microsoft',
        label: 'Continuer avec Microsoft',
        enabled: !!env.VITE_OAUTH_MICROSOFT_CLIENT_ID,
        Icon: MicrosoftIcon,
      },
    ];
  }, []);
}

// ─────────────────────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────────────────────

export default function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const login = useAuthStore((s) => s.login);
  const clearAuth = useAuthStore((s) => s.clear);
  const loading = useAuthStore((s) => s.loading);
  const authError = useAuthStore((s) => s.error);
  const user = useAuthUser();
  const isAuthed = useIsAuthenticated();

  const [showPassword, setShowPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [rememberedEmail] = useState<string>(() => {
    try {
      return localStorage.getItem(REMEMBER_KEY) ?? '';
    } catch {
      return '';
    }
  });

  const providers = useSocialProviders();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Form>({
    resolver: zodResolver(schema),
    mode: 'onSubmit',
    defaultValues: {
      email: rememberedEmail,
      password: '',
      remember: !!rememberedEmail,
    },
  });

  // Reset l'éventuelle erreur d'auth précédente au montage
  useEffect(() => {
    if (authError) {
      // On garde l'error courante — on l'affichera seulement après submit.
    }
  }, [authError]);

  // Redirection intelligente : si déjà connecté, on route vers l'espace approprié
  if (isAuthed && user) {
    const next =
      sanitizeNextTarget(params.get('next')) ||
      resolvePostLoginTarget(user.roles, user.is_platform_admin);
    return <Navigate to={next} replace />;
  }

  const onSubmit = async (values: Form) => {
    setSubmitted(true);
    try {
      await login({ email: values.email.trim(), password: values.password });

      // "Remember me" : on persiste seulement l'email
      try {
        if (values.remember) {
          localStorage.setItem(REMEMBER_KEY, values.email.trim());
        } else {
          localStorage.removeItem(REMEMBER_KEY);
        }
      } catch {
        /* ignore quota errors */
      }

      // Récupère l'utilisateur fraîchement stocké pour résoudre la cible
      const freshUser = useAuthStore.getState().user;
      const next =
        sanitizeNextTarget(params.get('next')) ||
        resolvePostLoginTarget(
          freshUser?.roles,
          freshUser?.is_platform_admin,
        );
      navigate(next, { replace: true });
    } catch {
      // Le store a déjà set `error`. On garde `submitted=true` pour l'afficher.
    }
  };

  // Nettoyage propre en cas d'échec : logout partiel si besoin
  const handleErrorReset = () => {
    clearAuth();
    setSubmitted(false);
  };

  // Détection compte désactivé : le backend renvoie souvent "compte inactif"
  // ou "désactivé" dans le detail — heuristique simple qui laisse l'affichage
  // par défaut si aucun match.
  const errorMessage = submitted && authError ? authError : null;
  const isDeactivated =
    errorMessage &&
    /inactif|désactivé|desactive|not\s+active|disabled/i.test(errorMessage);

  const emailValue = watch('email');

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 flex flex-col lg:flex-row">
      <Helmet>
        <title>Connexion — BestÉpargne Academy</title>
        <meta
          name="description"
          content="Connectez-vous à votre espace BestÉpargne Academy — apprenant, formateur ou organisation."
        />
      </Helmet>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* Panneau gauche — visuel & value props (desktop uniquement)   */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <aside
        className="hidden lg:flex lg:w-1/2 relative overflow-hidden text-white flex-col justify-between p-10 xl:p-14"
        style={{
          background:
            'linear-gradient(135deg, #0369a1 0%, #0284c7 45%, #eab308 130%)',
        }}
        aria-hidden={false}
      >
        {/* Motifs décoratifs */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-40 pointer-events-none"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 15%, rgba(255,255,255,0.15) 0%, transparent 45%), radial-gradient(circle at 85% 85%, rgba(255,255,255,0.10) 0%, transparent 45%)',
          }}
        />

        {/* Logo + wordmark */}
        <div className="relative z-10">
          <Link to="/" className="inline-block group" aria-label="Best-Épargne — accueil">
            <img
              src="/logo_2.png"
              alt="Best-Épargne"
              className="h-12 w-auto object-contain drop-shadow-md"
            />
          </Link>
        </div>

        {/* Titre + mockup illustration */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="relative z-10 max-w-md"
        >
          <p className="text-xs font-bold uppercase tracking-widest text-accent-200">
            Communauté d'apprenants
          </p>
          <h2 className="mt-3 text-3xl xl:text-4xl font-extrabold leading-tight">
            Reprenez là où vous vous êtes arrêté.
          </h2>
          <p className="mt-4 text-primary-100 leading-relaxed">
            Accédez à vos cours, votre progression et vos certificats. Une
            plateforme unique pour les apprenants, formateurs et
            organisations qui investissent dans les compétences financières.
          </p>

          {/* Bullets valeurs */}
          <ul className="mt-8 space-y-3">
            {[
              {
                Icon: BookOpen,
                title: '400+ cours experts',
                desc: 'Finance, épargne, immobilier, entrepreneuriat.',
              },
              {
                Icon: Award,
                title: 'Certificats reconnus',
                desc: 'Vérifiables et téléchargeables en PDF.',
              },
              {
                Icon: Users,
                title: '12 500+ apprenants actifs',
                desc: 'Rejoignez une communauté en pleine croissance.',
              },
            ].map(({ Icon, title, desc }) => (
              <li key={title} className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4" />
                </span>
                <div>
                  <p className="font-bold text-sm">{title}</p>
                  <p className="text-xs text-primary-100">{desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </motion.div>

        {/* Testimonial */}
        <motion.figure
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2, ease: 'easeOut' }}
          className="relative z-10 bg-white/10 backdrop-blur rounded-2xl p-5 border border-white/15 max-w-md"
        >
          <blockquote className="text-sm leading-relaxed">
            « J'ai décroché ma certification en 6 semaines pendant que je
            travaillais. La plateforme est vraiment pensée pour aller au
            bout. »
          </blockquote>
          <figcaption className="mt-3 flex items-center gap-3 text-xs">
            <span className="w-8 h-8 rounded-full bg-accent-400 text-primary-900 flex items-center justify-center font-extrabold">
              AD
            </span>
            <div>
              <p className="font-bold">Aïcha Diallo</p>
              <p className="text-primary-100">
                Diplômée · Analyste financier
              </p>
            </div>
          </figcaption>
        </motion.figure>
      </aside>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* Panneau droite — formulaire                                  */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <section
        className="flex-1 flex items-center justify-center p-4 sm:p-8 lg:p-12 bg-gradient-to-br from-neutral-50 via-white to-primary-50/40 dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-800"
        aria-labelledby="login-title"
      >
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="w-full max-w-md"
        >
          {/* Logo mobile */}
          <div className="lg:hidden mb-6 flex justify-center">
            <Link to="/" className="inline-block" aria-label="Best-Épargne — accueil">
              <img
                src="/logo_img.png"
                alt="Best-Épargne"
                className="h-11 w-auto object-contain"
              />
            </Link>
          </div>

          {/* Card */}
          <div className="bg-white dark:bg-neutral-800 rounded-3xl shadow-lift dark:shadow-none dark:border dark:border-neutral-700 p-6 sm:p-8">
            {/* Titre */}
            <div className="text-center sm:text-left">
              <h1
                id="login-title"
                className="text-2xl sm:text-3xl font-extrabold text-neutral-900 dark:text-white"
              >
                Connectez-vous à votre espace
              </h1>
              <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                Retrouvez vos cours, votre progression et vos certificats.
              </p>
            </div>

            {/* Erreur globale */}
            {errorMessage && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className={
                  'mt-5 flex items-start gap-3 rounded-xl px-4 py-3 text-sm border ' +
                  (isDeactivated
                    ? 'bg-amber-50 border-amber-200 text-amber-900'
                    : 'bg-rose-50 border-rose-200 text-rose-900')
                }
                role="alert"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold">
                    {isDeactivated
                      ? 'Votre compte n\'est pas activé.'
                      : 'Impossible de vous connecter.'}
                  </p>
                  <p className="text-xs mt-0.5 opacity-90">{errorMessage}</p>
                  {isDeactivated && (
                    <p className="mt-1 text-xs">
                      <Link
                        to={`/contact?type=activation&email=${encodeURIComponent(emailValue || '')}`}
                        className="font-semibold underline hover:text-amber-950"
                      >
                        Renvoyer l'email d'activation
                      </Link>
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleErrorReset}
                  className="text-xs font-bold opacity-70 hover:opacity-100 shrink-0"
                  aria-label="Fermer"
                >
                  ✕
                </button>
              </motion.div>
            )}

            {/* Formulaire */}
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="mt-6 space-y-4"
              noValidate
            >
              {/* Email */}
              <div>
                <label
                  htmlFor="email"
                  className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wide mb-1.5"
                >
                  Adresse email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    placeholder="vous@exemple.com"
                    aria-invalid={!!errors.email}
                    className={
                      'w-full pl-10 pr-3 py-3 rounded-xl text-sm bg-white dark:bg-neutral-900 border transition-colors ' +
                      'placeholder:text-neutral-400 dark:text-white ' +
                      'focus:outline-none focus:ring-4 ' +
                      (errors.email
                        ? 'border-rose-400 focus:ring-rose-200/60'
                        : 'border-neutral-200 dark:border-neutral-700 focus:ring-primary-200/60 focus:border-primary-400')
                    }
                    {...register('email')}
                  />
                </div>
                {errors.email && (
                  <p className="mt-1 text-xs font-semibold text-rose-600 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {errors.email.message}
                  </p>
                )}
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="password"
                    className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wide"
                  >
                    Mot de passe
                  </label>
                  <Link
                    to="/password-reset"
                    className="text-xs font-semibold text-primary-600 hover:text-primary-700"
                  >
                    Mot de passe oublié ?
                  </Link>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Votre mot de passe"
                    aria-invalid={!!errors.password}
                    className={
                      'w-full pl-10 pr-11 py-3 rounded-xl text-sm bg-white dark:bg-neutral-900 border transition-colors ' +
                      'placeholder:text-neutral-400 dark:text-white ' +
                      'focus:outline-none focus:ring-4 ' +
                      (errors.password
                        ? 'border-rose-400 focus:ring-rose-200/60'
                        : 'border-neutral-200 dark:border-neutral-700 focus:ring-primary-200/60 focus:border-primary-400')
                    }
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 dark:hover:bg-neutral-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"
                    aria-label={
                      showPassword
                        ? 'Masquer le mot de passe'
                        : 'Afficher le mot de passe'
                    }
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {errors.password && (
                  <p className="mt-1 text-xs font-semibold text-rose-600 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {errors.password.message}
                  </p>
                )}
              </div>

              {/* Remember me */}
              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-300"
                  {...register('remember')}
                />
                <span className="text-sm text-neutral-700 dark:text-neutral-300">
                  Se souvenir de moi
                </span>
              </label>

              {/* CTA principal */}
              <button
                type="submit"
                disabled={loading || isSubmitting}
                className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-bold text-sm shadow-sm transition-all active:scale-[.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-primary-200 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Connexion en cours…
                  </>
                ) : (
                  <>
                    Se connecter
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Séparateur */}
            <div className="mt-6 flex items-center gap-3 text-xs text-neutral-400">
              <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-700" />
              <span className="uppercase tracking-widest">ou</span>
              <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-700" />
            </div>

            {/* Connexion sociale */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
              {providers.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={!p.enabled}
                  title={
                    p.enabled
                      ? p.label
                      : 'Connexion sociale bientôt disponible'
                  }
                  onClick={() => {
                    // Placeholder — le backend d'auth OAuth n'est pas encore
                    // câblé (roadmap R24+). Les boutons restent désactivés
                    // tant que les feature flags ne sont pas activés.
                  }}
                  className="inline-flex items-center justify-center gap-2 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <p.Icon />
                  <span className="hidden sm:inline">
                    {p.id === 'google'
                      ? 'Google'
                      : p.id === 'linkedin'
                        ? 'LinkedIn'
                        : 'Microsoft'}
                  </span>
                </button>
              ))}
            </div>

            {/* Trust footer */}
            <div className="mt-6 flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400 justify-center">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              Connexion chiffrée · Vos données restent confidentielles.
            </div>
          </div>

          {/* Inscription */}
          <div className="mt-6 text-center text-sm text-neutral-600 dark:text-neutral-400">
            <p>
              Vous n'avez pas encore de compte ?{' '}
              <Link
                to="/register"
                className="font-bold text-primary-600 hover:text-primary-700 inline-flex items-center gap-1"
              >
                Créer un compte
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </p>

            {/* Persona picker */}
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                {
                  role: 'learner',
                  label: 'Apprenant',
                  Icon: BookOpen,
                  color:
                    'border-primary-200 text-primary-700 hover:bg-primary-50',
                },
                {
                  role: 'instructor',
                  label: 'Formateur',
                  Icon: Award,
                  color:
                    'border-emerald-200 text-emerald-700 hover:bg-emerald-50',
                },
                {
                  role: 'org_admin',
                  label: 'Organisation',
                  Icon: Users,
                  color:
                    'border-accent-300 text-accent-700 hover:bg-accent-50',
                },
              ].map(({ role, label, Icon, color }) => (
                <Link
                  key={role}
                  to={`/register?role=${role}`}
                  className={
                    'inline-flex flex-col items-center gap-1.5 py-3 rounded-xl border bg-white dark:bg-neutral-800 text-xs font-bold transition ' +
                    color
                  }
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Link>
              ))}
            </div>

            <p className="mt-5 text-xs text-neutral-500 dark:text-neutral-400 flex items-center gap-1 justify-center">
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              Retour à la{' '}
              <Link to="/" className="underline font-semibold hover:text-neutral-900 dark:hover:text-white">
                page d'accueil
              </Link>
            </p>
          </div>
        </motion.div>
      </section>
    </div>
  );
}
