/**
 * LearnerOnboardingPage.tsx — R24.3
 *
 * Wizard progressif en 6 étapes qui construit le profil d'apprentissage
 * de l'utilisateur. Route : /onboarding/learner
 *
 * Fonctionnalités :
 * - Progress bar visible avec numéro d'étape
 * - Boutons Précédent / Suivant, dernière étape → Terminer
 * - Sauvegarde automatique dans localStorage à chaque changement (via
 *   le persist du store learner-profile) — reprise possible plus tard
 * - Bouton "Continuer plus tard" (dismiss) qui redirige vers /learn avec
 *   un bandeau
 * - Validation : chaque étape single-select doit être renseignée, chaque
 *   étape multi doit avoir ≥ 1 sélection
 * - Après complétion → redirection /recommended-courses
 */
import { useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Sparkles,
  X,
  Target,
  Layers3,
  BarChart3,
  Clock,
  Palette,
  Award,
  Briefcase,
  GraduationCap,
  Rocket,
  BookOpen,
  Building2,
  BadgeCheck,
  Video,
  FileText,
  Puzzle,
  MessageSquare,
  Radio,
  ClipboardList,
  Landmark,
  Calculator,
  Megaphone,
  ShoppingBag,
  Cpu,
  Code2,
  Sparkle,
  Crown,
  Languages,
  HeartPulse,
  Scale,
} from 'lucide-react';

import { OnboardingStep, type OnboardingOption } from '@/components/onboarding/OnboardingStep';
import {
  useLearnerProfileStore,
  useLearnerProfileAnswers,
  OBJECTIVE_LABELS,
  DOMAIN_LABELS,
  LEVEL_LABELS,
  AVAILABILITY_LABELS,
  LEARNING_STYLE_LABELS,
  CERT_INTEREST_LABELS,
  type Objective,
  type Domain,
  type Level,
  type Availability,
  type LearningStyle,
  type CertificationInterest,
} from '@/stores/learner-profile';

// ─────────────────────────────────────────────────────────────
// Configuration des étapes
// ─────────────────────────────────────────────────────────────

const OBJECTIVE_OPTIONS: OnboardingOption<Objective>[] = [
  { value: 'professional_skill', label: OBJECTIVE_LABELS.professional_skill, Icon: Briefcase, description: 'Compétences directement utiles au travail.' },
  { value: 'certification', label: OBJECTIVE_LABELS.certification, Icon: BadgeCheck, description: 'Décrocher un certificat reconnu.' },
  { value: 'career_change', label: OBJECTIVE_LABELS.career_change, Icon: Rocket, description: 'Se reconvertir vers un nouveau métier.' },
  { value: 'personal_growth', label: OBJECTIVE_LABELS.personal_growth, Icon: BookOpen, description: 'Apprendre pour le plaisir et la curiosité.' },
  { value: 'company_training', label: OBJECTIVE_LABELS.company_training, Icon: Building2, description: 'Formation dans le cadre de mon organisation.' },
  { value: 'exam_prep', label: OBJECTIVE_LABELS.exam_prep, Icon: GraduationCap, description: 'Préparer un examen ou concours précis.' },
];

const DOMAIN_OPTIONS: OnboardingOption<Domain>[] = [
  { value: 'business', label: DOMAIN_LABELS.business, Icon: Briefcase },
  { value: 'finance', label: DOMAIN_LABELS.finance, Icon: Landmark },
  { value: 'accounting', label: DOMAIN_LABELS.accounting, Icon: Calculator },
  { value: 'marketing', label: DOMAIN_LABELS.marketing, Icon: Megaphone },
  { value: 'sales', label: DOMAIN_LABELS.sales, Icon: ShoppingBag },
  { value: 'it', label: DOMAIN_LABELS.it, Icon: Cpu },
  { value: 'webdev', label: DOMAIN_LABELS.webdev, Icon: Code2 },
  { value: 'data_ai', label: DOMAIN_LABELS.data_ai, Icon: Sparkle },
  { value: 'project', label: DOMAIN_LABELS.project, Icon: ClipboardList },
  { value: 'leadership', label: DOMAIN_LABELS.leadership, Icon: Crown },
  { value: 'languages', label: DOMAIN_LABELS.languages, Icon: Languages },
  { value: 'health', label: DOMAIN_LABELS.health, Icon: HeartPulse },
  { value: 'law', label: DOMAIN_LABELS.law, Icon: Scale },
  { value: 'entrepreneurship', label: DOMAIN_LABELS.entrepreneurship, Icon: Rocket },
];

const LEVEL_OPTIONS: OnboardingOption<Level>[] = [
  { value: 'beginner', label: LEVEL_LABELS.beginner, Icon: BookOpen, description: 'Je démarre de zéro.' },
  { value: 'intermediate', label: LEVEL_LABELS.intermediate, Icon: BarChart3, description: 'Je connais les bases.' },
  { value: 'advanced', label: LEVEL_LABELS.advanced, Icon: Sparkles, description: 'Je suis à l\'aise.' },
  { value: 'expert', label: LEVEL_LABELS.expert, Icon: Crown, description: 'J\'exerce ce métier.' },
];

const AVAILABILITY_OPTIONS: OnboardingOption<Availability>[] = [
  { value: 'less_1h', label: AVAILABILITY_LABELS.less_1h, Icon: Clock },
  { value: 'between_1_3h', label: AVAILABILITY_LABELS.between_1_3h, Icon: Clock },
  { value: 'between_3_5h', label: AVAILABILITY_LABELS.between_3_5h, Icon: Clock },
  { value: 'more_5h', label: AVAILABILITY_LABELS.more_5h, Icon: Clock },
];

const STYLE_OPTIONS: OnboardingOption<LearningStyle>[] = [
  { value: 'short_videos', label: LEARNING_STYLE_LABELS.short_videos, Icon: Video },
  { value: 'long_courses', label: LEARNING_STYLE_LABELS.long_courses, Icon: BookOpen },
  { value: 'exercises', label: LEARNING_STYLE_LABELS.exercises, Icon: Puzzle },
  { value: 'quizzes', label: LEARNING_STYLE_LABELS.quizzes, Icon: MessageSquare },
  { value: 'projects', label: LEARNING_STYLE_LABELS.projects, Icon: Rocket },
  { value: 'pdfs', label: LEARNING_STYLE_LABELS.pdfs, Icon: FileText },
  { value: 'live_sessions', label: LEARNING_STYLE_LABELS.live_sessions, Icon: Radio },
];

const CERT_OPTIONS: OnboardingOption<CertificationInterest>[] = [
  { value: 'yes', label: CERT_INTEREST_LABELS.yes, Icon: Award },
  { value: 'no', label: CERT_INTEREST_LABELS.no, Icon: BookOpen },
  { value: 'later', label: CERT_INTEREST_LABELS.later, Icon: Clock },
];

// ─────────────────────────────────────────────────────────────
// Métadonnées d'étapes (pour progress bar + titre)
// ─────────────────────────────────────────────────────────────

interface StepMeta {
  key: keyof typeof STEP_ICONS;
  title: string;
  subtitle: string;
}
const STEP_ICONS = {
  objective: Target,
  domains: Layers3,
  level: BarChart3,
  availability: Clock,
  styles: Palette,
  certification: Award,
} as const;

const STEPS: StepMeta[] = [
  { key: 'objective', title: 'Quel est votre objectif principal ?', subtitle: 'Une seule réponse — vous pourrez toujours l\'affiner plus tard.' },
  { key: 'domains', title: 'Quels domaines vous intéressent ?', subtitle: 'Choisissez jusqu\'à 5 domaines pour affiner vos recommandations.' },
  { key: 'level', title: 'Quel est votre niveau actuel ?', subtitle: 'Cela nous aide à sélectionner des cours à votre rythme.' },
  { key: 'availability', title: 'Combien de temps pouvez-vous consacrer à la formation ?', subtitle: 'Estimez votre disponibilité hebdomadaire.' },
  { key: 'styles', title: 'Quel style d\'apprentissage préférez-vous ?', subtitle: 'Vous pouvez cocher plusieurs formats.' },
  { key: 'certification', title: 'Souhaitez-vous suivre des cours certifiants ?', subtitle: 'Certains cours débouchent sur un certificat vérifiable.' },
];

// ─────────────────────────────────────────────────────────────
// Composant page
// ─────────────────────────────────────────────────────────────

export default function LearnerOnboardingPage() {
  const navigate = useNavigate();
  const answers = useLearnerProfileAnswers();
  const currentStep = useLearnerProfileStore((s) => s.currentStep);
  const setStep = useLearnerProfileStore((s) => s.setCurrentStep);
  const setAnswer = useLearnerProfileStore((s) => s.setAnswer);
  const toggle = useLearnerProfileStore((s) => s.toggleArrayAnswer);
  const markCompleted = useLearnerProfileStore((s) => s.markCompleted);
  const dismiss = useLearnerProfileStore((s) => s.dismiss);

  const stepIndex = Math.min(currentStep, STEPS.length - 1);
  const meta = STEPS[stepIndex];

  const canGoNext = useMemo(() => {
    switch (stepIndex) {
      case 0:
        return !!answers.objective;
      case 1:
        return answers.domains.length > 0;
      case 2:
        return !!answers.level;
      case 3:
        return !!answers.availability;
      case 4:
        return answers.learningStyles.length > 0;
      case 5:
        return !!answers.certificationInterest;
      default:
        return false;
    }
  }, [stepIndex, answers]);

  function handleBack() {
    if (stepIndex > 0) setStep(stepIndex - 1);
  }

  function handleNext() {
    if (!canGoNext) return;
    if (stepIndex >= STEPS.length - 1) {
      markCompleted();
      navigate('/recommended-courses', { replace: true });
    } else {
      setStep(stepIndex + 1);
    }
  }

  function handleSkipLater() {
    dismiss();
    navigate('/learn', { replace: true });
  }

  const progressPct = ((stepIndex + 1) / STEPS.length) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50/60 via-white to-accent-50/40 dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-800 text-neutral-900 dark:text-neutral-100">
      <Helmet>
        <title>Personnalisez votre parcours — BestÉpargne Academy</title>
      </Helmet>

      {/* Header */}
      <header className="border-b border-neutral-100 dark:border-neutral-800 bg-white/70 dark:bg-neutral-900/70 backdrop-blur sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2" aria-label="Best Épargne — accueil">
            <img
              src="/logo_img.png"
              alt=""
              className="h-8 w-8 object-contain"
            />
            <span className="text-base font-extrabold text-primary-700">
              Best-<span className="text-accent-500">Épargne</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={handleSkipLater}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Continuer plus tard
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
        {/* Intro */}
        <div className="text-center mb-6">
          <p className="text-xs font-bold uppercase tracking-widest text-primary-600">
            Personnalisation
          </p>
          <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold text-neutral-900 dark:text-white">
            Créons ensemble votre parcours d'apprentissage
          </h1>
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400 max-w-lg mx-auto">
            6 questions rapides pour vous proposer les cours les plus
            pertinents. Vous pouvez modifier ces réponses à tout moment
            depuis votre profil.
          </p>
        </div>

        {/* Progress */}
        <div className="mb-8">
          <div className="flex items-center justify-between text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
            <span>
              Étape {stepIndex + 1} / {STEPS.length}
            </span>
            <span>{Math.round(progressPct)}%</span>
          </div>
          <div className="mt-2 h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary-500 to-accent-400 transition-all duration-500 rounded-full"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {/* Dots des étapes */}
          <div className="mt-3 flex items-center justify-between">
            {STEPS.map((s, i) => {
              const Ic = STEP_ICONS[s.key];
              const done = i < stepIndex;
              const active = i === stepIndex;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setStep(i)}
                  className="flex flex-col items-center gap-1 group"
                  aria-label={`Aller à l'étape ${i + 1}`}
                >
                  <span
                    className={
                      'w-8 h-8 rounded-full flex items-center justify-center text-xs font-extrabold transition-colors ' +
                      (active
                        ? 'bg-primary-600 text-white ring-2 ring-primary-200'
                        : done
                          ? 'bg-emerald-500 text-white'
                          : 'bg-neutral-200 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400')
                    }
                  >
                    <Ic className="w-3.5 h-3.5" />
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Card d'étape */}
        <div className="bg-white dark:bg-neutral-800 rounded-3xl shadow-lift dark:shadow-none dark:border dark:border-neutral-700 p-6 sm:p-8">
          <AnimatePresence mode="wait">
            {stepIndex === 0 && (
              <OnboardingStep
                title={meta.title}
                subtitle={meta.subtitle}
                options={OBJECTIVE_OPTIONS}
                mode="single"
                selected={answers.objective}
                onSelect={(v) => setAnswer('objective', v)}
                columns={2}
              />
            )}
            {stepIndex === 1 && (
              <OnboardingStep
                title={meta.title}
                subtitle={meta.subtitle}
                options={DOMAIN_OPTIONS}
                mode="multi"
                max={5}
                selected={answers.domains}
                onSelect={(v) => toggle('domains', v)}
                columns={3}
              />
            )}
            {stepIndex === 2 && (
              <OnboardingStep
                title={meta.title}
                subtitle={meta.subtitle}
                options={LEVEL_OPTIONS}
                mode="single"
                selected={answers.level}
                onSelect={(v) => setAnswer('level', v)}
                columns={2}
              />
            )}
            {stepIndex === 3 && (
              <OnboardingStep
                title={meta.title}
                subtitle={meta.subtitle}
                options={AVAILABILITY_OPTIONS}
                mode="single"
                selected={answers.availability}
                onSelect={(v) => setAnswer('availability', v)}
                columns={2}
              />
            )}
            {stepIndex === 4 && (
              <OnboardingStep
                title={meta.title}
                subtitle={meta.subtitle}
                options={STYLE_OPTIONS}
                mode="multi"
                selected={answers.learningStyles}
                onSelect={(v) => toggle('learningStyles', v)}
                columns={3}
              />
            )}
            {stepIndex === 5 && (
              <OnboardingStep
                title={meta.title}
                subtitle={meta.subtitle}
                options={CERT_OPTIONS}
                mode="single"
                selected={answers.certificationInterest}
                onSelect={(v) => setAnswer('certificationInterest', v)}
                columns={3}
              />
            )}
          </AnimatePresence>

          {/* Actions */}
          <div className="mt-8 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleBack}
              disabled={stepIndex === 0}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ArrowLeft className="w-4 h-4" />
              Précédent
            </button>

            <button
              type="button"
              onClick={handleNext}
              disabled={!canGoNext}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-bold text-sm shadow-sm transition active:scale-[.98] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {stepIndex === STEPS.length - 1
                ? 'Voir mes recommandations'
                : 'Suivant'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-neutral-500 dark:text-neutral-400">
          Vos réponses sont enregistrées automatiquement — vous pouvez
          reprendre à tout moment.
        </p>
      </main>
    </div>
  );
}
