/**
 * LearnerGoalsPage.tsx — Gestion des objectifs (R12.4).
 *
 * MVP : persistance localStorage (`be-learner-goals`). Backend R13 :
 * modèle Goal + endpoints CRUD /api/learner/goals/.
 */
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Target, Save, Trash2, Plus } from 'lucide-react';
import { LearnerShell } from '@/components/learner/LearnerShell';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ProgressBar } from '@/components/premium/ProgressBar';
import { useStudentDashboard } from '@/hooks/queries';
import { computeMinutesThisWeek } from '@/lib/learner-stats';

interface Goal {
  id: string;
  label: string;
  targetHoursWeek: number;
  targetCourses: number;
  deadline: string; // ISO date
}

const STORAGE_KEY = 'be-learner-goals';

function loadGoals(): Goal[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_GOALS;
    return JSON.parse(raw) as Goal[];
  } catch {
    return DEFAULT_GOALS;
  }
}

const DEFAULT_GOALS: Goal[] = [
  {
    id: 'g-1',
    label: 'Rythme hebdomadaire',
    targetHoursWeek: 5,
    targetCourses: 0,
    deadline: new Date(Date.now() + 30 * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10),
  },
];

export default function LearnerGoalsPage() {
  const { data } = useStudentDashboard('30d');
  const [goals, setGoals] = useState<Goal[]>(() => loadGoals());
  const [label, setLabel] = useState('');
  const [hours, setHours] = useState('5');
  const [courses, setCourses] = useState('1');
  const [deadline, setDeadline] = useState(
    new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10),
  );

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(goals));
    } catch {
      /* ignore quota */
    }
  }, [goals]);

  const minutesThisWeek = computeMinutesThisWeek(
    data?.series?.activity_minutes_per_day,
  );
  const hoursThisWeek = minutesThisWeek / 60;
  const completed = data?.kpis?.completed ?? 0;

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    setGoals((all) => [
      ...all,
      {
        id: `g-${Date.now()}`,
        label: label.trim(),
        targetHoursWeek: Number(hours) || 0,
        targetCourses: Number(courses) || 0,
        deadline,
      },
    ]);
    setLabel('');
  };

  const remove = (id: string) => {
    setGoals((all) => all.filter((g) => g.id !== id));
  };

  return (
    <LearnerShell
      title="Mes objectifs"
      subtitle="Définissez votre rythme et suivez votre avancement."
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <div className="space-y-4">
          {goals.length === 0 ? (
            <Card>
              <CardBody className="text-center py-10">
                <Target className="w-10 h-10 text-neutral-300 mx-auto" />
                <p className="mt-3 text-lg font-bold text-neutral-900">
                  Aucun objectif défini
                </p>
                <p className="mt-1 text-sm text-neutral-500">
                  Créez votre premier objectif pour vous motiver.
                </p>
              </CardBody>
            </Card>
          ) : (
            goals.map((g) => {
              const hoursPct = g.targetHoursWeek
                ? Math.min(
                    100,
                    Math.round((hoursThisWeek / g.targetHoursWeek) * 100),
                  )
                : 0;
              const coursePct = g.targetCourses
                ? Math.min(
                    100,
                    Math.round((completed / g.targetCourses) * 100),
                  )
                : 0;
              return (
                <motion.div
                  key={g.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <Card>
                    <CardHeader
                      title={g.label}
                      subtitle={`Échéance : ${new Date(g.deadline).toLocaleDateString('fr-FR')}`}
                      actions={
                        <button
                          onClick={() => remove(g.id)}
                          className="p-2 rounded-lg text-rose-500 hover:bg-rose-50"
                          aria-label="Supprimer l'objectif"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      }
                    />
                    <CardBody className="space-y-3">
                      {g.targetHoursWeek > 0 && (
                        <ProgressBar
                          value={hoursPct}
                          showValue
                          label={`${hoursThisWeek.toFixed(1)}h / ${g.targetHoursWeek}h par semaine`}
                          size="md"
                          color="primary"
                        />
                      )}
                      {g.targetCourses > 0 && (
                        <ProgressBar
                          value={coursePct}
                          showValue
                          label={`${completed} / ${g.targetCourses} cours terminés`}
                          size="md"
                          color="success"
                        />
                      )}
                    </CardBody>
                  </Card>
                </motion.div>
              );
            })
          )}
        </div>

        {/* Ajout */}
        <Card>
          <CardHeader
            title="Créer un objectif"
            subtitle="Fixez-vous un cap concret et atteignable."
          />
          <CardBody>
            <form onSubmit={add} className="space-y-3">
              <Input
                label="Nom de l'objectif"
                placeholder="Ex : Devenir expert bourse"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                required
              />
              <Input
                type="number"
                label="Heures par semaine"
                min={0}
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
              <Input
                type="number"
                label="Cours à terminer"
                min={0}
                value={courses}
                onChange={(e) => setCourses(e.target.value)}
              />
              <Input
                type="date"
                label="Échéance"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
              <Button type="submit" variant="primary" fullWidth>
                <Plus className="w-4 h-4" />
                Ajouter l'objectif
              </Button>
              <p className="text-[11px] text-neutral-400 pt-2 border-t border-neutral-100">
                <Save className="inline w-3 h-3 mr-1" />
                Enregistré localement — sync backend dispo en R13.
              </p>
            </form>
          </CardBody>
        </Card>
      </div>
    </LearnerShell>
  );
}
