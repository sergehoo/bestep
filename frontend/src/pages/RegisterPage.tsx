/**
 * RegisterPage.tsx — Inscription premium (R24.2).
 *
 * Layout split-screen cohérent avec la LoginPage. Étapes :
 *   1. Choisir le type de compte (Apprenant / Formateur / Organisation)
 *   2. Renseigner les infos (email, mot de passe, téléphone, org si besoin)
 *   3. Accepter les CGU → POST /api/auth/register/
 *
 * Le backend n'accepte que {email, password, full_name, phone}. Le type
 * de compte + nom d'organisation sont stockés côté client
 * (`be-register-intent`) pour être exploités par :
 *   - la redirection post-register (learner → onboarding, instructor →
 *     cockpit avec bandeau, org → cockpit avec bandeau création équipe)
 *   - une future demande d'élévation de rôle (roadmap R25).
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
  User,
  Mail,
  Lock,
  Phone,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  BookOpen,
  Award,
  Users,
  Building2,
  CheckCircle2,
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
import { useIsOnboardingCompleted } from '@/stores/learner-profile';

// ─────────────────────────────────────────────────────────────
// Types & schéma
// ─────────────────────────────────────────────────────────────

export type AccountType = 'learner' | 'instructor' | 'org_admin';

const REGISTER_INTENT_KEY = 'be-register-intent';

/** Ce que l'on persiste post-inscription pour usage front. */
interface RegisterIntent {
  account_type: AccountType;
  organization_name?: string;
}

/**
 * Validation stricte :
 * - full_name ≥ 2
 * - email valide
 * - password ≥ 8 avec au moins une lettre et un chiffre
 * - password2 doit correspondre
 * - phone optionnel, format international léger (regex tolérante)
 * - organisation obligatoire si account_type = 'org_admin'
 * - CGU obligatoirement acceptées
 */
const baseSchema = z
  .object({
    account_type: z.enum(['learner', 'instructor', 'org_admin']),
    full_name: z.string().min(2, 'Nom complet requis').max(160),
    email: z.string().min(1, 'Email requis').email('Adresse email invalide'),
    password: z
      .string()
      .min(8, 'Au moins 8 caractères')
      .regex(/[A-Za-z]/, 'Doit contenir au moins une lettre')
      .regex(/\d/, 'Doit contenir au moins un chiffre'),
    password2: z.string().min(1, 'Confirmez le mot de passe'),
    phone: z
      .string()
      .optional()
      .refine(
        (v) => !v || /^[+0-9\s.-]{6,20}$/.test(v.trim()),
        'Numéro de téléphone invalide',
      ),
    organization_name: z.string().optional(),
    accept_terms: z.literal(true, {
      errorMap: () => ({ message: 'Vous devez accepter les CGU' }),
    }),
  })
  .refine((v) => v.password === v.password2, {
    path: ['password2'],
    message: 'Les mots de passe ne correspondent pas',
  })
  .refine(
    (v) =>
      v.account_type !== 'org_admin' ||
      (v.organization_name && v.organization_name.trim().length >= 2),
    {
      path: ['organization_name'],
      message: "Le nom de l'organisation est requis",
    },
  );

type Form = z.infer<typeof baseSchema>;

// ─────────────────────────────────────────────────────────────
// Feedback : force du mot de passe (heuristique simple)
// ─────────────────────────────────────────────────────────────

interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  color: string;
}

function scorePassword(pw: string): PasswordStrength {
  if (!pw) return { score: 0, label: '—', color: 'bg-neutral-200' };
  let s = 0;
  if (pw.length >= 8) s += 1;
  if (pw.length >= 12) s += 1;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s += 1;
  if (/\d/.test(pw)) s += 1;
  if (/[^A-Za-z0-9]/.test(pw)) s += 1;
  const capped = Math.min(4, s) as 0 | 1 | 2 | 3 | 4;
  const label = ['Faible', 'Faible', 'Moyen', 'Bon', 'Excellent'][capped];
  const color = [
    'bg-rose-400',
    'bg-rose-400',
    'bg-amber-400',
    'bg-emerald-400',
    'bg-emerald-500',
  ][capped];
  return { score: capped, label, color };
}

// ─────────────────────────────────────────────────────────────
// Configuration types de compte
// ─────────────────────────────────────────────────────────────

interface AccountTypeOption {
  value: AccountType;
  label: string;
  description: string;
  Icon: typeof BookOpen;
  accent: string; // classes pour l'état sélectionné
  chipColor: string;
}

const ACCOUNT_TYPES: AccountTypeOption[] = [
  {
    value: 'learner',
    label: 'Apprenant',
    description: 'Je souhaite me former et développer mes compétences.',
    Icon: BookOpen,
    accent:
      'border-primary-500 bg-primary-50 ring-2 ring-primary-200',
    chipColor: 'bg-primary-500 text-white',
  },
  {
    value: 'instructor',
    label: 'Formateur',
    description: 'Je souhaite créer et publier des formations.',
    Icon: Award,
    accent:
      'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200',
    chipColor: 'bg-emerald-500 text-white',
  },
  {
    value: 'org_admin',
    label: 'Organisation',
    description: 'Je gère la formation d\'une équipe ou d\'une entreprise.',
    Icon: Building2,
    accent:
      'border-accent-500 bg-accent-50 ring-2 ring-accent-200',
    chipColor: 'bg-accent-400 text-neutral-900',
  },
];

// ─────────────────────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const registerUser = useAuthStore((s) => s.register);
  const loading = useAuthStore((s) => s.loading);
  const authError = useAuthStore((s) => s.error);
  const isAuthed = useIsAuthenticated();
  const user = useAuthUser();
  const onboardingCompleted = useIsOnboardingCompleted();

  const [showPassword, setShowPassword] = useState(false);
  const [showPassword2, setShowPassword2] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Rôle initial via ?role=... (chip de la login page)
  const initialRole = (params.get('role') as AccountType | null) ?? 'learner';
  const validInitial: AccountType = ACCOUNT_TYPES.some(
    (t) => t.value === initialRole,
  )
    ? initialRole
    : 'learner';

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Form>({
    resolver: zodResolver(baseSchema),
    mode: 'onSubmit',
    defaultValues: {
      account_type: validInitial,
      full_name: '',
      email: '',
      password: '',
      password2: '',
      phone: '',
      organization_name: '',
      accept_terms: false as unknown as true,
    },
  });

  const accountType = watch('account_type');
  const passwordValue = watch('password') ?? '';
  const strength = useMemo(() => scorePassword(passwordValue), [passwordValue]);

  // Redirection si déjà authentifié
  useEffect(() => {
    if (isAuthed && user) {
      const stored = readRegisterIntent();
      const target = postRegisterTarget(
        stored?.account_type ?? 'learner',
        user.roles,
        user.is_platform_admin,
        onboardingCompleted,
      );
      const next =
        sanitizeNextTarget(params.get('next')) || target;
      navigate(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isAuthed && user) {
    return <Navigate to="/" replace />;
  }

  const onSubmit = async (v: Form) => {
    setSubmitted(true);
    try {
      // Persiste l'intent AVANT l'appel — utile même si la redirection
      // se fait via un flow externe (webhook, activation par email…)
      writeRegisterIntent({
        account_type: v.account_type,
        organization_name:
          v.account_type === 'org_admin'
            ? v.organization_name?.trim()
            : undefined,
      });

      // On transmet aussi ``account_type`` + ``organization_name`` au
      // backend pour qu'il crée le bon profil métier de façon
      // transactionnelle. Le backend valide strictement la valeur —
      // il rejette tout account_type ne figurant pas dans la whitelist
      // (learner / instructor / org_admin).
      await registerUser({
        email: v.email.trim(),
        password: v.password,
        full_name: v.full_name.trim(),
        phone: v.phone?.trim() || undefined,
        account_type: v.account_type,
        organization_name:
          v.account_type === 'org_admin'
            ? v.organization_name?.trim() || undefined
            : undefined,
      });

      // Post-register :
      // SECURITE-05 — si l'e-mail n'est pas encore vérifié (cas
      // normal juste après signup), on redirige explicitement vers
      // /verify-email avec un state indiquant que le mail vient
      // d'être envoyé. Ça évite un rebond via /dashboard qui
      // paraîtrait cassé côté utilisateur.
      const freshUser = useAuthStore.getState().user;
      if (freshUser && freshUser.email_verified === false) {
        navigate('/verify-email', {
          replace: true,
          state: { justRegistered: true },
        });
        return;
      }
      const target = postRegisterTarget(
        v.account_type,
        freshUser?.roles,
        freshUser?.is_platform_admin,
        onboardingCompleted,
      );
      const next = sanitizeNextTarget(params.get('next')) || target;
      navigate(next, { replace: true });
    } catch {
      // Le store contient déjà l'error message. On garde `submitted=true`.
    }
  };

  const errorMessage = submitted && authError ? authError : null;

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 flex flex-col lg:flex-row">
      <Helmet>
        <title>Créer votre compte — BestÉpargne Academy</title>
        <meta
          name="description"
          content="Créez votre compte BestÉpargne Academy — apprenant, formateur ou organisation. Gratuit, rapide et sécurisé."
        />
      </Helmet>

      {/* ═════════════════════════════════════ */}
      {/* Panneau gauche — accroche              */}
      {/* ═════════════════════════════════════ */}
      <aside
        className="hidden lg:flex lg:w-1/2 relative overflow-hidden text-white flex-col justify-between p-10 xl:p-14"
        style={{
          background:
            'linear-gradient(135deg, #7f1d1d 0%, #0284c7 40%, #10b981 100%)',
        }}
      >
        <div
          aria-hidden
          className="absolute inset-0 opacity-40 pointer-events-none"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 15%, rgba(255,255,255,0.15) 0%, transparent 45%), radial-gradient(circle at 85% 85%, rgba(255,255,255,0.10) 0%, transparent 45%)',
          }}
        />

        <div className="relative z-10">
          <Link to="/" className="inline-block group" aria-label="Best-Épargne — accueil">
            <img
              src="/logo_2.png"
              alt="Best-Épargne"
              className="h-12 w-auto object-contain drop-shadow-md"
            />
          </Link>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="relative z-10 max-w-md"
        >
          <p className="text-xs font-bold uppercase tracking-widest text-accent-200">
            Bienvenue chez nous
          </p>
          <h2 className="mt-3 text-3xl xl:text-4xl font-extrabold leading-tight">
            Créez votre compte gratuit
          </h2>
          <p className="mt-4 text-white/85 leading-relaxed">
            Un seul compte pour apprendre, enseigner ou piloter la formation
            de votre organisation. Vous choisissez la porte d'entrée qui
            vous correspond.
          </p>

          <ul className="mt-8 space-y-3">
            {[
              { Icon: BookOpen, text: 'Accès instantané à 400+ cours' },
              { Icon: Award, text: 'Certificats reconnus et vérifiables' },
              { Icon: Users, text: 'Rejoignez 12 500+ apprenants actifs' },
              { Icon: ShieldCheck, text: 'Vos données restent confidentielles' },
            ].map(({ Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center">
                  <Icon className="w-4 h-4" />
                </span>
                <span className="text-sm">{text}</span>
              </li>
            ))}
          </ul>
        </motion.div>

        <motion.figure
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="relative z-10 bg-white/10 backdrop-blur rounded-2xl p-5 border border-white/15 max-w-md"
        >
          <blockquote className="text-sm">
            « J'ai découvert BestÉpargne via LinkedIn. En 3 mois j'ai
            complété deux certifications. C'est devenu ma référence
            formation. »
          </blockquote>
          <figcaption className="mt-3 flex items-center gap-3 text-xs">
            <span className="w-8 h-8 rounded-full bg-accent-400 text-primary-900 flex items-center justify-center font-extrabold">
              MK
            </span>
            <div>
              <p className="font-bold">Moussa Koné</p>
              <p className="text-white/80">Consultant · Business</p>
            </div>
          </figcaption>
        </motion.figure>
      </aside>

      {/* ═════════════════════════════════════ */}
      {/* Panneau droite — formulaire            */}
      {/* ═════════════════════════════════════ */}
      <section className="flex-1 flex items-center justify-center p-4 sm:p-8 lg:p-12 bg-gradient-to-br from-neutral-50 via-white to-primary-50/40 dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-800">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-lg"
        >
          <div className="lg:hidden mb-6 flex justify-center">
            <Link to="/" className="inline-block" aria-label="Best-Épargne — accueil">
              <img
                src="/logo_img.png"
                alt="Best-Épargne"
                className="h-11 w-auto object-contain"
              />
            </Link>
          </div>

          <div className="bg-white dark:bg-neutral-800 rounded-3xl shadow-lift dark:shadow-none dark:border dark:border-neutral-700 p-6 sm:p-8">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-neutral-900 dark:text-white">
                Créez votre compte
              </h1>
              <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                C'est gratuit, ça prend moins d'une minute et vous accédez à
                l'ensemble de la plateforme.
              </p>
            </div>

            {errorMessage && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-5 flex items-start gap-3 rounded-xl px-4 py-3 text-sm border bg-rose-50 border-rose-200 text-rose-900"
                role="alert"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">
                    Impossible de créer le compte.
                  </p>
                  <p className="text-xs mt-0.5 opacity-90">
                    {errorMessage}
                  </p>
                </div>
              </motion.div>
            )}

            <form
              onSubmit={handleSubmit(onSubmit)}
              className="mt-6 space-y-5"
              noValidate
            >
              {/* Type de compte */}
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-neutral-700 dark:text-neutral-300 mb-2">
                  Type de compte
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {ACCOUNT_TYPES.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        setValue('account_type', opt.value, {
                          shouldValidate: true,
                          shouldDirty: true,
                        })
                      }
                      className={
                        'text-left p-3 rounded-xl border transition-all ' +
                        (accountType === opt.value
                          ? opt.accent
                          : 'border-neutral-200 hover:border-neutral-300 bg-white dark:bg-neutral-900 dark:border-neutral-700')
                      }
                      aria-pressed={accountType === opt.value}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={
                            'w-8 h-8 rounded-lg flex items-center justify-center ' +
                            (accountType === opt.value
                              ? opt.chipColor
                              : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800')
                          }
                        >
                          <opt.Icon className="w-4 h-4" />
                        </span>
                        <span className="font-bold text-sm">
                          {opt.label}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 leading-snug">
                        {opt.description}
                      </p>
                    </button>
                  ))}
                </div>
                {accountType !== 'learner' && (
                  <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400 flex items-start gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-500" />
                    {accountType === 'instructor'
                      ? 'Votre compte formateur sera activé après validation par notre équipe pédagogique.'
                      : 'Nous vous contacterons pour finaliser la configuration de votre organisation.'}
                  </p>
                )}
              </div>

              {/* Full name */}
              <FieldWithIcon
                label="Nom complet"
                icon={<User className="w-4 h-4" />}
                required
                error={errors.full_name?.message}
              >
                <input
                  type="text"
                  autoComplete="name"
                  placeholder="Alice Dupont"
                  className={inputClass(!!errors.full_name)}
                  {...register('full_name')}
                />
              </FieldWithIcon>

              {/* Organization (conditionnel) */}
              {accountType === 'org_admin' && (
                <FieldWithIcon
                  label="Nom de l'organisation"
                  icon={<Building2 className="w-4 h-4" />}
                  required
                  error={errors.organization_name?.message}
                >
                  <input
                    type="text"
                    autoComplete="organization"
                    placeholder="Kaydan Groupe"
                    className={inputClass(!!errors.organization_name)}
                    {...register('organization_name')}
                  />
                </FieldWithIcon>
              )}

              {/* Email */}
              <FieldWithIcon
                label="Adresse email"
                icon={<Mail className="w-4 h-4" />}
                required
                error={errors.email?.message}
              >
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="vous@exemple.com"
                  className={inputClass(!!errors.email)}
                  {...register('email')}
                />
              </FieldWithIcon>

              {/* Phone */}
              <FieldWithIcon
                label="Téléphone (optionnel)"
                icon={<Phone className="w-4 h-4" />}
                error={errors.phone?.message}
              >
                <input
                  type="tel"
                  autoComplete="tel"
                  placeholder="+225 07 12 34 56 78"
                  className={inputClass(!!errors.phone)}
                  {...register('phone')}
                />
              </FieldWithIcon>

              {/* Password */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wide mb-1.5">
                  Mot de passe
                  <span className="text-rose-600 ml-1">*</span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="8 caractères min · lettres + chiffres"
                    className={inputClass(!!errors.password, true)}
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 dark:hover:bg-neutral-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"
                    aria-label={
                      showPassword ? 'Masquer' : 'Afficher'
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
                {/* Barre de force */}
                {passwordValue && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${strength.color}`}
                        style={{ width: `${(strength.score / 4) * 100}%` }}
                      />
                    </div>
                    <span className="text-[11px] font-semibold text-neutral-500 min-w-[70px] text-right">
                      {strength.label}
                    </span>
                  </div>
                )}
                {errors.password && (
                  <p className="mt-1 text-xs font-semibold text-rose-600 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {errors.password.message}
                  </p>
                )}
              </div>

              {/* Password confirm */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wide mb-1.5">
                  Confirmer le mot de passe
                  <span className="text-rose-600 ml-1">*</span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                  <input
                    type={showPassword2 ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="Retapez le mot de passe"
                    className={inputClass(!!errors.password2, true)}
                    {...register('password2')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword2((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    aria-label={showPassword2 ? 'Masquer' : 'Afficher'}
                    tabIndex={-1}
                  >
                    {showPassword2 ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {errors.password2 && (
                  <p className="mt-1 text-xs font-semibold text-rose-600 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {errors.password2.message}
                  </p>
                )}
              </div>

              {/* CGU */}
              <div>
                <label className="inline-flex items-start gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="w-4 h-4 mt-0.5 rounded border-neutral-300 text-primary-600 focus:ring-primary-300"
                    {...register('accept_terms')}
                  />
                  <span className="text-xs text-neutral-700 dark:text-neutral-300 leading-snug">
                    J'accepte les{' '}
                    <Link
                      to="/terms"
                      target="_blank"
                      className="font-semibold text-primary-600 hover:text-primary-700"
                    >
                      conditions d'utilisation
                    </Link>{' '}
                    et la{' '}
                    <Link
                      to="/privacy"
                      target="_blank"
                      className="font-semibold text-primary-600 hover:text-primary-700"
                    >
                      politique de confidentialité
                    </Link>
                    .
                  </span>
                </label>
                {errors.accept_terms && (
                  <p className="mt-1 text-xs font-semibold text-rose-600 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {errors.accept_terms.message}
                  </p>
                )}
              </div>

              {/* CTA */}
              <button
                type="submit"
                disabled={loading || isSubmitting}
                className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-bold text-sm shadow-sm transition-all active:scale-[.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-primary-200 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Création en cours…
                  </>
                ) : (
                  <>
                    Créer mon compte
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 text-center flex items-center gap-1 justify-center">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                Connexion chiffrée · Aucune information partagée sans votre
                accord.
              </p>
            </form>
          </div>

          <p className="mt-6 text-center text-sm text-neutral-600 dark:text-neutral-400">
            Vous avez déjà un compte ?{' '}
            <Link
              to="/login"
              className="font-bold text-primary-600 hover:text-primary-700 inline-flex items-center gap-1"
            >
              Connectez-vous
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </p>
        </motion.div>
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Helpers UI locaux
// ─────────────────────────────────────────────────────────────

function inputClass(hasError: boolean, hasRightIcon = false): string {
  return (
    'w-full pl-10 ' +
    (hasRightIcon ? 'pr-11 ' : 'pr-3 ') +
    'py-3 rounded-xl text-sm bg-white dark:bg-neutral-900 border transition-colors ' +
    'placeholder:text-neutral-400 dark:text-white ' +
    'focus:outline-none focus:ring-4 ' +
    (hasError
      ? 'border-rose-400 focus:ring-rose-200/60'
      : 'border-neutral-200 dark:border-neutral-700 focus:ring-primary-200/60 focus:border-primary-400')
  );
}

interface FieldWithIconProps {
  label: string;
  icon: React.ReactNode;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}

function FieldWithIcon({
  label,
  icon,
  required,
  error,
  children,
}: FieldWithIconProps) {
  return (
    <div>
      <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wide mb-1.5">
        {label}
        {required && <span className="text-rose-600 ml-1">*</span>}
      </label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none">
          {icon}
        </span>
        {children}
      </div>
      {error && (
        <p className="mt-1 text-xs font-semibold text-rose-600 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          {error}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Register intent — persistance locale
// ─────────────────────────────────────────────────────────────

export function writeRegisterIntent(intent: RegisterIntent) {
  try {
    localStorage.setItem(REGISTER_INTENT_KEY, JSON.stringify(intent));
  } catch {
    /* ignore */
  }
}

export function readRegisterIntent(): RegisterIntent | null {
  try {
    const raw = localStorage.getItem(REGISTER_INTENT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Résolution post-register
// ─────────────────────────────────────────────────────────────

function postRegisterTarget(
  accountType: AccountType,
  roles: string[] | undefined,
  isPlatformAdmin: boolean | undefined,
  onboardingCompleted: boolean,
): string {
  // Un admin plateforme reste prioritaire
  if (isPlatformAdmin) return '/dashboard/admin';

  // Apprenant → onboarding si pas encore complété
  if (accountType === 'learner') {
    return onboardingCompleted ? '/learn' : '/onboarding/learner';
  }

  // Formateur → cockpit avec bandeau d'activation en attente
  if (accountType === 'instructor') {
    return '/instructor?welcome=1&pending=1';
  }

  // Organisation → cockpit avec bandeau création équipe
  if (accountType === 'org_admin') {
    return '/instructor?welcome=1&org=1';
  }

  // Fallback : logique de rôle backend
  return resolvePostLoginTarget(
    (roles ?? []) as never,
    isPlatformAdmin ?? false,
  );
}
