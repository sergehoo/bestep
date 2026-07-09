/**
 * CourseQuizzesTab.tsx — Onglet Quiz de l'éditeur cours (R19.3).
 *
 * Liste tous les quiz du cours + bouton « Ajouter un quiz ».
 * L'édition passe par la page dédiée /instructor/courses/:cid/quizzes/:qid.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus,
  HelpCircle,
  Layers,
  Award,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { useCourseQuizzes, useCreateQuiz } from '@/hooks/quiz';
import { useInstructorSections } from '@/hooks/instructor';
import { extractApiError } from '@/lib/utils';

interface Props {
  courseId: number | string;
}

export function CourseQuizzesTab({ courseId }: Props) {
  const navigate = useNavigate();
  const { data: quizzes, isLoading } = useCourseQuizzes(courseId);
  const { data: sections = [] } = useInstructorSections(courseId);
  const create = useCreateQuiz();

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [sectionId, setSectionId] = useState<string>('');
  const [err, setErr] = useState<string | null>(null);

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!title.trim()) return;
    try {
      const created = await create.mutateAsync({
        course_id: Number(courseId),
        title: title.trim(),
        section_id: sectionId ? Number(sectionId) : null,
      });
      navigate(`/instructor/courses/${courseId}/quizzes/${created.id}`);
    } catch (e) {
      setErr(extractApiError(e));
    }
  };

  return (
    <div className="space-y-4">
      {/* Encart pédago */}
      <div className="rounded-2xl border border-primary-100 bg-primary-50/50 p-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary-100 text-primary-700 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="text-sm text-neutral-700">
            <p className="font-bold text-neutral-900">Quiz pédagogiques</p>
            <p className="mt-0.5 text-xs">
              Ajoutez un quiz à la fin d'une section pour vérifier la
              compréhension, ou un quiz final au niveau du cours pour
              déclencher le certificat.
            </p>
          </div>
        </div>
      </div>

      {/* Formulaire d'ajout */}
      {showForm ? (
        <form
          onSubmit={submitCreate}
          className="border-2 border-primary-200 bg-white rounded-2xl p-4 space-y-3"
        >
          <p className="font-bold text-sm">Nouveau quiz</p>
          <Input
            label="Titre"
            required
            placeholder="Ex : Quiz — Module 1"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div>
            <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wide mb-1.5">
              Rattacher à une section (optionnel)
            </label>
            <select
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
              className="w-full border border-neutral-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-4 focus:ring-primary-200/60"
            >
              <option value="">— Fin de cours —</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  Section {s.order} — {s.title}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-neutral-500">
              Un quiz de section se déclenche automatiquement à la fin de la
              section pour l'apprenant.
            </p>
          </div>
          {err && (
            <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              {err}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowForm(false);
                setTitle('');
                setSectionId('');
                setErr(null);
              }}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={create.isPending}
              disabled={!title.trim()}
            >
              <Plus className="w-3.5 h-3.5" />
              Créer et éditer
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="primary" onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4" />
          Ajouter un quiz
        </Button>
      )}

      {/* Liste */}
      {isLoading && !quizzes ? (
        <div className="py-8 flex justify-center">
          <Spinner label="Chargement des quiz…" />
        </div>
      ) : (quizzes ?? []).length === 0 ? (
        <Card>
          <CardBody className="text-center py-8">
            <HelpCircle className="w-8 h-8 text-neutral-300 mx-auto" />
            <p className="mt-2 text-sm text-neutral-500">
              Aucun quiz pour ce cours.
            </p>
          </CardBody>
        </Card>
      ) : (
        <ul className="space-y-2">
          {(quizzes ?? []).map((q) => (
            <li key={q.id}>
              <Link
                to={`/instructor/courses/${courseId}/quizzes/${q.id}`}
                className="block bg-white border border-neutral-100 rounded-2xl p-4 hover:border-primary-200 hover:shadow-soft transition"
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-neutral-900 truncate">
                        {q.title}
                      </p>
                      {q.is_active ? (
                        <Badge variant="success" size="xs">
                          Actif
                        </Badge>
                      ) : (
                        <Badge variant="neutral" size="xs">
                          Désactivé
                        </Badge>
                      )}
                      {q.questions_count === 0 && (
                        <Badge variant="warning" size="xs">
                          Sans question
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-neutral-500 flex-wrap">
                      {q.section_id ? (
                        <span className="inline-flex items-center gap-1">
                          <Layers className="w-3 h-3" />
                          {q.section_title}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <Award className="w-3 h-3" />
                          Fin de cours
                        </span>
                      )}
                      <span>{q.questions_count} question(s)</span>
                      <span>Seuil : {q.passing_score}%</span>
                      <span>{q.max_attempts} tentative(s)</span>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-neutral-400 shrink-0" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
