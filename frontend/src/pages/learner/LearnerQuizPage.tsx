/**
 * LearnerQuizPage.tsx — Passage d'un quiz de section (R19.4).
 *
 * Route : /learn/courses/:cid/sections/:sid/quiz
 *
 * Flow :
 *  1. GET /learner/courses/:cid/sections/:sid/quiz/ → payload questions
 *  2. Sélection d'une réponse par question (radios)
 *  3. Bouton "Soumettre" → POST /submit/ → score + passed
 *  4. Affichage résultat avec badge succès/échec + option "Recommencer"
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Send,
  Trophy,
  XCircle,
  CheckCircle2,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { LearnerShell } from '@/components/learner/LearnerShell';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/premium/ProgressBar';
import {
  useLearnerSectionQuiz,
  useSubmitSectionQuiz,
  type QuizSubmitResult,
} from '@/hooks/quiz';
import { extractApiError, cn } from '@/lib/utils';

export default function LearnerQuizPage() {
  const { cid, sid } = useParams<{ cid: string; sid: string }>();
  const navigate = useNavigate();
  const courseId = cid ? Number(cid) : undefined;
  const sectionId = sid ? Number(sid) : undefined;

  const { data: quiz, isLoading, error } = useLearnerSectionQuiz(
    courseId,
    sectionId,
  );
  const submit = useSubmitSectionQuiz(courseId ?? 0, sectionId ?? 0);

  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<QuizSubmitResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const totalQuestions = quiz?.questions?.length ?? 0;
  const answeredCount = Object.keys(answers).length;
  const canSubmit =
    totalQuestions > 0 && answeredCount === totalQuestions && !submit.isPending;

  const handleSelect = (questionId: number, choiceId: number) => {
    setAnswers((prev) => ({ ...prev, [questionId]: choiceId }));
  };

  const handleSubmit = async () => {
    if (!quiz) return;
    setErr(null);
    try {
      const payload = quiz.questions.map((q) => ({
        question_id: q.id,
        choice_id: answers[q.id] ?? null,
      }));
      const res = await submit.mutateAsync(payload);
      setResult(res);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setErr(extractApiError(e, 'Erreur lors de la soumission.'));
    }
  };

  const handleRetry = () => {
    setResult(null);
    setAnswers({});
    setErr(null);
  };

  // Notice sur les tentatives restantes (avant/pendant soumission)
  const attemptsRemaining = useMemo(() => {
    if (!quiz) return null;
    const done = result ? result.attempts_count : quiz.attempts_count;
    return Math.max(0, quiz.max_attempts - done);
  }, [quiz, result]);

  return (
    <LearnerShell
      title={quiz?.title || 'Quiz'}
      subtitle={
        quiz
          ? `Seuil de réussite : ${quiz.passing_score}% · ${attemptsRemaining} tentative(s) restante(s)`
          : undefined
      }
      actions={
        courseId ? (
          <Link
            to={`/learn/courses/${courseId}/player`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-neutral-200 hover:bg-neutral-50"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Retour au cours
          </Link>
        ) : undefined
      }
    >
      {isLoading && !quiz ? (
        <div className="py-20 flex justify-center">
          <Spinner size="xl" label="Chargement du quiz…" />
        </div>
      ) : error || !quiz ? (
        <Card>
          <CardBody className="text-center py-10">
            <p className="text-lg font-bold text-neutral-900">
              Aucun quiz disponible
            </p>
            <p className="mt-1 text-sm text-neutral-500">
              Cette section n'a pas encore de quiz, ou vous n'êtes pas inscrit·e
              à ce cours.
            </p>
            <button
              onClick={() => navigate(-1)}
              className="mt-4 text-sm text-primary-600 hover:text-primary-700 font-semibold"
            >
              ← Retour
            </button>
          </CardBody>
        </Card>
      ) : result ? (
        <ResultView
          result={result}
          quizTitle={quiz.title}
          onRetry={handleRetry}
          canRetry={attemptsRemaining !== null && attemptsRemaining > 0}
          courseId={courseId ?? 0}
        />
      ) : (
        <div className="space-y-4">
          {/* Barre progression */}
          <Card>
            <CardBody>
              <ProgressBar
                value={(answeredCount / Math.max(1, totalQuestions)) * 100}
                showValue={false}
                label={`${answeredCount} / ${totalQuestions} question(s) répondues`}
                size="sm"
                color="primary"
              />
            </CardBody>
          </Card>

          {/* Questions */}
          <ol className="space-y-3">
            {quiz.questions.map((q, idx) => (
              <li key={q.id}>
                <Card>
                  <CardBody>
                    <p className="text-xs font-bold text-neutral-400">
                      Question {idx + 1} / {totalQuestions}
                    </p>
                    <p className="mt-1 text-base font-bold text-neutral-900">
                      {q.prompt}
                    </p>
                    <ul className="mt-3 space-y-2">
                      {q.choices.map((c) => {
                        const selected = answers[q.id] === c.id;
                        return (
                          <li key={c.id}>
                            <label
                              className={cn(
                                'flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition',
                                selected
                                  ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-200/60'
                                  : 'border-neutral-200 hover:bg-neutral-50',
                              )}
                            >
                              <input
                                type="radio"
                                name={`q-${q.id}`}
                                checked={selected}
                                onChange={() => handleSelect(q.id, c.id)}
                                className="accent-primary-600"
                              />
                              <span className="flex-1 text-sm text-neutral-800">
                                {c.text}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </CardBody>
                </Card>
              </li>
            ))}
          </ol>

          {err && (
            <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
              {err}
            </p>
          )}

          <div className="flex flex-wrap justify-between items-center gap-3">
            <p className="text-xs text-neutral-500">
              Assurez-vous d'avoir répondu à toutes les questions avant de
              soumettre.
            </p>
            <Button
              variant="primary"
              size="lg"
              onClick={handleSubmit}
              loading={submit.isPending}
              disabled={!canSubmit}
            >
              <Send className="w-4 h-4" />
              Soumettre le quiz
            </Button>
          </div>
        </div>
      )}
    </LearnerShell>
  );
}

// ─────────────────────────────────────────────────────────────
// ResultView
// ─────────────────────────────────────────────────────────────

function ResultView({
  result,
  quizTitle,
  onRetry,
  canRetry,
  courseId,
}: {
  result: QuizSubmitResult;
  quizTitle: string;
  onRetry: () => void;
  canRetry: boolean;
  courseId: number;
}) {
  const passed = result.passed;
  const percent = result.score_percent;
  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <div
          className={
            passed
              ? 'p-6 sm:p-8 text-center bg-gradient-to-br from-emerald-500 to-emerald-700 text-white'
              : 'p-6 sm:p-8 text-center bg-gradient-to-br from-rose-500 to-rose-700 text-white'
          }
        >
          <div className="w-16 h-16 mx-auto rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
            {passed ? (
              <Trophy className="w-8 h-8" />
            ) : (
              <XCircle className="w-8 h-8" />
            )}
          </div>
          <p className="mt-4 text-xs font-bold uppercase tracking-widest opacity-90">
            {passed ? 'Bravo !' : 'Ressayez'}
          </p>
          <h2 className="mt-1 text-3xl font-extrabold">
            Score : {percent}%
          </h2>
          <p className="mt-2 text-sm opacity-90">
            {passed
              ? `Vous avez validé « ${quizTitle} » avec succès.`
              : `Seuil requis : ${result.passing_score}%. Vous y êtes presque !`}
          </p>
          <div className="mt-4 flex items-center justify-center gap-2 text-xs opacity-80">
            <Badge variant={passed ? 'success' : 'danger'} size="sm">
              {passed ? 'Réussi' : 'Échec'}
            </Badge>
            <span>
              {result.correct_answers} / {result.total_questions} bonnes réponses
            </span>
          </div>
        </div>
        <CardBody>
          <dl className="grid grid-cols-3 gap-3 text-center">
            <div>
              <dt className="text-[11px] text-neutral-500 uppercase">Score</dt>
              <dd className="text-lg font-extrabold text-neutral-900">
                {percent}%
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-neutral-500 uppercase">Seuil</dt>
              <dd className="text-lg font-extrabold text-neutral-900">
                {result.passing_score}%
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-neutral-500 uppercase">
                Tentatives
              </dt>
              <dd className="text-lg font-extrabold text-neutral-900">
                {result.attempts_count} / {result.max_attempts}
              </dd>
            </div>
          </dl>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {!passed && canRetry && (
              <Button variant="primary" onClick={onRetry}>
                <RotateCcw className="w-4 h-4" />
                Recommencer
              </Button>
            )}
            <Link
              to={`/learn/courses/${courseId}/player`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border border-neutral-200 hover:bg-neutral-50"
            >
              <ArrowLeft className="w-4 h-4" />
              Retour au cours
            </Link>
            {passed && (
              <div className="w-full mt-3 text-xs text-neutral-500 inline-flex items-center justify-center gap-1.5">
                <Sparkles className="w-3 h-3 text-accent-500" />
                Progression enregistrée dans votre dashboard.
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              </div>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
