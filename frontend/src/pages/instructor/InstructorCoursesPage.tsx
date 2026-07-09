/**
 * InstructorCoursesPage.tsx — Liste cours instructor (R13.3).
 * Toggle vue cards / table. Filtres avancés. Actions rapides.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  Search,
  Star,
  Users,
  Wallet,
  PenSquare,
  MoreHorizontal,
  LayoutGrid,
  Table as TableIcon,
  Copy,
  Download,
  ExternalLink,
} from 'lucide-react';
import { InstructorShell } from '@/components/instructor/InstructorShell';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { useInstructorCourses } from '@/hooks/instructor';
import { formatPrice, cn } from '@/lib/utils';
import type {
  CourseStatus,
  PricingType,
  InstructorCourseFilters,
  InstructorCourseListItem,
} from '@/lib/types';

const STATUS_OPTIONS: Array<{ value: CourseStatus | ''; label: string }> = [
  { value: '', label: 'Tous les statuts' },
  { value: 'DRAFT', label: 'Brouillons' },
  { value: 'REVIEW', label: 'En validation' },
  { value: 'PUBLISHED', label: 'Publiés' },
  { value: 'ARCHIVED', label: 'Archivés' },
];

const PRICING_OPTIONS: Array<{ value: PricingType | ''; label: string }> = [
  { value: '', label: 'Tous les tarifs' },
  { value: 'FREE', label: 'Gratuit' },
  { value: 'PAID', label: 'Payant' },
  { value: 'HYBRID', label: 'Hybride' },
];

type ViewMode = 'cards' | 'table';

function statusVariant(status: CourseStatus) {
  switch (status) {
    case 'PUBLISHED':
      return 'success' as const;
    case 'REVIEW':
      return 'info' as const;
    case 'ARCHIVED':
      return 'neutral' as const;
    default:
      return 'warning' as const;
  }
}

export default function InstructorCoursesPage() {
  const [filters, setFilters] = useState<InstructorCourseFilters>({});
  const [q, setQ] = useState('');
  const [view, setView] = useState<ViewMode>('cards');
  const { data, isLoading, isFetching } = useInstructorCourses(filters);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setFilters((f) => ({ ...f, q: q.trim() || undefined }));
  };

  const courses = data ?? [];
  const totals = {
    published: courses.filter((c) => c.status === 'PUBLISHED').length,
    draft: courses.filter((c) => c.status === 'DRAFT').length,
    review: courses.filter((c) => c.status === 'REVIEW').length,
    students: courses.reduce((s, c) => s + (c.enrolled_count || 0), 0),
  };

  return (
    <InstructorShell
      title="Mes formations"
      subtitle={`${courses.length} cours au total`}
      actions={
        <Link
          to="/instructor/courses/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-primary-600 hover:bg-primary-700 text-white transition"
        >
          <Plus className="w-4 h-4" />
          Nouveau cours
        </Link>
      }
    >
      {/* Résumé */}
      {courses.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <MiniStat label="Publiés" value={totals.published} color="success" />
          <MiniStat label="Brouillons" value={totals.draft} color="warning" />
          <MiniStat label="En review" value={totals.review} color="info" />
          <MiniStat label="Inscrits total" value={totals.students} color="primary" />
        </div>
      )}

      {/* Filtres + toggle */}
      <form
        onSubmit={submitSearch}
        className="bg-white border border-neutral-100 rounded-2xl p-4 flex flex-wrap gap-3 items-end mb-4"
      >
        <div className="flex-1 min-w-[220px]">
          <Input
            id="q"
            label="Rechercher"
            placeholder="Titre, description…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="min-w-[160px]">
          <label className="text-xs font-semibold text-neutral-600 mb-1 block">
            Statut
          </label>
          <select
            value={filters.status ?? ''}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                status: (e.target.value || undefined) as CourseStatus | undefined,
              }))
            }
            className="w-full border border-neutral-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[160px]">
          <label className="text-xs font-semibold text-neutral-600 mb-1 block">
            Tarif
          </label>
          <select
            value={filters.pricing ?? ''}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                pricing: (e.target.value || undefined) as PricingType | undefined,
              }))
            }
            className="w-full border border-neutral-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {PRICING_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="outline" size="md">
          <Search className="w-4 h-4" />
          Filtrer
        </Button>
        <div
          role="group"
          aria-label="Mode d'affichage"
          className="inline-flex bg-neutral-100 rounded-xl p-0.5 ml-auto"
        >
          <button
            type="button"
            onClick={() => setView('cards')}
            aria-pressed={view === 'cards'}
            className={cn(
              'inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition',
              view === 'cards'
                ? 'bg-white shadow-sm text-neutral-900'
                : 'text-neutral-500 hover:text-neutral-800',
            )}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            Cartes
          </button>
          <button
            type="button"
            onClick={() => setView('table')}
            aria-pressed={view === 'table'}
            className={cn(
              'inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition',
              view === 'table'
                ? 'bg-white shadow-sm text-neutral-900'
                : 'text-neutral-500 hover:text-neutral-800',
            )}
          >
            <TableIcon className="w-3.5 h-3.5" />
            Table
          </button>
        </div>
      </form>

      {/* Liste */}
      {isLoading && !data ? (
        <div className="py-16 flex justify-center">
          <Spinner size="xl" label="Chargement…" />
        </div>
      ) : courses.length === 0 ? (
        <Card>
          <CardBody className="text-center py-12">
            <p className="text-neutral-500">
              Aucun cours pour le moment.{' '}
              <Link
                to="/instructor/courses/new"
                className="text-primary-600 font-semibold"
              >
                Créez votre premier cours →
              </Link>
            </p>
          </CardBody>
        </Card>
      ) : view === 'cards' ? (
        <CardsView courses={courses} isFetching={isFetching} />
      ) : (
        <TableView courses={courses} isFetching={isFetching} />
      )}
    </InstructorShell>
  );
}

// ─────────────────────────────────────────────────────────────

function MiniStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: 'primary' | 'success' | 'warning' | 'info';
}) {
  const styles = {
    primary: 'from-primary-50 to-primary-100 text-primary-700',
    success: 'from-emerald-50 to-emerald-100 text-emerald-700',
    warning: 'from-amber-50 to-amber-100 text-amber-700',
    info: 'from-cyan-50 to-cyan-100 text-cyan-700',
  };
  return (
    <div
      className={`rounded-2xl border border-neutral-100 p-4 bg-gradient-to-br ${styles[color]}`}
    >
      <p className="text-2xl font-extrabold">{value}</p>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
        {label}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────

function CardsView({
  courses,
  isFetching,
}: {
  courses: InstructorCourseListItem[];
  isFetching: boolean;
}) {
  return (
    <div
      aria-busy={isFetching}
      className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4"
    >
      {courses.map((c) => (
        <article
          key={c.id}
          className="bg-white border border-neutral-100 rounded-2xl overflow-hidden shadow-soft hover:shadow-lift transition flex flex-col"
        >
          {c.thumbnail_url ? (
            <img
              src={c.thumbnail_url}
              alt=""
              className="w-full aspect-video object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full aspect-video bg-gradient-to-br from-primary-100 to-primary-200" />
          )}
          <div className="p-4 flex flex-col flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Badge variant={statusVariant(c.status)} size="xs">
                {c.status}
              </Badge>
              {c.category && (
                <Badge variant="neutral" size="xs">
                  {c.category.name}
                </Badge>
              )}
              <Badge variant="primary" size="xs">
                {c.pricing_type === 'FREE'
                  ? 'Gratuit'
                  : formatPrice(c.price, c.currency)}
              </Badge>
            </div>
            <h3 className="text-base font-bold line-clamp-2">{c.title}</h3>
            {c.subtitle && (
              <p className="text-xs text-neutral-500 mt-1 line-clamp-2">
                {c.subtitle}
              </p>
            )}
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-neutral-500">
              <span className="inline-flex items-center gap-1">
                <Users className="w-3 h-3" />
                {c.enrolled_count}
              </span>
              {(c.rating_count ?? 0) > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Star className="w-3 h-3 fill-accent-500 text-accent-500" />
                  {(c.rating_avg ?? 0).toFixed(1)}
                </span>
              )}
              <span className="text-neutral-400 truncate">
                {c.updated_at_human}
              </span>
            </div>
            <div className="mt-4 flex gap-2">
              <Link
                to={`/instructor/courses/${c.id}/edit`}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-primary-600 text-white hover:bg-primary-700 transition"
              >
                <PenSquare className="w-3.5 h-3.5" />
                Éditer
              </Link>
              <Link
                to={`/courses/${c.slug}`}
                target="_blank"
                className="px-3 py-2 rounded-xl text-xs font-semibold border border-neutral-200 hover:bg-neutral-50 transition"
                aria-label="Aperçu"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
              <QuickActions />
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────

function TableView({
  courses,
  isFetching,
}: {
  courses: InstructorCourseListItem[];
  isFetching: boolean;
}) {
  return (
    <Card>
      <div aria-busy={isFetching} className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-3">Cours</th>
              <th className="text-left px-4 py-3">Statut</th>
              <th className="text-right px-4 py-3">Inscrits</th>
              <th className="text-right px-4 py-3">Note</th>
              <th className="text-right px-4 py-3">Prix</th>
              <th className="text-left px-4 py-3">MAJ</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {courses.map((c) => (
              <tr key={c.id} className="hover:bg-neutral-50/60">
                <td className="px-4 py-3">
                  <Link
                    to={`/instructor/courses/${c.id}/edit`}
                    className="flex items-center gap-3 min-w-0"
                  >
                    {c.thumbnail_url ? (
                      <img
                        src={c.thumbnail_url}
                        alt=""
                        className="w-12 h-8 rounded object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-8 rounded bg-primary-100 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold text-neutral-900 truncate max-w-[280px]">
                        {c.title}
                      </p>
                      {c.category && (
                        <p className="text-[11px] text-neutral-500">
                          {c.category.name}
                        </p>
                      )}
                    </div>
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={statusVariant(c.status)} size="xs">
                    {c.status}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">
                  {c.enrolled_count}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {c.rating_count && c.rating_count > 0 ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold">
                      <Star className="w-3 h-3 fill-accent-500 text-accent-500" />
                      {(c.rating_avg ?? 0).toFixed(1)}
                    </span>
                  ) : (
                    <span className="text-neutral-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {c.pricing_type === 'FREE'
                    ? 'Gratuit'
                    : formatPrice(c.price, c.currency)}
                </td>
                <td className="px-4 py-3 text-xs text-neutral-500">
                  {c.updated_at_human}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    to={`/instructor/courses/${c.id}/edit`}
                    className="text-primary-600 hover:text-primary-700 text-xs font-semibold"
                  >
                    Éditer
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────

function QuickActions() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="px-3 py-2 rounded-xl text-xs font-semibold border border-neutral-200 hover:bg-neutral-50 transition"
        aria-label="Plus d'actions"
        aria-expanded={open}
      >
        <MoreHorizontal className="w-3.5 h-3.5" />
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute right-0 top-full mt-1 z-20 w-40 bg-white border border-neutral-100 rounded-xl shadow-lift overflow-hidden">
            <MenuButton Icon={Copy} label="Dupliquer" />
            <MenuButton Icon={Download} label="Exporter" />
            <MenuButton Icon={Wallet} label="Voir revenus" />
          </div>
        </>
      )}
    </div>
  );
}

function MenuButton({
  Icon,
  label,
}: {
  Icon: typeof Copy;
  label: string;
}) {
  return (
    <button
      type="button"
      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-neutral-700 hover:bg-neutral-50 text-left"
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}
