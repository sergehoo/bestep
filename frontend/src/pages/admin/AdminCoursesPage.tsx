/**
 * AdminCoursesPage.tsx — Supervision des cours plateforme (R27.3).
 *
 * Vue d'ensemble pour un platform_admin. S'appuie sur `usePublicCourses`
 * (liste publiée) enrichie de filtres et d'actions rapides :
 *   - Filtrer par catégorie / niveau / type / prix
 *   - Voir la fiche publique
 *   - Ouvrir l'éditeur (l'admin passe par InstructorCourseEditPage grâce
 *     au flag `is_platform_admin` qui bypass les guards de propriété)
 *
 * Note : la vraie modération (unpublish massif, alertes qualité) est
 * planifiée en R28 quand les endpoints `/api/admin/courses/…` seront
 * disponibles.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  BookOpen,
  Star,
  Users,
  Filter,
  ExternalLink,
  PenSquare,
  Award,
  EyeOff,
  Archive,
  Loader2,
} from 'lucide-react';

import { AdminShell } from '@/components/admin/AdminShell';
import { Card, CardBody } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { ConfirmDialog } from '@/components/admin/primitives';
import { usePublicCourses, usePublicCategories } from '@/hooks/queries';
import { useCourseLifecycle } from '@/hooks/instructor';
import { extractApiError } from '@/lib/utils';
import type { CourseType, PublicCourseListItem } from '@/lib/types';

const TYPE_LABELS: Record<CourseType, string> = {
  CERTIFIANTE: 'Certifiante',
  PROFESSIONNELLE: 'Professionnelle',
  ACADEMIQUE: 'Académique',
  INTERNE: 'Interne',
};

const LEVEL_LABELS: Record<string, string> = {
  BEGINNER: 'Débutant',
  INTERMEDIATE: 'Intermédiaire',
  ADVANCED: 'Avancé',
  ALL: 'Tous niveaux',
};

export default function AdminCoursesPage() {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<string>('');
  const [pricing, setPricing] = useState<string>('');
  const [type, setType] = useState<string>('');

  const { data: categories } = usePublicCategories();
  const { data, isLoading } = usePublicCourses({
    q: q.trim() || undefined,
    category: category || undefined,
    pricing: (pricing || undefined) as 'FREE' | 'PAID' | 'HYBRID' | undefined,
    page_size: 50,
  });

  const courses = useMemo(() => {
    const list = data?.results ?? [];
    if (!type) return list;
    return list.filter((c) => c.course_type === type);
  }, [data, type]);

  // KPIs rapides
  const kpis = useMemo(() => {
    const list = data?.results ?? [];
    const certifying = list.filter((c) => c.course_type === 'CERTIFIANTE').length;
    const free = list.filter((c) => c.pricing_type === 'FREE').length;
    const enrolled = list.reduce((sum, c) => sum + (c.enrolled_count || 0), 0);
    return { total: list.length, certifying, free, enrolled };
  }, [data]);

  return (
    <AdminShell
      title="Cours plateforme"
      subtitle="Supervision globale des cours publiés. Filtres et accès rapides à l'éditeur."
    >
      {/* KPI rapides */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <KpiCard Icon={BookOpen} label="Cours publiés" value={kpis.total} color="primary" />
        <KpiCard Icon={Award} label="Certifiants" value={kpis.certifying} color="accent" />
        <KpiCard Icon={Star} label="Gratuits" value={kpis.free} color="emerald" />
        <KpiCard Icon={Users} label="Inscrits (agrégé)" value={kpis.enrolled} color="violet" />
      </div>

      {/* Filtres */}
      <Card className="mb-5">
        <CardBody>
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-neutral-500" />
            <span className="text-xs font-bold text-neutral-700 uppercase tracking-wide">
              Filtres
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <Input
                placeholder="Rechercher un titre…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-9"
              />
            </div>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Toutes catégories</option>
              {(categories ?? []).map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Tous types</option>
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <select
              value={pricing}
              onChange={(e) => setPricing(e.target.value)}
              className="border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Toutes tarifications</option>
              <option value="FREE">Gratuit</option>
              <option value="PAID">Payant</option>
              <option value="HYBRID">Hybride</option>
            </select>
          </div>
        </CardBody>
      </Card>

      {/* Liste */}
      {isLoading && !data ? (
        <div className="py-16 flex justify-center">
          <Spinner size="xl" label="Chargement des cours…" />
        </div>
      ) : courses.length === 0 ? (
        <Card>
          <CardBody className="text-center py-10 text-neutral-500">
            Aucun cours ne correspond aux filtres.
          </CardBody>
        </Card>
      ) : (
        <div className="bg-white dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-500 dark:text-neutral-400 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left p-3 font-bold">Cours</th>
                  <th className="text-left p-3 font-bold">Formateur</th>
                  <th className="text-left p-3 font-bold">Type</th>
                  <th className="text-left p-3 font-bold">Niveau</th>
                  <th className="text-right p-3 font-bold">Note</th>
                  <th className="text-right p-3 font-bold">Inscrits</th>
                  <th className="text-right p-3 font-bold">Prix</th>
                  <th className="text-right p-3 font-bold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700">
                {courses.map((c) => (
                  <tr key={c.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-700/50">
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        {c.thumbnail_url ? (
                          <img
                            src={c.thumbnail_url}
                            alt=""
                            className="w-12 h-8 object-cover rounded"
                          />
                        ) : (
                          <div className="w-12 h-8 rounded bg-primary-100 text-primary-700 flex items-center justify-center">
                            <BookOpen className="w-4 h-4" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-bold text-neutral-900 dark:text-white truncate max-w-xs">
                            {c.title}
                          </p>
                          {c.category && (
                            <p className="text-[11px] text-neutral-500">
                              {c.category.name}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-neutral-700 dark:text-neutral-200">
                      {c.instructor?.full_name || '—'}
                    </td>
                    <td className="p-3">
                      <Badge
                        variant={
                          c.course_type === 'CERTIFIANTE' ? 'accent' : 'neutral'
                        }
                        size="sm"
                      >
                        {TYPE_LABELS[c.course_type]}
                      </Badge>
                    </td>
                    <td className="p-3 text-neutral-700 dark:text-neutral-200">
                      {c.level ? LEVEL_LABELS[c.level] : '—'}
                    </td>
                    <td className="p-3 text-right">
                      <span className="inline-flex items-center gap-1 font-bold text-neutral-900 dark:text-white">
                        <Star className="w-3.5 h-3.5 fill-accent-500 text-accent-500" />
                        {Number(c.rating_avg || 0).toFixed(1)}
                      </span>
                      <span className="block text-[11px] text-neutral-500">
                        {c.rating_count} avis
                      </span>
                    </td>
                    <td className="p-3 text-right font-semibold">
                      {c.enrolled_count}
                    </td>
                    <td className="p-3 text-right font-bold text-primary-700 dark:text-primary-400">
                      {c.pricing_type === 'FREE'
                        ? 'Gratuit'
                        : `${Number(c.price).toLocaleString('fr-FR')} ${c.currency}`}
                    </td>
                    <td className="p-3">
                      <CourseRowActions course={c} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data && data.count > courses.length && (
        <p className="mt-3 text-xs text-neutral-500 text-center">
          Affichage limité aux 50 premiers cours ({data.count} au total).
          Utilisez les filtres pour affiner la vue.
        </p>
      )}
    </AdminShell>
  );
}

// ─────────────────────────────────────────────────────────────
// KPI carte compacte
// ─────────────────────────────────────────────────────────────

interface KpiCardProps {
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: 'primary' | 'accent' | 'emerald' | 'violet';
}
function KpiCard({ Icon, label, value, color }: KpiCardProps) {
  const palette: Record<KpiCardProps['color'], string> = {
    primary: 'bg-primary-100 text-primary-700',
    accent: 'bg-accent-100 text-accent-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    violet: 'bg-violet-100 text-violet-700',
  };
  return (
    <div className="bg-white dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700 rounded-2xl p-4">
      <div className="flex items-center gap-3">
        <span
          className={`w-9 h-9 rounded-xl flex items-center justify-center ${palette[color]}`}
        >
          <Icon className="w-4 h-4" />
        </span>
        <div>
          <p className="text-xl font-extrabold text-neutral-900 dark:text-white">
            {value.toLocaleString('fr-FR')}
          </p>
          <p className="text-[11px] text-neutral-500 uppercase tracking-wide">
            {label}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CourseRowActions — Actions admin lifecycle sur une ligne (R29.3)
// ─────────────────────────────────────────────────────────────

interface CourseRowActionsProps {
  course: PublicCourseListItem;
}

function CourseRowActions({ course }: CourseRowActionsProps) {
  const lifecycle = useCourseLifecycle(course.id);
  const [confirm, setConfirm] = useState<
    null | { transition: 'unpublish' | 'archive'; label: string }
  >(null);
  const [flash, setFlash] = useState<string | null>(null);

  const runTransition = async () => {
    if (!confirm) return;
    try {
      await lifecycle.mutateAsync(confirm.transition);
      setFlash(`✓ Cours ${confirm.label}`);
      setConfirm(null);
      setTimeout(() => setFlash(null), 3000);
    } catch (err) {
      setFlash(`✗ ${extractApiError(err, 'Action échouée')}`);
      setConfirm(null);
    }
  };

  return (
    <>
      <div className="flex items-center justify-end gap-1.5">
        <Link
          to={`/courses/${course.slug}`}
          target="_blank"
          className="p-1.5 rounded-lg text-neutral-500 hover:text-primary-700 hover:bg-neutral-100 dark:hover:bg-neutral-700"
          title="Voir la fiche publique"
        >
          <ExternalLink className="w-4 h-4" />
        </Link>
        <Link
          to={`/instructor/courses/${course.id}/edit`}
          className="p-1.5 rounded-lg text-neutral-500 hover:text-emerald-700 hover:bg-neutral-100 dark:hover:bg-neutral-700"
          title="Ouvrir l'éditeur (admin bypass)"
        >
          <PenSquare className="w-4 h-4" />
        </Link>
        <button
          type="button"
          onClick={() =>
            setConfirm({ transition: 'unpublish', label: 'dépublié' })
          }
          disabled={lifecycle.isPending}
          className="p-1.5 rounded-lg text-neutral-500 hover:text-amber-700 hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-40"
          title="Dépublier"
        >
          {lifecycle.isPending && lifecycle.variables === 'unpublish' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <EyeOff className="w-4 h-4" />
          )}
        </button>
        <button
          type="button"
          onClick={() =>
            setConfirm({ transition: 'archive', label: 'archivé' })
          }
          disabled={lifecycle.isPending}
          className="p-1.5 rounded-lg text-neutral-500 hover:text-rose-700 hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-40"
          title="Archiver"
        >
          {lifecycle.isPending && lifecycle.variables === 'archive' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Archive className="w-4 h-4" />
          )}
        </button>
      </div>
      {flash && (
        <p
          className={
            'mt-1 text-[10px] text-right ' +
            (flash.startsWith('✓')
              ? 'text-emerald-600'
              : 'text-rose-600')
          }
        >
          {flash}
        </p>
      )}

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={runTransition}
        title={
          confirm?.transition === 'unpublish'
            ? 'Dépublier ce cours ?'
            : 'Archiver ce cours ?'
        }
        description={
          confirm?.transition === 'unpublish'
            ? `Le cours "${course.title}" ne sera plus visible dans le catalogue. Les inscriptions existantes restent actives. Vous pourrez le republier plus tard.`
            : `Le cours "${course.title}" sera archivé. Il disparaît complètement du catalogue et bloque les nouvelles inscriptions. Restaurable depuis l'éditeur instructor.`
        }
        confirmLabel={
          confirm?.transition === 'unpublish' ? 'Dépublier' : 'Archiver'
        }
        destructive={confirm?.transition === 'archive'}
        loading={lifecycle.isPending}
      />
    </>
  );
}
