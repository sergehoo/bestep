/**
 * LearnerProfileSummary.tsx — R24.4
 *
 * Carte résumé du profil apprenant :
 *   - Archétype (badge coloré) + tag line
 *   - Score de maturité (0..100)
 *   - Objectif principal
 *   - Domaines d'intérêt (chips)
 *   - Niveau, disponibilité, styles préférés
 *   - Bouton "Modifier mon profil"
 *
 * Utilisée dans :
 *   - /recommended-courses (à côté de la liste de cours)
 *   - /learn (dashboard apprenant) en version compacte
 */
import { Link } from 'react-router-dom';
import {
  Award,
  Clock,
  BarChart3,
  Palette,
  Layers3,
  Target,
  Sparkles,
  Edit3,
} from 'lucide-react';

import {
  useLearnerProfileAnswers,
  useDerivedLearnerProfile,
  OBJECTIVE_LABELS,
  DOMAIN_LABELS,
  LEVEL_LABELS,
  AVAILABILITY_LABELS,
  LEARNING_STYLE_LABELS,
  CERT_INTEREST_LABELS,
  type LearnerArchetype,
} from '@/stores/learner-profile';

const ARCHETYPE_ACCENT: Record<
  LearnerArchetype,
  { bg: string; text: string; ring: string }
> = {
  beginner_certification: {
    bg: 'bg-primary-100',
    text: 'text-primary-800',
    ring: 'ring-primary-200',
  },
  career_switcher: {
    bg: 'bg-rose-100',
    text: 'text-rose-800',
    ring: 'ring-rose-200',
  },
  skill_worker: {
    bg: 'bg-emerald-100',
    text: 'text-emerald-800',
    ring: 'ring-emerald-200',
  },
  autonomous_advanced: {
    bg: 'bg-violet-100',
    text: 'text-violet-800',
    ring: 'ring-violet-200',
  },
  company_learner: {
    bg: 'bg-accent-100',
    text: 'text-accent-800',
    ring: 'ring-accent-200',
  },
  exam_taker: {
    bg: 'bg-cyan-100',
    text: 'text-cyan-800',
    ring: 'ring-cyan-200',
  },
  casual: {
    bg: 'bg-neutral-100',
    text: 'text-neutral-800',
    ring: 'ring-neutral-200',
  },
};

interface Props {
  /** Version compacte (dashboard) vs complète (page dédiée). */
  variant?: 'full' | 'compact';
}

export function LearnerProfileSummary({ variant = 'full' }: Props) {
  const answers = useLearnerProfileAnswers();
  const profile = useDerivedLearnerProfile();
  const accent = ARCHETYPE_ACCENT[profile.archetype];

  return (
    <div className="bg-white dark:bg-neutral-800 rounded-3xl border border-neutral-100 dark:border-neutral-700 p-5 sm:p-6 shadow-soft">
      {/* Archétype + score */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-widest text-primary-600">
            Votre profil d'apprentissage
          </p>
          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ring-1 ${accent.bg} ${accent.text} ${accent.ring}`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              {profile.archetypeLabel}
            </span>
            {profile.wantsCertification && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 ring-1 ring-amber-200">
                <Award className="w-3 h-3" />
                Certification
              </span>
            )}
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="relative w-14 h-14">
            <ScoreRing value={profile.maturityScore} />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm font-extrabold text-neutral-900 dark:text-white">
                {profile.maturityScore}
              </span>
            </div>
          </div>
          <p className="text-[10px] font-semibold text-neutral-500 mt-1">
            Maturité
          </p>
        </div>
      </div>

      {/* Détails */}
      <dl className="mt-5 space-y-3 text-sm">
        {answers.objective && (
          <SummaryRow
            Icon={Target}
            label="Objectif"
            value={OBJECTIVE_LABELS[answers.objective]}
          />
        )}
        {answers.domains.length > 0 && (
          <SummaryRow
            Icon={Layers3}
            label={`Domaines (${answers.domains.length})`}
            value={
              <div className="flex flex-wrap gap-1.5">
                {answers.domains.map((d) => (
                  <span
                    key={d}
                    className="px-2 py-0.5 text-[11px] rounded-full bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 font-semibold"
                  >
                    {DOMAIN_LABELS[d]}
                  </span>
                ))}
              </div>
            }
          />
        )}
        {answers.level && variant === 'full' && (
          <SummaryRow
            Icon={BarChart3}
            label="Niveau"
            value={LEVEL_LABELS[answers.level]}
          />
        )}
        {answers.availability && variant === 'full' && (
          <SummaryRow
            Icon={Clock}
            label="Disponibilité"
            value={AVAILABILITY_LABELS[answers.availability]}
          />
        )}
        {answers.learningStyles.length > 0 && variant === 'full' && (
          <SummaryRow
            Icon={Palette}
            label="Styles préférés"
            value={
              <div className="flex flex-wrap gap-1.5">
                {answers.learningStyles.map((s) => (
                  <span
                    key={s}
                    className="px-2 py-0.5 text-[11px] rounded-full bg-primary-50 text-primary-700 font-semibold"
                  >
                    {LEARNING_STYLE_LABELS[s]}
                  </span>
                ))}
              </div>
            }
          />
        )}
        {answers.certificationInterest && variant === 'full' && (
          <SummaryRow
            Icon={Award}
            label="Certification"
            value={CERT_INTEREST_LABELS[answers.certificationInterest]}
          />
        )}
      </dl>

      {/* CTA modifier */}
      <div className="mt-6 pt-4 border-t border-neutral-100 dark:border-neutral-700">
        <Link
          to="/onboarding/learner"
          className="inline-flex items-center gap-2 text-xs font-bold text-primary-700 hover:text-primary-800"
        >
          <Edit3 className="w-3.5 h-3.5" />
          Modifier mon profil d'apprentissage
        </Link>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sous-composants
// ─────────────────────────────────────────────────────────────

interface SummaryRowProps {
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}
function SummaryRow({ Icon, label, value }: SummaryRowProps) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-8 h-8 shrink-0 rounded-lg bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 flex items-center justify-center">
        <Icon className="w-4 h-4" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          {label}
        </p>
        <div className="mt-0.5 text-neutral-900 dark:text-white font-semibold text-sm">
          {value}
        </div>
      </div>
    </div>
  );
}

interface ScoreRingProps {
  value: number;
}
function ScoreRing({ value }: ScoreRingProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = 22;
  const c = 2 * Math.PI * radius;
  const offset = c - (clamped / 100) * c;
  return (
    <svg
      viewBox="0 0 56 56"
      className="w-full h-full -rotate-90"
      aria-hidden
    >
      <circle
        cx="28"
        cy="28"
        r={radius}
        className="stroke-neutral-200 dark:stroke-neutral-700"
        strokeWidth="4"
        fill="none"
      />
      <circle
        cx="28"
        cy="28"
        r={radius}
        className="stroke-primary-500 transition-all"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
      />
    </svg>
  );
}

export default LearnerProfileSummary;
