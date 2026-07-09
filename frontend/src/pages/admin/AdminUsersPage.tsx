/**
 * AdminUsersPage.tsx — Liste + filtres admin (R7.3).
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  Shield,
  GraduationCap,
  BookOpen,
  UserX,
  UserCheck,
} from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { useAdminUsers } from '@/hooks/admin';
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
  const [filters, setFilters] = useState<AdminUserFilters>({
    role: 'all',
    is_active: '',
    page: 1,
  });
  const [q, setQ] = useState('');
  const { data, isLoading, isFetching } = useAdminUsers(filters);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setFilters((f) => ({ ...f, q: q.trim() || undefined, page: 1 }));
  };

  const results = data?.results ?? [];
  const totalPages = data ? Math.ceil(data.count / 20) : 1;

  return (
    <AdminShell
      title="Utilisateurs"
      subtitle={`${data?.count ?? '—'} utilisateurs au total. Édition rapide, gestion des rôles, désactivation.`}
    >
      <div className="space-y-4">
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
                        <Link
                          to={`/admin/users/${u.id}`}
                          className="text-primary-600 font-semibold hover:text-primary-700 text-xs"
                        >
                          Détail →
                        </Link>
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
