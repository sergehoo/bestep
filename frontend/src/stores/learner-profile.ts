/**
 * stores/learner-profile.ts — R24.1
 *
 * Store Zustand persistant (localStorage `be-learner-profile`) qui gère :
 *   - Les réponses de l'onboarding apprenant (6 étapes)
 *   - L'étape courante (pour reprise)
 *   - Le statut complété / dismissé (pour bandeau dashboard)
 *   - Timestamp de complétion (rappel « refaire le questionnaire »)
 *
 * Les réponses sont dérivées en un **archétype** (`LearnerArchetype`)
 * et un **score de maturité** [0..100] par des helpers purs, réutilisés
 * dans `LearnerProfileSummary` et dans le moteur de recommandation.
 *
 * L'accès à la plateforme n'est PAS bloqué si l'onboarding n'est pas
 * complet — seuls les recommandations et le bandeau dashboard changent.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type Objective =
  | 'professional_skill'
  | 'certification'
  | 'career_change'
  | 'personal_growth'
  | 'company_training'
  | 'exam_prep';

export type Domain =
  | 'business'
  | 'finance'
  | 'accounting'
  | 'marketing'
  | 'sales'
  | 'it'
  | 'webdev'
  | 'data_ai'
  | 'project'
  | 'leadership'
  | 'languages'
  | 'health'
  | 'law'
  | 'entrepreneurship';

export type Level = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export type Availability =
  | 'less_1h'
  | 'between_1_3h'
  | 'between_3_5h'
  | 'more_5h';

export type LearningStyle =
  | 'short_videos'
  | 'long_courses'
  | 'exercises'
  | 'quizzes'
  | 'projects'
  | 'pdfs'
  | 'live_sessions';

export type CertificationInterest = 'yes' | 'no' | 'later';

/** Archétype dérivé pour la recommandation. */
export type LearnerArchetype =
  | 'beginner_certification' // Débutant orienté certification
  | 'career_switcher' // Professionnel en reconversion
  | 'skill_worker' // Apprenant orienté compétences métier
  | 'autonomous_advanced' // Autonome avancé
  | 'company_learner' // Apprenant entreprise
  | 'exam_taker' // Préparation examen
  | 'casual'; // Fallback (profil léger)

/** État persisté des réponses. */
export interface LearnerProfileAnswers {
  objective: Objective | null;
  domains: Domain[];
  level: Level | null;
  availability: Availability | null;
  learningStyles: LearningStyle[];
  certificationInterest: CertificationInterest | null;
}

// ─────────────────────────────────────────────────────────────
// Labels FR pour affichage (partagés page onboarding + summary)
// ─────────────────────────────────────────────────────────────

export const OBJECTIVE_LABELS: Record<Objective, string> = {
  professional_skill: 'Développer une compétence professionnelle',
  certification: 'Obtenir une certification',
  career_change: 'Changer de métier',
  personal_growth: 'Améliorer mes connaissances personnelles',
  company_training: 'Me former pour mon entreprise',
  exam_prep: 'Préparer un examen ou concours',
};

export const DOMAIN_LABELS: Record<Domain, string> = {
  business: 'Business',
  finance: 'Finance',
  accounting: 'Comptabilité',
  marketing: 'Marketing',
  sales: 'Vente',
  it: 'Informatique',
  webdev: 'Développement web',
  data_ai: 'Data / Intelligence artificielle',
  project: 'Gestion de projet',
  leadership: 'Leadership',
  languages: 'Langues',
  health: 'Santé',
  law: 'Droit',
  entrepreneurship: 'Entrepreneuriat',
};

export const LEVEL_LABELS: Record<Level, string> = {
  beginner: 'Débutant',
  intermediate: 'Intermédiaire',
  advanced: 'Avancé',
  expert: 'Professionnel',
};

export const AVAILABILITY_LABELS: Record<Availability, string> = {
  less_1h: 'Moins de 1h par semaine',
  between_1_3h: '1 à 3h par semaine',
  between_3_5h: '3 à 5h par semaine',
  more_5h: 'Plus de 5h par semaine',
};

export const LEARNING_STYLE_LABELS: Record<LearningStyle, string> = {
  short_videos: 'Vidéos courtes',
  long_courses: 'Cours longs et détaillés',
  exercises: 'Exercices pratiques',
  quizzes: 'Quiz fréquents',
  projects: 'Projets réels',
  pdfs: 'Documents PDF',
  live_sessions: 'Sessions live',
};

export const CERT_INTEREST_LABELS: Record<CertificationInterest, string> = {
  yes: 'Oui',
  no: 'Non',
  later: 'Peut-être plus tard',
};

// ─────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────

const EMPTY_ANSWERS: LearnerProfileAnswers = {
  objective: null,
  domains: [],
  level: null,
  availability: null,
  learningStyles: [],
  certificationInterest: null,
};

interface LearnerProfileState {
  answers: LearnerProfileAnswers;
  currentStep: number; // 0..5 (6 étapes)
  completed: boolean;
  completedAt: string | null;
  dismissed: boolean; // "Pas maintenant" cliqué sur banner

  setAnswer<K extends keyof LearnerProfileAnswers>(
    key: K,
    value: LearnerProfileAnswers[K],
  ): void;
  toggleArrayAnswer<
    K extends 'domains' | 'learningStyles',
  >(key: K, value: LearnerProfileAnswers[K][number]): void;
  setCurrentStep(step: number): void;
  markCompleted(): void;
  dismiss(): void;
  reset(): void;
}

export const useLearnerProfileStore = create<LearnerProfileState>()(
  persist(
    (set) => ({
      answers: EMPTY_ANSWERS,
      currentStep: 0,
      completed: false,
      completedAt: null,
      dismissed: false,

      setAnswer: (key, value) =>
        set((s) => ({
          answers: { ...s.answers, [key]: value },
        })),

      toggleArrayAnswer: (key, value) =>
        set((s) => {
          const list = s.answers[key] as unknown as string[];
          const exists = list.includes(value as unknown as string);
          const next = exists
            ? list.filter((v) => v !== (value as unknown as string))
            : [...list, value as unknown as string];
          return { answers: { ...s.answers, [key]: next as never } };
        }),

      setCurrentStep: (step) => set({ currentStep: step }),

      markCompleted: () =>
        set({
          completed: true,
          completedAt: new Date().toISOString(),
          currentStep: 6,
        }),

      dismiss: () => set({ dismissed: true }),

      reset: () =>
        set({
          answers: EMPTY_ANSWERS,
          currentStep: 0,
          completed: false,
          completedAt: null,
          dismissed: false,
        }),
    }),
    {
      name: 'be-learner-profile',
      partialize: (s) => ({
        answers: s.answers,
        currentStep: s.currentStep,
        completed: s.completed,
        completedAt: s.completedAt,
        dismissed: s.dismissed,
      }),
    },
  ),
);

// Selectors utiles
export const useLearnerProfileAnswers = () =>
  useLearnerProfileStore((s) => s.answers);
export const useIsOnboardingCompleted = () =>
  useLearnerProfileStore((s) => s.completed);
export const useOnboardingDismissed = () =>
  useLearnerProfileStore((s) => s.dismissed);

// ─────────────────────────────────────────────────────────────
// Dérivation : archétype + score de maturité + tags reco
// ─────────────────────────────────────────────────────────────

export interface DerivedLearnerProfile {
  archetype: LearnerArchetype;
  archetypeLabel: string;
  maturityScore: number; // 0..100
  tags: string[]; // domain slugs + éventuels boosters
  wantsCertification: boolean;
  isCompleted: boolean;
}

const ARCHETYPE_LABEL: Record<LearnerArchetype, string> = {
  beginner_certification: 'Débutant orienté certification',
  career_switcher: 'Professionnel en reconversion',
  skill_worker: 'Apprenant orienté compétences métier',
  autonomous_advanced: 'Apprenant autonome avancé',
  company_learner: 'Apprenant entreprise',
  exam_taker: 'Apprenant préparation examen',
  casual: 'Curieux polyvalent',
};

/**
 * Calcule l'archétype à partir des réponses. Priorités :
 *   exam_prep       → exam_taker
 *   company_training→ company_learner
 *   career_change   → career_switcher
 *   certification + niveau≤intermediate → beginner_certification
 *   niveau ≥ advanced + certification=no|later → autonomous_advanced
 *   professional_skill (autre) → skill_worker
 *   fallback        → casual
 */
export function deriveArchetype(
  a: LearnerProfileAnswers,
): LearnerArchetype {
  if (a.objective === 'exam_prep') return 'exam_taker';
  if (a.objective === 'company_training') return 'company_learner';
  if (a.objective === 'career_change') return 'career_switcher';
  if (
    a.objective === 'certification' &&
    (a.level === 'beginner' || a.level === 'intermediate')
  ) {
    return 'beginner_certification';
  }
  if (
    (a.level === 'advanced' || a.level === 'expert') &&
    (a.certificationInterest === 'no' || a.certificationInterest === 'later')
  ) {
    return 'autonomous_advanced';
  }
  if (a.objective === 'professional_skill') return 'skill_worker';
  return 'casual';
}

/**
 * Score de maturité : proportion des champs renseignés + bonus pour
 * niveau élevé et diversité des styles. Cadré [0..100].
 */
export function computeMaturityScore(a: LearnerProfileAnswers): number {
  let filled = 0;
  const total = 6;
  if (a.objective) filled += 1;
  if (a.domains.length > 0) filled += 1;
  if (a.level) filled += 1;
  if (a.availability) filled += 1;
  if (a.learningStyles.length > 0) filled += 1;
  if (a.certificationInterest) filled += 1;

  const base = Math.round((filled / total) * 80); // 80 max sur remplissage

  // Bonus (jusqu'à +20)
  let bonus = 0;
  if (a.level === 'advanced' || a.level === 'expert') bonus += 6;
  if (a.availability === 'between_3_5h' || a.availability === 'more_5h') {
    bonus += 6;
  }
  if (a.learningStyles.length >= 3) bonus += 4;
  if (a.domains.length >= 3) bonus += 4;

  return Math.min(100, base + bonus);
}

/** Tags exploitables par le moteur de recommandation (client-side). */
export function deriveTags(a: LearnerProfileAnswers): string[] {
  const tags: string[] = [...a.domains];
  if (a.objective) tags.push(`objective:${a.objective}`);
  if (a.level) tags.push(`level:${a.level}`);
  if (a.availability) tags.push(`time:${a.availability}`);
  a.learningStyles.forEach((s) => tags.push(`style:${s}`));
  if (a.certificationInterest) tags.push(`cert:${a.certificationInterest}`);
  return tags;
}

export function deriveProfile(
  a: LearnerProfileAnswers,
  completed: boolean,
): DerivedLearnerProfile {
  const archetype = deriveArchetype(a);
  return {
    archetype,
    archetypeLabel: ARCHETYPE_LABEL[archetype],
    maturityScore: computeMaturityScore(a),
    tags: deriveTags(a),
    wantsCertification: a.certificationInterest === 'yes',
    isCompleted: completed,
  };
}

/** Hook pratique — recalcule à chaque changement. */
export function useDerivedLearnerProfile(): DerivedLearnerProfile {
  const answers = useLearnerProfileAnswers();
  const completed = useIsOnboardingCompleted();
  return deriveProfile(answers, completed);
}
