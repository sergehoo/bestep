/**
 * components/admin/primitives.tsx — R28.1
 *
 * Composants réutilisables du back-office admin. Regroupés dans un
 * fichier unique pour faciliter l'import et éviter la prolifération de
 * micro-modules. Chaque composant est autonome et sans dépendance
 * mutuelle circulaire.
 *
 * Exports :
 *   - StatCard        : carte KPI avec valeur/variation/icône
 *   - StatusBadge     : badge coloré selon un statut normalisé
 *   - PageHeader      : titre + sous-titre + slot actions (utilisé dans AdminShell)
 *   - EmptyState      : état vide illustré avec CTA
 *   - ErrorState      : état erreur avec bouton retry
 *   - PermissionGuard : masque le contenu si l'user n'a pas la perm
 *   - ConfirmDialog   : modale de confirmation (destructive/normale)
 *   - ExportMenu      : dropdown "Exporter en …" (CSV / Excel / PDF)
 *   - DataTable       : table générique avec header sticky + sort + row actions
 */
import {
  Fragment,
  ReactNode,
  useState,
  useMemo,
  useEffect,
} from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Info,
  Loader2,
  X,
  Download,
  FileText,
  FileSpreadsheet,
  FileType2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  LucideIcon,
} from 'lucide-react';

import { useAuthUser, useIsPlatformAdmin } from '@/stores/auth';
import { cn } from '@/lib/utils';

// ═══════════════════════════════════════════════════════════════════
// StatCard — carte KPI
// ═══════════════════════════════════════════════════════════════════

export type StatCardTone =
  | 'primary'
  | 'accent'
  | 'emerald'
  | 'violet'
  | 'rose'
  | 'sky'
  | 'neutral';

interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  Icon?: LucideIcon;
  tone?: StatCardTone;
  /** Variation en % (nombre) ; positive → tendance haute, négative → basse. */
  delta?: number;
  /** Comparaison textuelle si delta absent (ex: « vs période précédente »). */
  deltaLabel?: string;
  loading?: boolean;
  onClick?: () => void;
  className?: string;
}

const TONE_PALETTE: Record<StatCardTone, { bg: string; text: string }> = {
  primary: { bg: 'bg-primary-100 dark:bg-primary-900/30', text: 'text-primary-700 dark:text-primary-300' },
  accent: { bg: 'bg-accent-100 dark:bg-accent-900/30', text: 'text-accent-700 dark:text-accent-300' },
  emerald: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300' },
  violet: { bg: 'bg-violet-100 dark:bg-violet-900/30', text: 'text-violet-700 dark:text-violet-300' },
  rose: { bg: 'bg-rose-100 dark:bg-rose-900/30', text: 'text-rose-700 dark:text-rose-300' },
  sky: { bg: 'bg-sky-100 dark:bg-sky-900/30', text: 'text-sky-700 dark:text-sky-300' },
  neutral: { bg: 'bg-neutral-100 dark:bg-neutral-700', text: 'text-neutral-700 dark:text-neutral-200' },
};

export function StatCard({
  label,
  value,
  hint,
  Icon,
  tone = 'neutral',
  delta,
  deltaLabel,
  loading,
  onClick,
  className,
}: StatCardProps) {
  const palette = TONE_PALETTE[tone];
  const Wrapper = onClick ? 'button' : 'div';
  const deltaSign = delta !== undefined && delta > 0 ? '+' : '';
  const deltaClass =
    delta === undefined
      ? 'text-neutral-500'
      : delta > 0
        ? 'text-emerald-600'
        : delta < 0
          ? 'text-rose-600'
          : 'text-neutral-500';

  return (
    <Wrapper
      onClick={onClick}
      className={cn(
        'text-left w-full bg-white dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700 rounded-2xl p-4 transition',
        onClick && 'hover:shadow-soft hover:border-neutral-200 cursor-pointer',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            {label}
          </p>
          <p className="mt-1 text-2xl sm:text-3xl font-extrabold text-neutral-900 dark:text-white leading-none">
            {loading ? (
              <span className="inline-block h-6 w-16 rounded bg-neutral-200 dark:bg-neutral-700 animate-pulse" />
            ) : (
              value
            )}
          </p>
          {hint && (
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              {hint}
            </p>
          )}
        </div>
        {Icon && (
          <span
            className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
              palette.bg,
              palette.text,
            )}
          >
            <Icon className="w-5 h-5" />
          </span>
        )}
      </div>
      {(delta !== undefined || deltaLabel) && (
        <p className={cn('mt-3 text-xs font-semibold', deltaClass)}>
          {delta !== undefined && `${deltaSign}${delta.toFixed(1)}%`}
          {delta !== undefined && deltaLabel && ' · '}
          {deltaLabel && (
            <span className="text-neutral-500 dark:text-neutral-400 font-normal">
              {deltaLabel}
            </span>
          )}
        </p>
      )}
    </Wrapper>
  );
}

// ═══════════════════════════════════════════════════════════════════
// StatusBadge
// ═══════════════════════════════════════════════════════════════════

export type StatusKind =
  | 'draft'
  | 'pending'
  | 'active'
  | 'published'
  | 'success'
  | 'inactive'
  | 'archived'
  | 'rejected'
  | 'failed'
  | 'error'
  | 'warning'
  | 'info';

const STATUS_MAP: Record<
  StatusKind,
  { label: string; className: string; Icon?: LucideIcon }
> = {
  draft: {
    label: 'Brouillon',
    className: 'bg-neutral-100 text-neutral-700 ring-neutral-200 dark:bg-neutral-700 dark:text-neutral-200',
  },
  pending: {
    label: 'En attente',
    className: 'bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-300',
    Icon: Loader2,
  },
  active: {
    label: 'Actif',
    className: 'bg-emerald-100 text-emerald-800 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300',
    Icon: CheckCircle,
  },
  published: {
    label: 'Publié',
    className: 'bg-emerald-100 text-emerald-800 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300',
    Icon: CheckCircle,
  },
  success: {
    label: 'Réussi',
    className: 'bg-emerald-100 text-emerald-800 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300',
    Icon: CheckCircle,
  },
  inactive: {
    label: 'Inactif',
    className: 'bg-neutral-100 text-neutral-500 ring-neutral-200 dark:bg-neutral-700 dark:text-neutral-400',
  },
  archived: {
    label: 'Archivé',
    className: 'bg-neutral-100 text-neutral-600 ring-neutral-200 dark:bg-neutral-700 dark:text-neutral-300',
  },
  rejected: {
    label: 'Rejeté',
    className: 'bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-900/30 dark:text-rose-300',
    Icon: X,
  },
  failed: {
    label: 'Échec',
    className: 'bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-900/30 dark:text-rose-300',
    Icon: AlertTriangle,
  },
  error: {
    label: 'Erreur',
    className: 'bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-900/30 dark:text-rose-300',
    Icon: AlertTriangle,
  },
  warning: {
    label: 'Attention',
    className: 'bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-300',
    Icon: AlertTriangle,
  },
  info: {
    label: 'Info',
    className: 'bg-primary-100 text-primary-700 ring-primary-200 dark:bg-primary-900/30 dark:text-primary-300',
    Icon: Info,
  },
};

interface StatusBadgeProps {
  status: StatusKind;
  /** Override du texte affiché (sinon libellé par défaut selon le kind). */
  children?: ReactNode;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, children, size = 'md' }: StatusBadgeProps) {
  const meta = STATUS_MAP[status] ?? STATUS_MAP.info;
  const paddings = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-bold ring-1 whitespace-nowrap',
        paddings,
        meta.className,
      )}
    >
      {meta.Icon && <meta.Icon className="w-3 h-3 shrink-0" />}
      {children ?? meta.label}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PageHeader — quand un AdminShell est déjà présent
// ═══════════════════════════════════════════════════════════════════

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  breadcrumbs?: Array<{ label: string; to?: string }>;
}

export function PageHeader({ title, subtitle, actions, breadcrumbs }: PageHeaderProps) {
  return (
    <div className="mb-5">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Fil d'Ariane" className="mb-2">
          <ol className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
            {breadcrumbs.map((b, i) => (
              <Fragment key={i}>
                <li>
                  {b.to ? (
                    <a
                      href={b.to}
                      className="hover:text-neutral-900 dark:hover:text-white transition"
                    >
                      {b.label}
                    </a>
                  ) : (
                    <span>{b.label}</span>
                  )}
                </li>
                {i < breadcrumbs.length - 1 && (
                  <li aria-hidden className="text-neutral-300">/</li>
                )}
              </Fragment>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-extrabold text-neutral-900 dark:text-white truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
              {subtitle}
            </p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// EmptyState / ErrorState
// ═══════════════════════════════════════════════════════════════════

interface EmptyStateProps {
  Icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="text-center py-12 bg-white dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700 rounded-2xl">
      {Icon && (
        <span className="inline-flex w-12 h-12 rounded-2xl bg-neutral-100 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-300 items-center justify-center mb-3">
          <Icon className="w-6 h-6" />
        </span>
      )}
      <p className="text-base font-bold text-neutral-900 dark:text-white">{title}</p>
      {description && (
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400 max-w-md mx-auto">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = 'Impossible de charger les données',
  description = 'Une erreur est survenue côté serveur. Réessayez ou contactez le support si le problème persiste.',
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="text-center py-10 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-2xl">
      <AlertTriangle className="w-8 h-8 text-rose-600 mx-auto" />
      <p className="mt-2 font-bold text-rose-900 dark:text-rose-200">{title}</p>
      <p className="mt-1 text-sm text-rose-700 dark:text-rose-300 max-w-md mx-auto">
        {description}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold transition"
        >
          Réessayer
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PermissionGuard
// ═══════════════════════════════════════════════════════════════════

interface PermissionGuardProps {
  /** Nécessite `is_platform_admin`. */
  adminOnly?: boolean;
  /** Nécessite l'un de ces rôles. */
  anyRole?: string[];
  /** Rendu alternatif si pas autorisé. */
  fallback?: ReactNode;
  children: ReactNode;
}

export function PermissionGuard({
  adminOnly,
  anyRole,
  fallback = null,
  children,
}: PermissionGuardProps) {
  const user = useAuthUser();
  const isAdmin = useIsPlatformAdmin();
  const roles = user?.roles ?? [];
  const allowed =
    (adminOnly ? isAdmin : true) &&
    (anyRole ? anyRole.some((r) => roles.includes(r as never)) : true);
  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}

// ═══════════════════════════════════════════════════════════════════
// ConfirmDialog — modale de confirmation
// ═══════════════════════════════════════════════════════════════════

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `destructive=true` colore le CTA en rouge (suppression). */
  destructive?: boolean;
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  destructive,
  loading,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] bg-neutral-900/60 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white dark:bg-neutral-800 rounded-2xl shadow-lift p-6"
      >
        <div className="flex items-start gap-3">
          <span
            className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
              destructive
                ? 'bg-rose-100 text-rose-600'
                : 'bg-primary-100 text-primary-600',
            )}
          >
            <AlertTriangle className="w-5 h-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-extrabold text-neutral-900 dark:text-white">{title}</h2>
            {description && (
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
                {description}
              </p>
            )}
          </div>
        </div>
        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition disabled:opacity-40"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => onConfirm()}
            disabled={loading}
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition disabled:opacity-60 disabled:cursor-not-allowed',
              destructive
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-primary-600 hover:bg-primary-700',
            )}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ExportMenu — dropdown export CSV/Excel/PDF
// ═══════════════════════════════════════════════════════════════════

interface ExportMenuProps {
  onExport: (format: 'csv' | 'xlsx' | 'pdf') => void | Promise<void>;
  disabled?: boolean;
  label?: string;
}

export function ExportMenu({ onExport, disabled, label = 'Exporter' }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onClick = () => setOpen(false);
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [open]);

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition disabled:opacity-50"
      >
        <Download className="w-4 h-4" />
        {label}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-52 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-lift z-30 p-1">
          <MenuBtn
            Icon={FileType2}
            label="Fichier CSV"
            onClick={() => {
              setOpen(false);
              void onExport('csv');
            }}
          />
          <MenuBtn
            Icon={FileSpreadsheet}
            label="Excel (.xlsx)"
            onClick={() => {
              setOpen(false);
              void onExport('xlsx');
            }}
          />
          <MenuBtn
            Icon={FileText}
            label="PDF"
            onClick={() => {
              setOpen(false);
              void onExport('pdf');
            }}
          />
        </div>
      )}
    </div>
  );
}

function MenuBtn({
  Icon,
  label,
  onClick,
}: {
  Icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition"
    >
      <Icon className="w-4 h-4 text-neutral-500" />
      {label}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════
// DataTable — table générique avec sort + row actions
// ═══════════════════════════════════════════════════════════════════

export interface DataTableColumn<T> {
  key: string;
  header: string;
  /** Alignement du contenu (défaut : left). */
  align?: 'left' | 'right' | 'center';
  /** Rendu cellulaire personnalisé. */
  render: (row: T) => ReactNode;
  /** Fonction de tri (retourne < 0, 0, > 0 style compareFn). */
  sortAccessor?: (row: T) => string | number | null | undefined;
  className?: string;
  /** Largeur CSS (`80px`, `min-content`…). */
  width?: string;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  loading?: boolean;
  emptyState?: ReactNode;
  /** Nombre de skeletons lors du loading. */
  skeletonRows?: number;
  /** Rendu additionnel en fin de ligne (actions). */
  rowActions?: (row: T) => ReactNode;
  onRowClick?: (row: T) => void;
}

type SortState = {
  key: string;
  direction: 'asc' | 'desc';
} | null;

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  emptyState,
  skeletonRows = 5,
  rowActions,
  onRowClick,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState>(null);

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortAccessor) return rows;
    const dir = sort.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = col.sortAccessor!(a);
      const vb = col.sortAccessor!(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }, [rows, sort, columns]);

  const toggleSort = (key: string) => {
    setSort((s) =>
      !s || s.key !== key
        ? { key, direction: 'asc' }
        : s.direction === 'asc'
          ? { key, direction: 'desc' }
          : null,
    );
  };

  if (!loading && rows.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div className="bg-white dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700 rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-500 dark:text-neutral-400 text-[11px] uppercase tracking-wide">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  style={c.width ? { width: c.width } : undefined}
                  className={cn(
                    'p-3 font-bold',
                    c.align === 'right' && 'text-right',
                    c.align === 'center' && 'text-center',
                    !c.align && 'text-left',
                  )}
                >
                  {c.sortAccessor ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key)}
                      className="inline-flex items-center gap-1 hover:text-neutral-900 dark:hover:text-white transition"
                    >
                      {c.header}
                      {sort?.key === c.key ? (
                        sort.direction === 'asc' ? (
                          <ArrowUp className="w-3 h-3" />
                        ) : (
                          <ArrowDown className="w-3 h-3" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3 h-3 opacity-30" />
                      )}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              ))}
              {rowActions && <th className="p-3 text-right font-bold">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700">
            {loading
              ? Array.from({ length: skeletonRows }).map((_, i) => (
                  <tr key={`skel-${i}`}>
                    {columns.map((c) => (
                      <td key={c.key} className="p-3">
                        <span className="inline-block h-4 w-24 rounded bg-neutral-200 dark:bg-neutral-700 animate-pulse" />
                      </td>
                    ))}
                    {rowActions && <td className="p-3" />}
                  </tr>
                ))
              : sortedRows.map((row) => (
                  <tr
                    key={rowKey(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(
                      'hover:bg-neutral-50 dark:hover:bg-neutral-700/50',
                      onRowClick && 'cursor-pointer',
                    )}
                  >
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={cn(
                          'p-3 align-middle',
                          c.align === 'right' && 'text-right',
                          c.align === 'center' && 'text-center',
                          c.className,
                        )}
                      >
                        {c.render(row)}
                      </td>
                    ))}
                    {rowActions && (
                      <td
                        className="p-3 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {rowActions(row)}
                      </td>
                    )}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
