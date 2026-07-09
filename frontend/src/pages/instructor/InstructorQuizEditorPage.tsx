/**
 * InstructorQuizEditorPage.tsx — Éditeur complet d'un quiz (R19.3).
 *
 * Route : /instructor/courses/:cid/quizzes/:qid
 *
 * Features :
 *  - Métadonnées quiz (titre, score min, tentatives, section, actif)
 *  - Liste des questions avec édition inline
 *  - Créer / modifier / supprimer une question + ses choix
 *  - Validation publication (min 1 question, ≥ 2 choix, ≥ 1 bonne réponse)
 *  - Preview apprenant (lien vers /learn/... si le cours est publié)
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Save,
  Trash2,
  Check,
  X,
  Edit3,
  Sparkles,
  AlertTriangle,
  Eye,
} from 'lucide-react';
import { InstructorShell } from '@/components/instructor/InstructorShell';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import {
  useQuizDetail,
  useUpdateQuiz,
  useCreateQuestion,
  useUpdateQuestion,
  useDeleteQuestion,
  type CreateQuestionPayload,
  type QuizQuestionInstructor,
} from '@/hooks/quiz';
import { useInstructorCourseDetail, useInstructorSections } from '@/hooks/instructor';
import { extractApiError, cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────
// Validation publication
// ─────────────────────────────────────────────────────────────

interface PublishIssue {
  code: string;
  msg: string;
}

function validateQuiz(
  quiz: ReturnType<typeof useQuizDetail>['data'],
): PublishIssue[] {
  if (!quiz) return [];
  const issues: PublishIssue[] = [];
  if (!quiz.title.trim()) issues.push({ code: 'no-title', msg: 'Titre manquant.' });
  if (quiz.passing_score < 1 || quiz.passing_score > 100) {
    issues.push({
      code: 'invalid-score',
      msg: 'Score minimum doit être entre 1 et 100.',
    });
  }
  if (!quiz.section_id) {
    issues.push({
      code: 'no-attachment',
      msg: 'Quiz non rattaché à une section.',
    });
  }
  if (quiz.questions.length === 0) {
    issues.push({
      code: 'no-questions',
      msg: 'Ajoutez au moins une question.',
    });
  }
  for (const q of quiz.questions) {
    if (q.choices.length < 2) {
      issues.push({
        code: 'choices-too-few',
        msg: `« ${q.prompt.slice(0, 30)}… » : au moins 2 choix requis.`,
      });
    }
    if (!q.choices.some((c) => c.is_correct)) {
      issues.push({
        code: 'no-correct',
        msg: `« ${q.prompt.slice(0, 30)}… » : aucune bonne réponse cochée.`,
      });
    }
  }
  return issues;
}

// ─────────────────────────────────────────────────────────────

export default function InstructorQuizEditorPage() {
  const { cid, qid } = useParams<{ cid: string; qid: string }>();
  const courseId = cid ? Number(cid) : undefined;
  const quizId = qid ? Number(qid) : undefined;
  const navigate = useNavigate();

  const { data: course } = useInstructorCourseDetail(courseId);
  const { data: sections } = useInstructorSections(courseId);
  const { data: quiz, isLoading } = useQuizDetail(quizId);
  const updateQuiz = useUpdateQuiz(quizId ?? 0);
  const [flash, setFlash] = useState<
    { kind: 'ok' | 'err'; msg: string } | null
  >(null);

  // Métadonnées form
  const [title, setTitle] = useState('');
  const [passingScore, setPassingScore] = useState(70);
  const [maxAttempts, setMaxAttempts] = useState(3);
  const [sectionId, setSectionId] = useState<number | null>(null);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (quiz) {
      setTitle(quiz.title);
      setPassingScore(quiz.passing_score);
      setMaxAttempts(quiz.max_attempts);
      setSectionId(quiz.section_id);
      setIsActive(quiz.is_active);
    }
  }, [quiz?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveQuiz = async () => {
    setFlash(null);
    try {
      await updateQuiz.mutateAsync({
        title,
        passing_score: passingScore,
        max_attempts: maxAttempts,
        section_id: sectionId,
        is_active: isActive,
      });
      setFlash({ kind: 'ok', msg: 'Quiz enregistré.' });
      setTimeout(() => setFlash(null), 2500);
    } catch (e) {
      setFlash({ kind: 'err', msg: extractApiError(e) });
    }
  };

  const issues = validateQuiz(quiz);
  const canPublish = issues.length === 0;

  return (
    <InstructorShell
      title={quiz?.title || 'Quiz'}
      subtitle={
        course
          ? `${course.title}${quiz?.section_title ? ` · ${quiz.section_title}` : ''}`
          : undefined
      }
      actions={
        <>
          <Link
            to={`/instructor/courses/${courseId}/edit`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-neutral-200 hover:bg-neutral-50"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Programme
          </Link>
        </>
      }
    >
      {isLoading && !quiz ? (
        <div className="py-20 flex justify-center">
          <Spinner size="xl" label="Chargement du quiz…" />
        </div>
      ) : !quiz ? (
        <Card>
          <CardBody className="text-center py-10">
            <p className="text-lg font-bold">Quiz introuvable</p>
            <button
              onClick={() => navigate(-1)}
              className="mt-3 text-sm text-primary-600 hover:text-primary-700"
            >
              ← Retour
            </button>
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          {/* Colonne principale */}
          <div className="space-y-6 min-w-0">
            {/* Métadonnées */}
            <Card>
              <CardHeader
                title="Configuration du quiz"
                subtitle="Titre, section, seuil de réussite, tentatives"
              />
              <CardBody className="space-y-4">
                <Input
                  label="Titre du quiz"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
                <div className="grid sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wide mb-1.5">
                      Section
                    </label>
                    <select
                      value={sectionId ?? ''}
                      onChange={(e) =>
                        setSectionId(e.target.value ? Number(e.target.value) : null)
                      }
                      className="w-full border border-neutral-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-4 focus:ring-primary-200/60"
                    >
                      <option value="">— Aucune (fin de cours) —</option>
                      {(sections ?? []).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.order}. {s.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Input
                    type="number"
                    label="Score minimum (%)"
                    min={1}
                    max={100}
                    value={passingScore}
                    onChange={(e) =>
                      setPassingScore(Number(e.target.value) || 70)
                    }
                  />
                  <Input
                    type="number"
                    label="Tentatives max"
                    min={1}
                    value={maxAttempts}
                    onChange={(e) => setMaxAttempts(Number(e.target.value) || 3)}
                  />
                </div>
                <label className="flex items-start gap-2 p-3 rounded-xl border border-neutral-100">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="mt-0.5 accent-primary-600"
                  />
                  <div>
                    <p className="text-sm font-semibold">Quiz actif</p>
                    <p className="text-[11px] text-neutral-500">
                      Décochez pour désactiver temporairement le quiz sans le
                      supprimer.
                    </p>
                  </div>
                </label>

                {flash && (
                  <p
                    className={
                      flash.kind === 'ok'
                        ? 'text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2'
                        : 'text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2'
                    }
                  >
                    {flash.msg}
                  </p>
                )}

                <div className="flex justify-end">
                  <Button
                    variant="primary"
                    onClick={saveQuiz}
                    loading={updateQuiz.isPending}
                  >
                    <Save className="w-4 h-4" />
                    Enregistrer la configuration
                  </Button>
                </div>
              </CardBody>
            </Card>

            {/* Questions */}
            <Card>
              <CardHeader
                title={`Questions (${quiz.questions.length})`}
                subtitle="Ajoutez, modifiez et réordonnez les questions"
              />
              <CardBody>
                <QuestionsSection quiz={quiz} />
              </CardBody>
            </Card>
          </div>

          {/* Sidebar validation */}
          <aside className="lg:sticky lg:top-24 self-start space-y-3">
            <Card>
              <CardHeader
                title="État de publication"
                actions={
                  canPublish ? (
                    <Sparkles
                      className="w-5 h-5 text-emerald-500"
                      aria-hidden
                    />
                  ) : (
                    <AlertTriangle
                      className="w-5 h-5 text-amber-500"
                      aria-hidden
                    />
                  )
                }
              />
              <CardBody>
                {canPublish ? (
                  <div className="text-center">
                    <Badge variant="success" size="md">
                      ✓ Prêt à être publié
                    </Badge>
                    <p className="mt-3 text-xs text-neutral-500">
                      Toutes les règles de publication sont satisfaites.
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-bold text-amber-700 mb-2">
                      {issues.length} point{issues.length > 1 ? 's' : ''} à
                      corriger
                    </p>
                    <ul className="space-y-1.5 text-xs text-neutral-700">
                      {issues.map((i, idx) => (
                        <li
                          key={idx}
                          className="flex items-start gap-1.5"
                        >
                          <AlertTriangle className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" />
                          <span>{i.msg}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Aperçu apprenant" />
              <CardBody>
                {course && quiz.section_id ? (
                  <Link
                    to={`/courses/${course.slug}`}
                    target="_blank"
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border border-neutral-200 hover:bg-neutral-50"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Voir la fiche cours
                  </Link>
                ) : (
                  <p className="text-xs text-neutral-500">
                    Rattachez le quiz à une section pour prévisualiser.
                  </p>
                )}
              </CardBody>
            </Card>
          </aside>
        </div>
      )}
    </InstructorShell>
  );
}

// ─────────────────────────────────────────────────────────────
// QuestionsSection
// ─────────────────────────────────────────────────────────────

function QuestionsSection({ quiz }: { quiz: NonNullable<ReturnType<typeof useQuizDetail>['data']> }) {
  const [showForm, setShowForm] = useState(false);
  return (
    <div className="space-y-3">
      {quiz.questions.length === 0 ? (
        <p className="text-sm text-neutral-500 text-center py-6">
          Aucune question pour l'instant. Cliquez sur « Ajouter une question »
          pour démarrer.
        </p>
      ) : (
        <ul className="space-y-3">
          {quiz.questions
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((q) => (
              <li key={q.id}>
                <QuestionCard quizId={quiz.id} question={q} />
              </li>
            ))}
        </ul>
      )}

      {showForm ? (
        <NewQuestionForm
          quizId={quiz.id}
          nextOrder={quiz.questions.length + 1}
          onDone={() => setShowForm(false)}
        />
      ) : (
        <Button
          variant="primary"
          onClick={() => setShowForm(true)}
        >
          <Plus className="w-4 h-4" />
          Ajouter une question
        </Button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// QuestionCard (vue synthèse + édition)
// ─────────────────────────────────────────────────────────────

function QuestionCard({
  quizId,
  question,
}: {
  quizId: number;
  question: QuizQuestionInstructor;
}) {
  const [editing, setEditing] = useState(false);
  const deleteQ = useDeleteQuestion(quizId);
  const [confirming, setConfirming] = useState(false);

  if (editing) {
    return (
      <QuestionEditor
        quizId={quizId}
        question={question}
        onDone={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="border border-neutral-100 rounded-2xl p-4 bg-white">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-neutral-400">
            Question #{question.order}
          </p>
          <p className="mt-1 font-semibold text-neutral-900">
            {question.prompt}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setEditing(true)}
            className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500"
            aria-label="Éditer"
          >
            <Edit3 className="w-4 h-4" />
          </button>
          {confirming ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  deleteQ.mutate(question.id);
                  setConfirming(false);
                }}
                className="text-xs font-bold px-2 py-1 rounded bg-rose-600 text-white"
              >
                Confirmer
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="text-xs px-2 py-1 rounded text-neutral-500 hover:bg-neutral-100"
              >
                Annuler
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-600"
              aria-label="Supprimer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      <ul className="mt-3 space-y-1.5">
        {question.choices.map((c) => (
          <li
            key={c.id}
            className={cn(
              'flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border',
              c.is_correct
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-neutral-50 border-neutral-100 text-neutral-700',
            )}
          >
            {c.is_correct ? (
              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            ) : (
              <span className="w-3.5 h-3.5 rounded-full border border-neutral-300 shrink-0" />
            )}
            <span className="flex-1">{c.text}</span>
            {c.is_correct && (
              <Badge variant="success" size="xs">
                Correct
              </Badge>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Éditeur / créateur commun de question
// ─────────────────────────────────────────────────────────────

function QuestionEditor({
  quizId,
  question,
  onDone,
}: {
  quizId: number;
  question: QuizQuestionInstructor;
  onDone: () => void;
}) {
  const update = useUpdateQuestion(quizId);
  const [prompt, setPrompt] = useState(question.prompt);
  const [choices, setChoices] = useState(
    question.choices.map((c) => ({ text: c.text, is_correct: c.is_correct })),
  );
  const [err, setErr] = useState<string | null>(null);

  return (
    <QuestionForm
      title="Modifier la question"
      prompt={prompt}
      setPrompt={setPrompt}
      choices={choices}
      setChoices={setChoices}
      err={err}
      submitting={update.isPending}
      onCancel={onDone}
      onSubmit={async () => {
        setErr(null);
        try {
          await update.mutateAsync({
            questionId: question.id,
            payload: {
              prompt,
              order: question.order,
              choices,
            } as CreateQuestionPayload,
          });
          onDone();
        } catch (e) {
          setErr(extractApiError(e));
        }
      }}
    />
  );
}

function NewQuestionForm({
  quizId,
  nextOrder,
  onDone,
}: {
  quizId: number;
  nextOrder: number;
  onDone: () => void;
}) {
  const create = useCreateQuestion(quizId);
  const [prompt, setPrompt] = useState('');
  const [choices, setChoices] = useState<
    Array<{ text: string; is_correct: boolean }>
  >([
    { text: '', is_correct: true },
    { text: '', is_correct: false },
  ]);
  const [err, setErr] = useState<string | null>(null);

  return (
    <QuestionForm
      title="Nouvelle question"
      prompt={prompt}
      setPrompt={setPrompt}
      choices={choices}
      setChoices={setChoices}
      err={err}
      submitting={create.isPending}
      onCancel={onDone}
      onSubmit={async () => {
        setErr(null);
        try {
          await create.mutateAsync({
            prompt,
            order: nextOrder,
            choices,
          });
          onDone();
        } catch (e) {
          setErr(extractApiError(e));
        }
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────

interface QuestionFormProps {
  title: string;
  prompt: string;
  setPrompt: (v: string) => void;
  choices: Array<{ text: string; is_correct: boolean }>;
  setChoices: React.Dispatch<
    React.SetStateAction<Array<{ text: string; is_correct: boolean }>>
  >;
  err: string | null;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}

function QuestionForm({
  title,
  prompt,
  setPrompt,
  choices,
  setChoices,
  err,
  submitting,
  onCancel,
  onSubmit,
}: QuestionFormProps) {
  const canSubmit =
    prompt.trim().length > 0 &&
    choices.length >= 2 &&
    choices.every((c) => c.text.trim().length > 0) &&
    choices.some((c) => c.is_correct);

  return (
    <div className="border-2 border-primary-200 bg-primary-50/30 rounded-2xl p-4 space-y-3">
      <h3 className="font-bold text-sm">{title}</h3>
      <Textarea
        label="Énoncé"
        rows={3}
        required
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Ex : Quel est le rendement moyen d'un placement à long terme ?"
      />

      <div>
        <p className="text-xs font-bold text-neutral-700 uppercase tracking-wide mb-2">
          Choix ({choices.length}) — cochez la ou les bonnes réponses
        </p>
        <ul className="space-y-1.5">
          {choices.map((c, i) => (
            <li key={i} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={c.is_correct}
                onChange={(e) =>
                  setChoices((all) =>
                    all.map((x, j) =>
                      j === i ? { ...x, is_correct: e.target.checked } : x,
                    ),
                  )
                }
                aria-label="Bonne réponse"
                className="accent-emerald-600"
              />
              <input
                value={c.text}
                onChange={(e) =>
                  setChoices((all) =>
                    all.map((x, j) =>
                      j === i ? { ...x, text: e.target.value } : x,
                    ),
                  )
                }
                placeholder={`Choix ${i + 1}`}
                className="flex-1 border border-neutral-200 rounded-lg px-3 py-1.5 text-sm"
              />
              {choices.length > 2 && (
                <button
                  onClick={() =>
                    setChoices((all) => all.filter((_, j) => j !== i))
                  }
                  aria-label="Retirer ce choix"
                  className="p-1 rounded text-rose-500 hover:bg-rose-50"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() =>
            setChoices((all) => [...all, { text: '', is_correct: false }])
          }
          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700"
        >
          <Plus className="w-3 h-3" />
          Ajouter un choix
        </button>
      </div>

      {err && (
        <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          {err}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-2 border-t border-primary-100">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Annuler
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={onSubmit}
          loading={submitting}
          disabled={!canSubmit}
        >
          <Save className="w-3.5 h-3.5" />
          Enregistrer
        </Button>
      </div>
    </div>
  );
}
