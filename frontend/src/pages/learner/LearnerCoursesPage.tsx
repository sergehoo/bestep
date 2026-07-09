/**
 * LearnerCoursesPage.tsx — Mes formations avec 4 onglets (R12.3).
 * Onglets : En cours / Terminées / À commencer / Favoris.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BookOpen,
  CheckCircle,
  Clock,
  Heart,
  PlayCircle,
  ArrowRight,
  Search as SearchIcon,
} from 'lucide-react';
import { LearnerShell } from '@/components/learner/LearnerShell';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Input } from '@/components/ui/Input';
import { ProgressBar } from '@/components/premium/ProgressBar';
import { useLearnerEnrollments } from '@/hooks/player';
import { cn } from '@/lib/utils';

type Tab = 'ongoing' | 'completed' | 'wishlist' | 'favorites';

interface TabDef {
  id: Tab;
  label: string;
  Icon: typeof BookOpen;
  hint: string;
}

const TABS: TabDef[] = [
  { id: 'ongoing', label: 'En cours', Icon: PlayCircle, hint: 'Actifs' },
  { id: 'completed', label: 'Terminées', Icon: CheckCircle, hint: 'Bravo !' },
  { id: 'wishlist', label: 'À commencer', Icon: BookOpen, hint: 'Récent' },
  { id: 'favorites', label: 'Favoris', Icon: Heart, hint: 'Enregistrés' },
];

export default function LearnerCoursesPage() {
  const { data: enrollments, isLoading } = useLearnerEnrollments();
  const [tab, setTab] = useState<Tab>('ongoing');
  const [q, setQ] = useState('');

  const all = enrollments ?? [];

  const filtered = useMemo(() => {
    const norm = q.trim().toLowerCase();
    let list = all;
    if (norm) {
      list = list.filter((e) =>
        e.course.title.toLowerCase().includes(norm),
      );
    }
    switch (tab) {
      case 'ongoing':
        return list.filter(
          (e) => e.status === 'ACTIVE' && (e.progress_percent ?? 0) > 0,
        );
      case 'completed':
        return list.filter((e) => e.status === 'COMPLETED');
      case 'wishlist':
        // Cours inscrits mais pas encore démarrés
        return list.filter(
          (e) => (e.progress_percent ?? 0) === 0 && e.status === 'ACTIVE',
        );
      case 'favorites':
        // R13 : lorsque le backend expose les favoris, brancher ici.
        return [];
      default:
        return list;
    }
  }, [all, tab, q]);

  return (
    <LearnerShell
      title="Mes formations"
      subtitle="Reprenez, terminez, explorez."
      actions={
        <Link
          to="/catalogue"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-primary-600 hover:bg-primary-700 text-white transition"
        >
          Découvrir des cours
          <ArrowRight className="w-4 h-4" />
        </Link>
      }
    >
      {isLoading && !enrollments ? (
        <div className="py-20 flex justify-center">
          <Spinner size="xl" label="Chargement…" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Tabs + search */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div
              role="tablist"
              aria-label="Statut des formations"
              className="flex flex-wrap gap-1 bg-white border border-neutral-200 rounded-2xl p-1 shadow-soft"
            >
              {TABS.map(({ id, label, Icon }) => {
                const active = id === tab;
                return (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTab(id)}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition',
                      active
                        ? 'bg-primary-600 text-white shadow-sm'
                        : 'text-neutral-600 hover:text-neutral-900',
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="w-full sm:w-64">
              <div className="relative">
                <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <Input
                  aria-label="Rechercher dans mes formations"
                  placeholder="Rechercher…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </div>

          {/* Grille */}
          {filtered.length === 0 ? (
            <EmptyTab tab={tab} />
          ) : (
            <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((e) => (
                <li key={e.id}>
                  <EnrollmentCard enrollment={e} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </LearnerShell>
  );
}

import type { LearnerEnrollment } from '@/hooks/player';

function EnrollmentCard({
  enrollment,
}: {
  enrollment: LearnerEnrollment;
}) {
  const {
    course,
    progress_percent = 0,
    status,
    enrolled_at,
  } = enrollment;
  return (
    <motion.article
      whileHover={{ y: -3 }}
      transition={{ duration: 0.2 }}
      className="bg-white border border-neutral-100 rounded-2xl overflow-hidden shadow-soft hover:shadow-lift transition flex flex-col"
    >
      <Link
        to={`/courses/${course.slug}`}
        className="relative block aspect-video"
      >
        {course.thumbnail_url ? (
          <img
            src={course.thumbnail_url}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary-100 to-accent-100" />
        )}
        <div className="absolute top-2 left-2 flex gap-1">
          <Badge
            variant={
              status === 'COMPLETED'
                ? 'success'
                : status === 'ACTIVE'
                  ? 'primary'
                  : 'neutral'
            }
            size="xs"
          >
            {status}
          </Badge>
        </div>
      </Link>

      <div className="p-4 flex-1 flex flex-col">
        <Link
          to={`/courses/${course.slug}`}
          className="text-base font-bold text-neutral-900 hover:text-primary-700 transition line-clamp-2"
        >
          {course.title}
        </Link>

        <div className="mt-2 flex items-center gap-3 text-xs text-neutral-500">
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            Inscrit{' '}
            {new Date(enrolled_at).toLocaleDateString('fr-FR', {
              day: 'numeric',
              month: 'short',
            })}
          </span>
        </div>

        <div className="mt-3">
          <ProgressBar
            value={progress_percent}
            showValue
            label="Progression"
            size="sm"
            color={status === 'COMPLETED' ? 'success' : 'primary'}
          />
        </div>

        <Link
          to={`/learn/courses/${enrollment.course.id}/player`}
          className="mt-4 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold bg-primary-600 hover:bg-primary-700 text-white transition"
        >
          {status === 'COMPLETED' ? 'Revoir le cours' : 'Reprendre'}
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </motion.article>
  );
}

function EmptyTab({ tab }: { tab: Tab }) {
  const messages: Record<Tab, { title: string; body: string; cta?: string }> = {
    ongoing: {
      title: 'Aucun cours en cours',
      body: 'Explorez le catalogue et démarrez un parcours dès maintenant.',
      cta: 'Explorer',
    },
    completed: {
      title: 'Vous n’avez pas encore terminé de cours',
      body: 'Reprenez vos cours en cours pour obtenir votre premier certificat.',
    },
    wishlist: {
      title: 'Aucun cours à démarrer',
      body: 'Ajoutez des cours à votre liste pour les retrouver ici.',
      cta: 'Voir les cours',
    },
    favorites: {
      title: 'Aucun favori pour le moment',
      body: 'La fonction favoris arrivera avec la prochaine mise à jour backend (R13).',
      cta: 'Explorer',
    },
  };
  const m = messages[tab];
  return (
    <Card>
      <CardBody className="text-center py-10">
        <p className="text-lg font-bold text-neutral-900">{m.title}</p>
        <p className="mt-1 text-sm text-neutral-500">{m.body}</p>
        {m.cta && (
          <Link
            to="/catalogue"
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold transition"
          >
            {m.cta}
            <ArrowRight className="w-4 h-4" />
          </Link>
        )}
      </CardBody>
    </Card>
  );
}
