/**
 * CreateUserModal.tsx — R47
 *
 * Modal admin pour créer un utilisateur (formateur, apprenant, admin, staff).
 * Le rôle sélectionné révèle les champs spécifiques (bio + payout pour
 * formateur, job title pour apprenant). Si aucun mot de passe n'est
 * fourni, le backend en génère un temporaire et le renvoie une seule
 * fois — on l'affiche avec un bouton "Copier".
 */
import { useState } from 'react';
import {
  X,
  Copy,
  Check,
  UserPlus,
  Sparkles,
  ShieldCheck,
  BookOpen,
  GraduationCap,
  Users as UsersIcon,
} from 'lucide-react';

import {
  useCreateAdminUser,
  type AdminUserCreatePayload,
  type AdminUserCreateRole,
  type AdminUserCreateResult,
} from '@/hooks/admin';

interface CreateUserModalProps {
  open: boolean;
  onClose: () => void;
  defaultRole?: AdminUserCreateRole;
}

const ROLE_META: Record<
  AdminUserCreateRole,
  { label: string; hint: string; Icon: typeof BookOpen; tone: string }
> = {
  LEARNER: {
    label: 'Apprenant',
    hint: 'Utilisateur standard. Peut s’inscrire à des cours, passer des quiz, obtenir des certificats.',
    Icon: BookOpen,
    tone: 'bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800 text-sky-900 dark:text-sky-100',
  },
  INSTRUCTOR: {
    label: 'Formateur',
    hint: 'Peut créer des cours, publier des leçons, voir les revenus et son audience.',
    Icon: GraduationCap,
    tone: 'bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800 text-primary-900 dark:text-primary-100',
  },
  ADMIN: {
    label: 'Admin plateforme',
    hint: 'Accès total au back-office admin. À réserver aux membres de confiance.',
    Icon: ShieldCheck,
    tone: 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-100',
  },
  STAFF: {
    label: 'Staff',
    hint: 'Accès Django admin (support technique) sans droit plateforme complet.',
    Icon: UsersIcon,
    tone: 'bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200',
  },
};

export function CreateUserModal({
  open,
  onClose,
  defaultRole = 'INSTRUCTOR',
}: CreateUserModalProps) {
  const [role, setRole] = useState<AdminUserCreateRole>(defaultRole);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [instructorHeadline, setInstructorHeadline] = useState('');
  const [instructorBio, setInstructorBio] = useState('');
  const [instructorPayout, setInstructorPayout] = useState<number | ''>(70);
  const [learnerJobTitle, setLearnerJobTitle] = useState('');
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<AdminUserCreateResult | null>(null);

  const mutation = useCreateAdminUser();
  const errorMsg = mutation.isError
    ? (mutation.error as { response?: { data?: { detail?: string; email?: string[] } } })
        ?.response?.data?.detail ??
      (mutation.error as { response?: { data?: { email?: string[] } } })
        ?.response?.data?.email?.[0] ??
      'Erreur inconnue lors de la création.'
    : '';

  if (!open) return null;

  function resetForm() {
    setRole(defaultRole);
    setEmail('');
    setFullName('');
    setPhone('');
    setPassword('');
    setIsActive(true);
    setInstructorHeadline('');
    setInstructorBio('');
    setInstructorPayout(70);
    setLearnerJobTitle('');
    setResult(null);
    setCopied(false);
  }

  function handleClose() {
    resetForm();
    mutation.reset();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    const payload: AdminUserCreatePayload = {
      email: email.trim().toLowerCase(),
      full_name: fullName.trim(),
      phone: phone.trim(),
      role,
      is_active: isActive,
    };
    if (password.trim()) payload.password = password.trim();
    if (role === 'INSTRUCTOR') {
      payload.instructor_headline = instructorHeadline.trim();
      payload.instructor_bio = instructorBio.trim();
      if (typeof instructorPayout === 'number') {
        payload.instructor_payout_percent = instructorPayout;
      }
    }
    if (role === 'LEARNER') {
      payload.learner_job_title = learnerJobTitle.trim();
    }

    try {
      const res = await mutation.mutateAsync(payload);
      setResult(res);
    } catch {
      /* handled via mutation.isError */
    }
  }

  async function copyTempPassword() {
    if (!result?.temporary_password) return;
    try {
      await navigator.clipboard.writeText(result.temporary_password);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard indisponible — silent */
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-700 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary-600" />
            <h2 className="text-lg font-extrabold text-neutral-900 dark:text-white">
              Créer un utilisateur
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
            aria-label="Fermer"
          >
            <X className="w-5 h-5 text-neutral-500" />
          </button>
        </div>

        {result ? (
          // Écran succès : affiche mot de passe temporaire si généré
          <div className="p-6 space-y-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-800 p-4 flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-emerald-900 dark:text-emerald-200">
                  Utilisateur créé — {result.email}
                </p>
                <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-300">
                  Rôle : <strong>{ROLE_META[result.created_role].label}</strong>. Le
                  compte est {result.is_active ? 'actif' : 'inactif'}.
                </p>
              </div>
            </div>

            {result.temporary_password && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-4">
                <p className="text-sm font-bold text-amber-900 dark:text-amber-200">
                  Mot de passe temporaire
                </p>
                <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                  Communiquez ce mot de passe à l’utilisateur via un canal
                  sûr. Il ne sera plus affiché après la fermeture de cette
                  fenêtre.
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <code className="flex-1 font-mono text-sm bg-white dark:bg-neutral-800 px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-700 select-all">
                    {result.temporary_password}
                  </code>
                  <button
                    type="button"
                    onClick={copyTempPassword}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold transition"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4" /> Copié
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" /> Copier
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  mutation.reset();
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition"
              >
                <UserPlus className="w-4 h-4" />
                Créer un autre utilisateur
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold transition"
              >
                Terminer
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {/* Sélecteur de rôle */}
            <div>
              <label className="text-[11px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
                Rôle
              </label>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(Object.keys(ROLE_META) as AdminUserCreateRole[]).map((r) => {
                  const meta = ROLE_META[r];
                  const active = r === role;
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRole(r)}
                      className={
                        'flex flex-col items-start gap-1 px-3 py-2 rounded-xl border-2 text-left transition ' +
                        (active
                          ? meta.tone + ' shadow-sm'
                          : 'bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:border-neutral-300')
                      }
                    >
                      <meta.Icon className="w-4 h-4" />
                      <span className="text-sm font-bold">{meta.label}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400 italic">
                {ROLE_META[role].hint}
              </p>
            </div>

            {/* Champs communs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Email *">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ex: jane.doe@mail.com"
                  className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </Field>
              <Field label="Nom complet">
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jane Doe"
                  className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </Field>
              <Field label="Téléphone (optionnel)">
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+221 …"
                  className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </Field>
              <Field
                label="Mot de passe (laisser vide pour en générer un)"
                help="Minimum 8 caractères si fourni."
              >
                <input
                  type="text"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Généré automatiquement"
                  className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono"
                />
              </Field>
            </div>

            {/* Champs formateur */}
            {role === 'INSTRUCTOR' && (
              <div className="rounded-xl border border-primary-100 dark:border-primary-800 bg-primary-50/30 dark:bg-primary-900/10 p-4 space-y-3">
                <p className="text-xs font-bold text-primary-800 dark:text-primary-200 uppercase tracking-wide">
                  Profil formateur
                </p>
                <Field label="Titre / spécialité (headline)">
                  <input
                    type="text"
                    value={instructorHeadline}
                    onChange={(e) => setInstructorHeadline(e.target.value)}
                    placeholder="ex: Coach en épargne & investissement"
                    className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </Field>
                <Field label="Bio courte">
                  <textarea
                    rows={3}
                    value={instructorBio}
                    onChange={(e) => setInstructorBio(e.target.value)}
                    placeholder="Parcours, expertise…"
                    className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </Field>
                <Field
                  label="Pourcentage reversé au formateur"
                  help="70% par défaut. La plateforme conserve la différence."
                >
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={instructorPayout}
                    onChange={(e) =>
                      setInstructorPayout(
                        e.target.value === '' ? '' : Number(e.target.value),
                      )
                    }
                    className="w-32 px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <span className="ml-2 text-sm text-neutral-600 dark:text-neutral-400">
                    %
                  </span>
                </Field>
              </div>
            )}

            {/* Champs apprenant */}
            {role === 'LEARNER' && (
              <div className="rounded-xl border border-sky-100 dark:border-sky-800 bg-sky-50/30 dark:bg-sky-900/10 p-4">
                <p className="text-xs font-bold text-sky-800 dark:text-sky-200 uppercase tracking-wide mb-2">
                  Profil apprenant
                </p>
                <Field label="Poste / occupation (optionnel)">
                  <input
                    type="text"
                    value={learnerJobTitle}
                    onChange={(e) => setLearnerJobTitle(e.target.value)}
                    placeholder="ex: Étudiant, Comptable…"
                    className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </Field>
              </div>
            )}

            {/* Statut compte */}
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-700 dark:text-neutral-300 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-4 h-4 accent-primary-600"
              />
              Compte activé immédiatement
            </label>

            {errorMsg && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-900/20 dark:border-rose-800 px-3 py-2 text-sm text-rose-800 dark:text-rose-200">
                {errorMsg}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-neutral-100 dark:border-neutral-800">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={mutation.isPending || !email.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <UserPlus className="w-4 h-4" />
                {mutation.isPending ? 'Création…' : 'Créer l’utilisateur'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
        {label}
      </span>
      {children}
      {help && (
        <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
          {help}
        </span>
      )}
    </label>
  );
}
