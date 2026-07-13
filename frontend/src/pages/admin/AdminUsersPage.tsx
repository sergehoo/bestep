/**
 * AdminUsersPage.tsx — Liste + filtres admin (R7.3).
 */
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Search,
  Shield,
  GraduationCap,
  BookOpen,
  UserX,
  UserCheck,
  UserPlus,
  Clock,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AdminShell } from '@/components/admin/AdminShell';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { CreateUserModal } from '@/components/admin/CreateUserModal';
import { useAdminUsers } from '@/hooks/admin';
import api from '@/lib/api';
import type { AdminUserFilters } from '@/lib/types';

const ROLE_OPTIONS: Array<{ value: AdminUserFilters['role']; label: string }> = [
  { value: 'all', label: 'Tous les rôles' },
  { value: 'admin', label: 'Admins plateforme' },
  { value: 'instructor', label: 'Formateurs' },
  { value: 'learner', label: 'Apprenants' },
];

const ACTIVE_OPTIONS: Array<{ value: '' | 'true' | 'false'; label: string }> = [
  { value: '', label: 'Actifs & inactifs' },
  { value: 'true', label: 'Actifs seulement' },
  { value: 'false', label: 'Inactifs seulement' },
];

// SECURITE-06 — Filtre validation formateur (visible seulement quand
// role=instructor est sélectionné).
const VERIFIED_OPTIONS: Array<{ value: '' | 'true' | 'false'; label: string }> = [
  { value: '', label: 'Tous les formateurs' },
  { value: 'false', label: 'En attente d\'approbation' },
  { value: 'true', label: 'Formateurs validés' },
];

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export default function AdminUsersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialRole = searchParams.get('role');
  const initialVerified = searchParams.get('verified');
  const initialActive = searchParams.get('is_active');
  const [filters, setFilters] = useState<AdminUserFilters>({
    role:
      initialRole === 'admin'
        || initialRole === 'instructor'
        || initialRole === 'learner'
        ? initialRole
        : 'all',
    is_active:
      initialActive === 'true' || initialActive === 'false' ? initialActive : '',
    verified:
      initialVerified === 'true' || initialVerified === 'false'
        ? initialVerified
        : '',
    page: 1,
  });
  const [q, setQ] = useState(searchParams.get('q') ?? '');
  const [createOpen, setCreateOpen] = useState(false);
  const { data, isLoading, isFetching, isError, error, refetch } =
    useAdminUsers(filters);

  // SECURITE-06 — actions d'approbation / retrait formateur, inline.
  const qc = useQueryClient();
  const approveInstructor = useMutation({
    mutationFn: async (userId: number) =>
      (await api.post(`/admin/instructors/${userId}/approve/`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      qc.invalidateQueries({ queryKey: ['admin-instructors-pending-count'] });
    },
  });
  const rejectInstructor = useMutation({
    mutationFn: async (payload: { userId: number; reason: string }) =>
      (
        await api.post(`/admin/instructors/${payload.userId}/reject/`, {
          reason: payload.reason,
        })
      ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      qc.invalidateQueries({ queryKey: ['admin-instructors-pending-count'] });
    },
  });
  function handleApprove(userId: number, email: string) {
    if (
      !window.confirm(
        `Approuver ${email} comme formateur ? Il pourra publier des cours immédiatement.`,
      )
    ) return;
    approveInstructor.mutate(userId);
  }
  function handleReject(userId: number, email: string) {
    const reason = window.prompt(
      `Motif de refus pour ${email} (optionnel) :`,
      '',
    );
    if (reason === null) return;
    rejectInstructor.mutate({ userId, reason: reason.trim() });
  }

  // SECURITE-06 — synchronise les query params URL avec l'état des
  // filtres (bookmark / partage de vue filtrée + relance UX après reload).
  useEffect(() => {
    const next = new URLSearchParams();
    if (filters.role && filters.role !== 'all') next.set('role', filters.role);
    if (filters.is_active) next.set('is_active', filters.is_active);
    if (filters.verified) next.set('verified', filters.verified);
    if (filters.q) next.set('q', filters.q);
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.role, filters.is_active, filters.verified, filters.q]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setFilters((f) => ({ ...f, q: q.trim() || undefined, page: 1 }));
  };

  const results = data?.results ?? [];
  const totalPages = data ? Math.ceil(data.count / 20) : 1;

  return (
    <AdminShell
      title="Utilisateurs"
      subtitle={`${typeof data?.count === 'number' ? data.count : '—'} utilisateurs. Édition rapide, gestion des rôles, désactivation.`}
    >
      <CreateUserModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        defaultRole="INSTRUCTOR"
      />
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Liste des utilisateurs plateforme. Créez un compte formateur,
            apprenant, admin ou staff en un clic.
          </p>
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={() => setCreateOpen(true)}
          >
            <UserPlus className="w-4 h-4" />
            Créer un utilisateur
          </Button>
        </div>

        {/* Filtres */}
        <form
          onSubmit={submitSearch}
          className="bg-white border border-neutral-100 rounded-2xl p-4 flex flex-wrap gap-3 items-end"
        >
          <div className="flex-1 min-w-[220px]">
            <Input
              id="q"
              label="Rechercher"
              placeholder="Email, nom…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="min-w-[160px]">
            <label className="text-xs font-semibold text-neutral-600 mb-1 block">
              Rôle
            </label>
            <select
              value={filters.role ?? 'all'}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  role: e.target.value as AdminUserFilters['role'],
                  page: 1,
                }))
              }
              className="w-full border border-neutral-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[160px]">
            <label className="text-xs font-semibold text-neutral-600 mb-1 block">
              Statut
            </label>
            <select
              value={filters.is_active ?? ''}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  is_active: e.target.value as '' | 'true' | 'false',
                  page: 1,
                }))
              }
              className="w-full border border-neutral-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {ACTIVE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          {/* SECURITE-06 — Sous-filtre "validation formateur" visible
              uniquement quand role=instructor est sélectionné. */}
          {filters.role === 'instructor' && (
            <div className="min-w-[180px]">
              <label className="text-xs font-semibold text-neutral-600 mb-1 block">
                Validation
              </label>
              <select
                value={filters.verified ?? ''}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    verified: e.target.value as '' | 'true' | 'false',
                    page: 1,
                  }))
                }
                className="w-full border border-neutral-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {VERIFIED_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <Button type="submit" variant="outline" size="md">
            <Search className="w-4 h-4" />
            Filtrer
          </Button>
        </form>

        {/* Table */}
        {isLoading && !data ? (
          <div className="py-16 flex justify-center">
            <Spinner size="xl" label="Chargement des utilisateurs…" />
          </div>
        ) : isError ? (
          <Card>
            <CardBody className="text-center py-10 text-sm text-rose-700 space-y-2">
              <p className="font-semibold">
                Impossible de charger la liste des utilisateurs.
              </p>
              <p className="text-xs text-rose-500">
                {(error as { response?: { data?: { detail?: string } } })
                  ?.response?.data?.detail
                  ?? (error as Error | undefined)?.message
                  ?? 'Erreur inconnue — vérifiez la console réseau.'}
              </p>
              <button
                type="button"
                onClick={() => refetch()}
                className="mt-2 px-4 py-1.5 rounded-lg border border-rose-300 text-rose-700 text-xs font-semibold hover:bg-rose-50"
              >
                Réessayer
              </button>
            </CardBody>
          </Card>
        ) : results.length === 0 ? (
          <Card>
            <CardBody className="text-center py-10 text-sm text-neutral-500">
              Aucun utilisateur pour ces critères.
            </CardBody>
          </Card>
        ) : (
          <Card>
            <div
              aria-busy={isFetching}
              className="overflow-x-auto"
            >
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-neutral-500 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-4 py-3">Utilisateur</th>
                    <th className="text-left px-4 py-3">Rôles</th>
                    <th className="text-left px-4 py-3">Statut</th>
                    <th className="text-left px-4 py-3">Inscrit</th>
                    <th className="text-left px-4 py-3">Dernière connexion</th>
                    <th className="text-right px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {results.map((u) => (
                    <tr key={u.id} className="hover:bg-neutral-50/60">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-neutral-900">
                          {u.full_name || u.email}
                        </p>
                        {u.full_name && (
                          <p className="text-xs text-neutral-500">{u.email}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {u.is_platform_admin && (
                            <Badge variant="danger" size="xs">
                              <Shield className="w-3 h-3 mr-1" />
                              Admin
                            </Badge>
                          )}
                          {u.is_instructor && (
                            <Badge variant="primary" size="xs">
                              <GraduationCap className="w-3 h-3 mr-1" />
                              Formateur
                            </Badge>
                          )}
                          {u.is_instructor
                            && u.instructor_is_verified === false && (
                              <Badge variant="accent" size="xs">
                                <Clock className="w-3 h-3 mr-1" />
                                En attente
                              </Badge>
                            )}
                          {u.is_learner && (
                            <Badge variant="neutral" size="xs">
                              <BookOpen className="w-3 h-3 mr-1" />
                              Apprenant
                            </Badge>
                          )}
                          {u.has_organization && (
                            <Badge variant="accent" size="xs">
                              Org
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {u.is_active ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                            <UserCheck className="w-3.5 h-3.5" /> Actif
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600">
                            <UserX className="w-3.5 h-3.5" /> Inactif
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-neutral-500">
                        {formatDate(u.date_joined)}
                      </td>
                      <td className="px-4 py-3 text-xs text-neutral-500">
                        {formatDate(u.last_login)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center gap-2 justify-end">
                          {u.is_instructor
                            && u.instructor_is_verified === false && (
                              <button
                                type="button"
                                onClick={() => handleApprove(u.id, u.email)}
                                disabled={approveInstructor.isPending}
                                className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50"
                                title="Approuver le formateur"
                              >
                                Approuver
                              </button>
                            )}
                          {u.is_instructor
                            && u.instructor_is_verified === true && (
                              <button
                                type="button"
                                onClick={() => handleReject(u.id, u.email)}
                                disabled={rejectInstructor.isPending}
                                className="px-2.5 py-1 rounded-md border border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/50 text-xs font-semibold disabled:opacity-50"
                                title="Retirer l'agrément formateur"
                              >
                                Retirer
                              </button>
                            )}
                          <Link
                            to={`/admin/users/${u.id}`}
                            className="text-primary-600 font-semibold hover:text-primary-700 text-xs"
                          >
                            Détail →
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 py-4 border-t border-neutral-100">
                <button
                  disabled={!data?.previous}
                  onClick={() =>
                    setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))
                  }
                  className="px-3 py-1.5 text-sm rounded-lg border border-neutral-200 disabled:opacity-40 hover:bg-neutral-50"
                >
                  Précédent
                </button>
                <span className="text-sm text-neutral-500">
                  Page {filters.page ?? 1} / {totalPages}
                </span>
                <button
                  disabled={!data?.next}
                  onClick={() =>
                    setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))
                  }
                  className="px-3 py-1.5 text-sm rounded-lg border border-neutral-200 disabled:opacity-40 hover:bg-neutral-50"
                >
                  Suivant
                </button>
              </div>
            )}
          </Card>
        )}
      </div>
    </AdminShell>
  );
}
