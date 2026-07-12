/**
 * AICourseGeneratorPage.tsx — Assistant IA de génération de cours (Phase 2).
 *
 * Wizard 6 étapes :
 *   1. Brief          — Le formateur décrit son besoin
 *   2. Plan           — L'IA propose le plan, le formateur peut éditer
 *   3. Contenu        — Génération leçon par leçon
 *   4. Quiz           — Génération par section
 *   5. Certification  — Recommandation IA + choix explicite
 *   6. Validation     — Récap + finalisation (crée le Course en DRAFT)
 *
 * Aucun contenu n'est publié sans validation humaine explicite.
 */
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Wand2,
  Check,
  Loader2,
  BookOpen,
  ListChecks,
  Award,
  ClipboardCheck,
  Layout,
  RefreshCw,
  FileText,
} from 'lucide-react';

import {
  useAICourseGeneration,
  useCreateAICourseGeneration,
  useFinalizeCourseGeneration,
  useGenerateLessonContent,
  useGeneratePlan,
  useGenerateQuiz,
  useRecommendCertification,
  usePatchAICourseGeneration,
} from '@/hooks/ai';
import { InstructorShell } from '@/components/instructor/InstructorShell';
import type {
  AICourseBrief,
  AICoursePlan,
  AICourseSectionMeta,
} from '@/lib/ai-types';

type StepKey = 1 | 2 | 3 | 4 | 5 | 6;

const STEPS: Array<{ key: StepKey; label: string; Icon: typeof BookOpen }> = [
  { key: 1, label: 'Brief', Icon: Wand2 },
  { key: 2, label: 'Plan', Icon: Layout },
  { key: 3, label: 'Contenu', Icon: FileText },
  { key: 4, label: 'Quiz', Icon: ListChecks },
  { key: 5, label: 'Certification', Icon: Award },
  { key: 6, label: 'Validation', Icon: ClipboardCheck },
];

export default function AICourseGeneratorPage() {
  const [search, setSearch] = useSearchParams();
  const idFromUrl = search.get('gen');
  const [genId, setGenId] = useState<number | null>(
    idFromUrl ? Number(idFromUrl) : null,
  );
  const [step, setStep] = useState<StepKey>(genId ? 2 : 1);

  const { data: generation } = useAICourseGeneration(genId);
  const create = useCreateAICourseGeneration();

  function goToStep(s: StepKey) {
    setStep(s);
  }

  async function handleBriefSubmit(brief: AICourseBrief) {
    const created = await create.mutateAsync(brief);
    setGenId(created.id);
    setSearch({ gen: String(created.id) });
    setStep(2);
  }

  return (
    <InstructorShell>
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-neutral-900 dark:text-white">
              Best-AI — générateur de cours
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              6 étapes guidées. Le cours généré est créé en brouillon —
              vous validez avant publication.
            </p>
          </div>
        </header>

        <ol className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {STEPS.map((s) => {
            const done = s.key < step;
            const active = s.key === step;
            const disabled = !genId && s.key > 1;
            return (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => !disabled && goToStep(s.key)}
                  disabled={disabled}
                  className={
                    'w-full flex flex-col items-start gap-1 px-3 py-2 rounded-xl border transition ' +
                    (active
                      ? 'bg-primary-600 border-primary-600 text-white shadow-md'
                      : done
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                      : 'bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400') +
                    (disabled ? ' opacity-40 cursor-not-allowed' : '')
                  }
                >
                  <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide">
                    <s.Icon className="w-3.5 h-3.5" />
                    Étape {s.key}
                  </span>
                  <span className="text-sm font-bold">{s.label}</span>
                </button>
              </li>
            );
          })}
        </ol>

        {step === 1 && <StepBrief onSubmit={handleBriefSubmit} pending={create.isPending} />}
        {step === 2 && generation && (
          <StepPlan generation={generation} onNext={() => goToStep(3)} />
        )}
        {step === 3 && generation && (
          <StepContent
            generation={generation}
            onNext={() => goToStep(4)}
            onBack={() => goToStep(2)}
          />
        )}
        {step === 4 && generation && (
          <StepQuiz
            generation={generation}
            onNext={() => goToStep(5)}
            onBack={() => goToStep(3)}
          />
        )}
        {step === 5 && generation && (
          <StepCertification
            generation={generation}
            onNext={() => goToStep(6)}
            onBack={() => goToStep(4)}
          />
        )}
        {step === 6 && generation && (
          <StepReview generation={generation} onBack={() => goToStep(5)} />
        )}
      </div>
    </InstructorShell>
  );
}

// ─────────────────────────────────────────────────────────────
// Étape 1 — Brief
// ─────────────────────────────────────────────────────────────

function StepBrief({
  onSubmit,
  pending,
}: {
  onSubmit: (b: AICourseBrief) => void;
  pending: boolean;
}) {
  const [topic, setTopic] = useState('');
  const [audience, setAudience] = useState('débutants');
  const [level, setLevel] = useState<'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'>('BEGINNER');
  const [language, setLanguage] = useState('fr');
  const [durationHours, setDurationHours] = useState(4);
  const [withCert, setWithCert] = useState(true);
  const [extra, setExtra] = useState('');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!topic.trim()) return;
        onSubmit({
          topic: topic.trim(),
          audience: audience.trim(),
          level,
          language,
          duration_hours: durationHours,
          with_certificate: withCert,
          extra_instructions: extra.trim(),
        });
      }}
      className="rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-5 space-y-4"
    >
      <div>
        <h2 className="text-lg font-extrabold text-neutral-900 dark:text-white mb-1">
          Décrivez votre besoin
        </h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          L'IA construit un plan structuré à partir de vos indications. Vous
          pourrez tout modifier ensuite.
        </p>
      </div>

      <Field label="Sujet du cours *">
        <input
          type="text"
          required
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="ex : Investir en bourse pour les débutants"
          className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Public cible">
          <input
            type="text"
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            placeholder="débutants, gestionnaires, étudiants…"
            className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </Field>
        <Field label="Niveau">
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as never)}
            className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="BEGINNER">Débutant</option>
            <option value="INTERMEDIATE">Intermédiaire</option>
            <option value="ADVANCED">Avancé</option>
          </select>
        </Field>
        <Field label="Langue">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="fr">Français</option>
            <option value="en">Anglais</option>
          </select>
        </Field>
        <Field label="Durée estimée (heures)">
          <input
            type="number"
            min={1}
            max={100}
            value={durationHours}
            onChange={(e) => setDurationHours(Number(e.target.value) || 4)}
            className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </Field>
      </div>

      <label className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-700 dark:text-neutral-300 cursor-pointer">
        <input
          type="checkbox"
          checked={withCert}
          onChange={(e) => setWithCert(e.target.checked)}
          className="w-4 h-4 accent-primary-600"
        />
        Envisager une certification
      </label>

      <Field label="Instructions complémentaires">
        <textarea
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          rows={3}
          placeholder="Ton pédagogique, exemples à privilégier, cas pratiques…"
          className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </Field>

      <div className="flex items-center justify-end">
        <button
          type="submit"
          disabled={pending || !topic.trim()}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-bold shadow-md shadow-primary-500/20 transition"
        >
          {pending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Création…
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" /> Lancer la génération
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────
// Étape 2 — Plan (avec édition inline + régénération)
// ─────────────────────────────────────────────────────────────

function StepPlan({
  generation,
  onNext,
}: {
  generation: ReturnType<typeof useAICourseGeneration>['data'];
  onNext: () => void;
}) {
  const genId = generation!.id;
  const genPlan = useGeneratePlan(genId);
  const patch = usePatchAICourseGeneration(genId);
  const plan: AICoursePlan = generation!.plan || {};
  const hasPlan = Array.isArray(plan.sections) && plan.sections.length > 0;

  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-extrabold text-neutral-900 dark:text-white">
            {hasPlan ? plan.title || 'Plan proposé' : 'Générer le plan'}
          </h2>
          {hasPlan && plan.subtitle && (
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
              {plan.subtitle}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => genPlan.mutate()}
            disabled={genPlan.isPending}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/20 text-primary-800 dark:text-primary-200 text-sm font-semibold hover:bg-primary-100 transition disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${genPlan.isPending ? 'animate-spin' : ''}`} />
            {hasPlan ? 'Régénérer' : 'Générer le plan'}
          </button>
          {hasPlan && (
            <button
              type="button"
              onClick={onNext}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold transition"
            >
              Suivant <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {hasPlan && plan.description && (
        <p className="text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-line border-l-2 border-primary-400 pl-3">
          {plan.description}
        </p>
      )}

      {hasPlan && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-neutral-600 dark:text-neutral-400">
          <Meta label="Niveau">{plan.level || '—'}</Meta>
          <Meta label="Durée estimée">{plan.duration_hours ? `${plan.duration_hours} h` : '—'}</Meta>
          <Meta label="Langue">{plan.language || '—'}</Meta>
        </div>
      )}

      {hasPlan && (
        <div className="space-y-3">
          <h3 className="text-sm font-extrabold text-neutral-900 dark:text-white">
            Sections proposées
          </h3>
          <ul className="space-y-2">
            {plan.sections!.map((section, sIdx) => (
              <SectionEditor
                key={sIdx}
                idx={sIdx}
                section={section}
                onChange={(newSection) => {
                  const nextSections = [...(plan.sections ?? [])];
                  nextSections[sIdx] = newSection;
                  patch.mutate({ plan: { ...plan, sections: nextSections } });
                }}
                onRemove={() => {
                  const nextSections = (plan.sections ?? []).filter(
                    (_, i) => i !== sIdx,
                  );
                  patch.mutate({ plan: { ...plan, sections: nextSections } });
                }}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SectionEditor({
  idx,
  section,
  onChange,
  onRemove,
}: {
  idx: number;
  section: AICourseSectionMeta;
  onChange: (s: AICourseSectionMeta) => void;
  onRemove: () => void;
}) {
  return (
    <li className="rounded-xl border border-neutral-100 dark:border-neutral-800 p-3 bg-neutral-50/40 dark:bg-neutral-800/30">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-600 text-white text-xs font-bold">
          {idx + 1}
        </span>
        <input
          value={section.title}
          onChange={(e) => onChange({ ...section, title: e.target.value })}
          className="flex-1 bg-transparent text-sm font-bold text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500 rounded px-1"
        />
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-rose-600 hover:text-rose-700"
        >
          Retirer
        </button>
      </div>
      {section.summary && (
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 pl-8">
          {section.summary}
        </p>
      )}
      <ul className="mt-2 pl-8 space-y-1">
        {(section.lessons ?? []).map((lesson, lIdx) => (
          <li
            key={lIdx}
            className="text-xs text-neutral-700 dark:text-neutral-300 flex items-center gap-2"
          >
            <span className="text-neutral-400 w-8">
              {idx + 1}.{lIdx + 1}
            </span>
            <span className="flex-1 truncate">{lesson.title}</span>
            <span className="text-[10px] text-neutral-400">
              {lesson.duration_min ?? '—'} min
            </span>
          </li>
        ))}
      </ul>
    </li>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-neutral-50 dark:bg-neutral-800 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">
        {label}
      </p>
      <p className="font-semibold text-neutral-900 dark:text-white">
        {children}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Étape 3 — Contenu (par leçon)
// ─────────────────────────────────────────────────────────────

function StepContent({
  generation,
  onNext,
  onBack,
}: {
  generation: ReturnType<typeof useAICourseGeneration>['data'];
  onNext: () => void;
  onBack: () => void;
}) {
  const genId = generation!.id;
  const genLesson = useGenerateLessonContent(genId);
  const plan = generation!.plan || {};
  const lessonsMap = generation!.lessons_content?.lessons || {};

  const sections = plan.sections || [];
  const totalLessons = useMemo(
    () => sections.reduce((n, s) => n + (s.lessons?.length || 0), 0),
    [sections],
  );
  const generatedCount = Object.keys(lessonsMap).length;

  async function generateAll() {
    for (let s = 0; s < sections.length; s++) {
      const lessons = sections[s].lessons ?? [];
      for (let l = 0; l < lessons.length; l++) {
        const key = `${s}-${l}`;
        if (lessonsMap[key]) continue;
        // eslint-disable-next-line no-await-in-loop
        await genLesson.mutateAsync({ section_idx: s, lesson_idx: l });
      }
    }
  }

  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-extrabold text-neutral-900 dark:text-white">
            Génération du contenu ({generatedCount}/{totalLessons})
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            Générez chaque leçon individuellement ou tout d'un coup.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={generateAll}
            disabled={genLesson.isPending || generatedCount === totalLessons}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/20 text-primary-800 dark:text-primary-200 text-sm font-semibold hover:bg-primary-100 transition disabled:opacity-60"
          >
            {genLesson.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Wand2 className="w-4 h-4" />
            )}
            Tout générer
          </button>
        </div>
      </div>

      <ul className="space-y-3">
        {sections.map((section, sIdx) => (
          <li key={sIdx} className="rounded-xl border border-neutral-100 dark:border-neutral-800 p-3">
            <p className="text-sm font-bold text-neutral-900 dark:text-white mb-2">
              {sIdx + 1}. {section.title}
            </p>
            <ul className="space-y-2">
              {(section.lessons ?? []).map((lesson, lIdx) => {
                const key = `${sIdx}-${lIdx}`;
                const content = lessonsMap[key];
                const isPending =
                  genLesson.isPending &&
                  genLesson.variables?.section_idx === sIdx &&
                  genLesson.variables?.lesson_idx === lIdx;
                return (
                  <li
                    key={lIdx}
                    className="flex items-start gap-2 text-sm p-2 rounded-lg bg-neutral-50 dark:bg-neutral-800/40"
                  >
                    <span className="text-xs text-neutral-400 w-10 shrink-0">
                      {sIdx + 1}.{lIdx + 1}
                    </span>
                    <span className="flex-1 text-neutral-800 dark:text-neutral-200">
                      {lesson.title}
                    </span>
                    {content ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-semibold">
                        <Check className="w-3.5 h-3.5" />
                        Généré
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          genLesson.mutate({ section_idx: sIdx, lesson_idx: lIdx })
                        }
                        disabled={genLesson.isPending}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold transition disabled:opacity-60"
                      >
                        {isPending ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5" />
                        )}
                        Générer
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between pt-2 border-t border-neutral-100 dark:border-neutral-800">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition"
        >
          <ArrowLeft className="w-4 h-4" /> Retour
        </button>
        <button
          type="button"
          onClick={onNext}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold transition"
        >
          Suivant <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Étape 4 — Quiz
// ─────────────────────────────────────────────────────────────

function StepQuiz({
  generation,
  onNext,
  onBack,
}: {
  generation: ReturnType<typeof useAICourseGeneration>['data'];
  onNext: () => void;
  onBack: () => void;
}) {
  const genId = generation!.id;
  const gen = useGenerateQuiz(genId);
  const plan = generation!.plan || {};
  const quizzesMap = generation!.quizzes?.quizzes || {};
  const sections = plan.sections || [];

  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-5 space-y-4">
      <div>
        <h2 className="text-lg font-extrabold text-neutral-900 dark:text-white">
          Génération des quiz de section
        </h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
          Un quiz par section pour valider les acquis.
        </p>
      </div>

      <ul className="space-y-3">
        {sections.map((section, sIdx) => {
          const q = quizzesMap[String(sIdx)];
          return (
            <li key={sIdx} className="rounded-xl border border-neutral-100 dark:border-neutral-800 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-neutral-900 dark:text-white">
                  {sIdx + 1}. {section.title}
                </p>
                <button
                  type="button"
                  onClick={() => gen.mutate({ section_idx: sIdx })}
                  disabled={gen.isPending}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold transition disabled:opacity-60"
                >
                  {gen.isPending && gen.variables?.section_idx === sIdx ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  {q ? 'Régénérer' : 'Générer quiz'}
                </button>
              </div>
              {q && (
                <ul className="mt-2 space-y-1 text-xs text-neutral-700 dark:text-neutral-300">
                  {q.questions.slice(0, 4).map((question, i) => (
                    <li key={i} className="pl-3 border-l border-primary-300">
                      <span className="font-semibold">Q{i + 1}.</span>{' '}
                      {question.prompt}
                      <span className="ml-2 text-[10px] text-neutral-400">
                        {question.type} · {question.difficulty || 'MEDIUM'}
                      </span>
                    </li>
                  ))}
                  {q.questions.length > 4 && (
                    <li className="pl-3 text-[11px] italic text-neutral-500">
                      +{q.questions.length - 4} autre(s) question(s)…
                    </li>
                  )}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-between pt-2 border-t border-neutral-100 dark:border-neutral-800">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition"
        >
          <ArrowLeft className="w-4 h-4" /> Retour
        </button>
        <button
          type="button"
          onClick={onNext}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold transition"
        >
          Suivant <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Étape 5 — Certification
// ─────────────────────────────────────────────────────────────

function StepCertification({
  generation,
  onNext,
  onBack,
}: {
  generation: ReturnType<typeof useAICourseGeneration>['data'];
  onNext: () => void;
  onBack: () => void;
}) {
  const genId = generation!.id;
  const gen = useRecommendCertification(genId);
  const patch = usePatchAICourseGeneration(genId);
  const cert = generation!.certification || {};

  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-extrabold text-neutral-900 dark:text-white">
            Certification recommandée
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            L'IA propose un mode de certification. Vous restez libre de choisir.
          </p>
        </div>
        <button
          type="button"
          onClick={() => gen.mutate()}
          disabled={gen.isPending}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/20 text-primary-800 dark:text-primary-200 text-sm font-semibold hover:bg-primary-100 transition disabled:opacity-60"
        >
          {gen.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          {cert.recommended_mode ? 'Régénérer la recommandation' : 'Obtenir une recommandation'}
        </button>
      </div>

      {cert.recommended_mode && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Award className="w-5 h-5 text-amber-600" />
            <p className="text-sm font-extrabold text-amber-900 dark:text-amber-200">
              {cert.recommended_mode}
            </p>
          </div>
          <p className="text-sm text-amber-800 dark:text-amber-300">
            {cert.reasoning}
          </p>
          {typeof cert.score_min === 'number' && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
              Score minimum requis suggéré :{' '}
              <strong>{cert.score_min}%</strong>
            </p>
          )}
        </div>
      )}

      <div>
        <label className="text-[11px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
          Choix retenu
        </label>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
          {(['PARTICIPATION', 'COURSE_CERTIFICATE', 'CERTIFICATE'] as const).map(
            (mode) => {
              const active = cert.recommended_mode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() =>
                    patch.mutate({
                      certification: { ...cert, recommended_mode: mode },
                    })
                  }
                  className={
                    'px-3 py-2 rounded-xl text-sm font-semibold border transition text-left ' +
                    (active
                      ? 'bg-primary-600 border-primary-600 text-white'
                      : 'bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:border-primary-400')
                  }
                >
                  {mode}
                </button>
              );
            },
          )}
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-neutral-100 dark:border-neutral-800">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition"
        >
          <ArrowLeft className="w-4 h-4" /> Retour
        </button>
        <button
          type="button"
          onClick={onNext}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold transition"
        >
          Suivant <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Étape 6 — Validation & finalisation
// ─────────────────────────────────────────────────────────────

function StepReview({
  generation,
  onBack,
}: {
  generation: ReturnType<typeof useAICourseGeneration>['data'];
  onBack: () => void;
}) {
  const genId = generation!.id;
  const finalize = useFinalizeCourseGeneration(genId);
  const nav = useNavigate();
  const plan = generation!.plan || {};
  const lessonsCount = Object.keys(generation!.lessons_content?.lessons || {}).length;
  const quizzesCount = Object.keys(generation!.quizzes?.quizzes || {}).length;
  const totalLessons =
    plan.sections?.reduce((n, s) => n + (s.lessons?.length || 0), 0) || 0;

  async function handleFinalize() {
    const res = await finalize.mutateAsync();
    if (res.course_id) {
      nav(`/instructor/courses/${res.course_id}/edit`);
    }
  }

  const isDone = generation!.status === 'FINALIZED';

  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-5 space-y-4">
      <div>
        <h2 className="text-lg font-extrabold text-neutral-900 dark:text-white">
          Récapitulatif avant publication
        </h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
          Le cours sera créé en <strong>brouillon</strong>. Aucun apprenant
          n'y aura accès tant que vous ne l'aurez pas publié manuellement.
        </p>
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <Meta label="Sections">{plan.sections?.length ?? 0}</Meta>
        <Meta label="Leçons générées">
          {lessonsCount}/{totalLessons}
        </Meta>
        <Meta label="Quiz">{quizzesCount}</Meta>
        <Meta label="Certification">
          {generation!.certification?.recommended_mode || '—'}
        </Meta>
      </dl>

      {isDone && generation!.finalized_course_id ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-800 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Check className="w-5 h-5 text-emerald-600" />
            <p className="text-sm font-extrabold text-emerald-900 dark:text-emerald-200">
              Cours créé en brouillon
            </p>
          </div>
          <p className="text-sm text-emerald-800 dark:text-emerald-300">
            Vous pouvez maintenant l'affiner, ajouter des médias, puis le
            publier depuis l'éditeur.
          </p>
          <button
            type="button"
            onClick={() =>
              nav(`/instructor/courses/${generation!.finalized_course_id}/edit`)
            }
            className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition"
          >
            Ouvrir dans l'éditeur <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between pt-2 border-t border-neutral-100 dark:border-neutral-800">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition"
          >
            <ArrowLeft className="w-4 h-4" /> Retour
          </button>
          <button
            type="button"
            onClick={handleFinalize}
            disabled={finalize.isPending}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md transition disabled:opacity-60"
          >
            {finalize.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            Créer le cours en brouillon
          </button>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
        {label}
      </span>
      {children}
    </label>
  );
}
