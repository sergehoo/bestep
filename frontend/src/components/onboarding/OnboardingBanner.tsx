/**
 * OnboardingBanner.tsx — R24.6
 *
 * Bannière discrète affichée sur le dashboard apprenant tant que
 * l'onboarding n'est pas complété (et pas dismissed).
 *
 * - "Continuer l'onboarding" reprend au step courant
 * - "Pas maintenant" appelle `dismiss()` — la bannière n'apparaîtra plus
 *    jusqu'à un reset. L'utilisateur peut toujours refaire le questionnaire
 *    depuis le profil.
 */
import { Link } from 'react-router-dom';
import { Sparkles, X, ArrowRight } from 'lucide-react';
import {
  useLearnerProfileStore,
  useIsOnboardingCompleted,
  useOnboardingDismissed,
} from '@/stores/learner-profile';

export function OnboardingBanner() {
  const completed = useIsOnboardingCompleted();
  const dismissed = useOnboardingDismissed();
  const dismiss = useLearnerProfileStore((s) => s.dismiss);
  const currentStep = useLearnerProfileStore((s) => s.currentStep);

  if (completed || dismissed) return null;

  const started = currentStep > 0;

  return (
    <div
      className="relative rounded-2xl border border-primary-100 bg-gradient-to-r from-primary-50 via-white to-accent-50/40 dark:from-primary-900/20 dark:via-neutral-800 dark:to-accent-900/10 dark:border-primary-800 p-5 sm:p-6"
      role="status"
    >
      <div className="flex items-start gap-4">
        <span className="w-10 h-10 shrink-0 rounded-xl bg-primary-600 text-white flex items-center justify-center">
          <Sparkles className="w-5 h-5" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-extrabold text-neutral-900 dark:text-white">
            {started
              ? 'Terminez votre profil pour de meilleures recommandations'
              : 'Personnalisez votre parcours d\'apprentissage'}
          </p>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
            {started
              ? `Vous êtes à l'étape ${currentStep + 1} sur 6. Il ne reste que quelques questions !`
              : '6 questions rapides pour recevoir des cours faits sur mesure.'}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link
              to="/onboarding/learner"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold transition"
            >
              {started ? 'Reprendre' : 'Commencer'}
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <button
              type="button"
              onClick={() => dismiss()}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
            >
              Pas maintenant
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => dismiss()}
          aria-label="Fermer la bannière"
          className="shrink-0 p-1 rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-700 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default OnboardingBanner;
