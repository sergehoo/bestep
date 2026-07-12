/**
 * AdminRolesPage.tsx — R39.2
 *
 * Gestion des rôles plateforme (basés sur Django `Group` natif).
 * Consomme :
 *   GET    /api/admin/roles/
 *   POST   /api/admin/roles/
 *   PATCH  /api/admin/roles/<id>/
 *   DELETE /api/admin/roles/<id>/
 *   GET    /api/admin/roles/<id>/users/
 *   POST   /api/admin/roles/<id>/users/
 *   DELETE /api/admin/roles/<id>/users/<user_id>/
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Shield,
  Plus,
  Users as UsersIcon,
  Trash2,
  Edit3,
  UserPlus,
  X,
  Loader2,
  RefreshCw,
  Key,
} from 'lucide-react';

import api from '@/lib/api';
import { AdminShell } from '@/components/admin/AdminShell';
import { Input } from '@/components/ui/Input';
import {
  PageHeader,
  StatCard,
  EmptyState,
  ErrorState,
  ConfirmDialog,
} from '@/components/admin/primitives';
import { extractApiError } from '@/lib/utils';

interface Role {
  id: number;
  name: string;
  users_count: number;
  permissions_count: number;
}

interface RolesListResponse {
  results: Role[];
  aggregated: { total: number; total_users_assigned: number };
}

interface RoleUser {
  id: number;
  email: string;
  full_name: string;
  is_active: boolean;
}

interface RoleUsersResponse {
  results: RoleUser[];
  count: number;
}

export default function AdminRolesPage() {
  const qc = useQueryClient();
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [newRoleName, setNewRoleName] = useState('');
  const [creatingRole, setCreatingRole] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Role | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);
  const [addUserId, setAddUserId] = useState('');
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  const rolesQuery = useQuery<RolesListResponse>({
    queryKey: ['admin-roles'],
    queryFn: async () => (await api.get<RolesListResponse>('/admin/roles/')).data,
    staleTime: 30_000,
  });

  const roleUsersQuery = useQuery<RoleUsersResponse>({
    queryKey: ['admin-role-users', selectedRole?.id],
    queryFn: async () =>
      (await api.get<RoleUsersResponse>(`/admin/roles/${selectedRole!.id}/users/`)).data,
    enabled: !!selectedRole,
    staleTime: 15_000,
  });

  const createRole = useMutation({
    mutationFn: async (name: string) => {
      const res = await api.post('/admin/roles/', { name });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-roles'] });
      setCreatingRole(false);
      setNewRoleName('');
      setFlash({ kind: 'ok', msg: 'Rôle créé.' });
    },
    onError: (err) => {
      setFlash({ kind: 'err', msg: extractApiError(err, 'Erreur') });
    },
  });

  const renameRole = useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      await api.patch(`/admin/roles/${id}/`, { name });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-roles'] });
      setRenameTarget(null);
      setFlash({ kind: 'ok', msg: 'Rôle renommé.' });
    },
    onError: (err) => {
      setFlash({ kind: 'err', msg: extractApiError(err, 'Erreur') });
    },
  });

  const deleteRole = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/admin/roles/${id}/`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-roles'] });
      setDeleteTarget(null);
      if (selectedRole?.id === deleteTarget?.id) setSelectedRole(null);
      setFlash({ kind: 'ok', msg: 'Rôle supprimé.' });
    },
    onError: (err) => {
      setFlash({ kind: 'err', msg: extractApiError(err, 'Erreur') });
    },
  });

  const addUser = useMutation({
    mutationFn: async ({ roleId, userId }: { roleId: number; userId: number }) => {
      await api.post(`/admin/roles/${roleId}/users/`, { user_id: userId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-role-users', selectedRole?.id] });
      qc.invalidateQueries({ queryKey: ['admin-roles'] });
      setAddUserId('');
      setFlash({ kind: 'ok', msg: 'Utilisateur ajouté.' });
    },
    onError: (err) => {
      setFlash({ kind: 'err', msg: extractApiError(err, 'Erreur') });
    },
  });

  const removeUser = useMutation({
    mutationFn: async ({ roleId, userId }: { roleId: number; userId: number }) => {
      await api.delete(`/admin/roles/${roleId}/users/${userId}/`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-role-users', selectedRole?.id] });
      qc.invalidateQueries({ queryKey: ['admin-roles'] });
      setFlash({ kind: 'ok', msg: 'Utilisateur retiré.' });
    },
    onError: (err) => {
      setFlash({ kind: 'err', msg: extractApiError(err, 'Erreur') });
    },
  });

  const roles = rolesQuery.data?.results ?? [];
  const agg = rolesQuery.data?.aggregated ?? { total: 0, total_users_assigned: 0 };
  const roleUsers = roleUsersQuery.data?.results ?? [];

  return (
    <AdminShell>
      <PageHeader
        title="Rôles & permissions"
        subtitle={`${agg.total} rôles définis — ${agg.total_users_assigned} affectations utilisateurs`}
        breadcrumbs={[
          { label: 'Administration', to: '/dashboard/admin' },
          { label: 'Communauté' },
          { label: 'Rôles & permissions' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCreatingRole(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold transition"
            >
              <Plus className="w-4 h-4" />
              Nouveau rôle
            </button>
            <button
              type="button"
              onClick={() => rolesQuery.refetch()}
              disabled={rolesQuery.isFetching}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition disabled:opacity-60"
            >
              <RefreshCw
                className={`w-4 h-4 ${rolesQuery.isFetching ? 'animate-spin' : ''}`}
              />
            </button>
          </div>
        }
      />

      {flash && (
        <div
          className={
            'mb-4 rounded-xl px-4 py-2 text-sm ' +
            (flash.kind === 'ok'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200')
          }
          role="status"
        >
          {flash.msg}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
        <StatCard
          Icon={Shield}
          label="Rôles"
          value={agg.total.toLocaleString('fr-FR')}
          tone="primary"
        />
        <StatCard
          Icon={UsersIcon}
          label="Affectations"
          value={agg.total_users_assigned.toLocaleString('fr-FR')}
          tone="emerald"
        />
        <StatCard
          Icon={Key}
          label="Permissions Django"
          value={roles.reduce((s, r) => s + r.permissions_count, 0).toLocaleString('fr-FR')}
          tone="accent"
          deltaLabel="agrégat (config admin Django)"
        />
      </div>

      {rolesQuery.isError ? (
        <ErrorState onRetry={() => rolesQuery.refetch()} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Liste rôles */}
          <div className="bg-white dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700 rounded-2xl overflow-hidden">
            <header className="p-4 border-b border-neutral-100 dark:border-neutral-700">
              <h2 className="font-extrabold text-neutral-900 dark:text-white">
                Rôles ({roles.length})
              </h2>
            </header>
            {rolesQuery.isLoading ? (
              <div className="p-8 text-center text-sm text-neutral-500">
                Chargement…
              </div>
            ) : roles.length === 0 ? (
              <EmptyState
                Icon={Shield}
                title="Aucun rôle défini"
                description="Créez votre premier rôle pour organiser les permissions."
                action={
                  <button
                    type="button"
                    onClick={() => setCreatingRole(true)}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold"
                  >
                    <Plus className="w-4 h-4" />
                    Nouveau rôle
                  </button>
                }
              />
            ) : (
              <ul className="divide-y divide-neutral-100 dark:divide-neutral-700">
                {roles.map((r) => (
                  <li
                    key={r.id}
                    className={
                      'p-3 flex items-center gap-3 hover:bg-neutral-50 dark:hover:bg-neutral-700/40 cursor-pointer transition ' +
                      (selectedRole?.id === r.id
                        ? 'bg-primary-50/50 dark:bg-primary-900/20 border-l-2 border-primary-600'
                        : '')
                    }
                    onClick={() => setSelectedRole(r)}
                  >
                    <div className="w-9 h-9 rounded-lg bg-primary-100 text-primary-700 flex items-center justify-center shrink-0">
                      <Shield className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-neutral-900 dark:text-white truncate">
                        {r.name}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {r.users_count} membre{r.users_count > 1 ? 's' : ''} · {r.permissions_count} permission{r.permissions_count > 1 ? 's' : ''}
                      </p>
                    </div>
                    <div
                      className="flex items-center gap-1 opacity-0 group-hover:opacity-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenameTarget(r);
                          setRenameValue(r.name);
                        }}
                        className="p-1.5 rounded-lg text-neutral-500 hover:text-primary-700 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                        title="Renommer"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(r);
                        }}
                        className="p-1.5 rounded-lg text-neutral-500 hover:text-rose-600 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                        title="Supprimer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Détail : membres du rôle sélectionné */}
          <div className="bg-white dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700 rounded-2xl overflow-hidden">
            <header className="p-4 border-b border-neutral-100 dark:border-neutral-700">
              <h2 className="font-extrabold text-neutral-900 dark:text-white">
                Membres
                {selectedRole && (
                  <span className="ml-2 text-sm font-normal text-neutral-500">
                    · {selectedRole.name} ({roleUsersQuery.data?.count ?? '—'})
                  </span>
                )}
              </h2>
            </header>
            {!selectedRole ? (
              <div className="p-8 text-center text-sm text-neutral-500">
                Sélectionnez un rôle dans la liste pour voir ses membres.
              </div>
            ) : roleUsersQuery.isLoading ? (
              <div className="p-8 text-center text-sm text-neutral-500">
                Chargement des membres…
              </div>
            ) : (
              <>
                <div className="p-3 border-b border-neutral-100 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/50">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (addUserId && selectedRole) {
                        addUser.mutate({
                          roleId: selectedRole.id,
                          userId: Number(addUserId),
                        });
                      }
                    }}
                    className="flex items-center gap-2"
                  >
                    <div className="flex-1 relative">
                      <UserPlus className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                      <Input
                        type="number"
                        placeholder="ID utilisateur à ajouter…"
                        value={addUserId}
                        onChange={(e) => setAddUserId(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={!addUserId || addUser.isPending}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold transition disabled:opacity-40"
                    >
                      {addUser.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <UserPlus className="w-4 h-4" />
                      )}
                      Ajouter
                    </button>
                  </form>
                </div>

                {roleUsers.length === 0 ? (
                  <EmptyState
                    Icon={UsersIcon}
                    title="Aucun membre"
                    description="Ce rôle n'a pas encore de membre. Ajoutez-en un via l'ID utilisateur."
                  />
                ) : (
                  <ul className="divide-y divide-neutral-100 dark:divide-neutral-700 max-h-[400px] overflow-y-auto">
                    {roleUsers.map((u) => (
                      <li
                        key={u.id}
                        className="p-3 flex items-center gap-3 hover:bg-neutral-50 dark:hover:bg-neutral-700/40"
                      >
                        <div className="w-9 h-9 rounded-full bg-neutral-100 dark:bg-neutral-700 flex items-center justify-center font-bold text-neutral-600 dark:text-neutral-200 shrink-0">
                          {(u.full_name || u.email).charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-neutral-900 dark:text-white truncate">
                            {u.full_name || u.email.split('@')[0]}
                          </p>
                          <p className="text-[11px] text-neutral-500 truncate">
                            {u.email} {!u.is_active && '· inactif'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            selectedRole &&
                            removeUser.mutate({
                              roleId: selectedRole.id,
                              userId: u.id,
                            })
                          }
                          disabled={removeUser.isPending}
                          className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-600 hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-40"
                          title="Retirer"
                        >
                          {removeUser.isPending &&
                          removeUser.variables?.userId === u.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <X className="w-4 h-4" />
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-primary-200 bg-primary-50/40 dark:bg-primary-900/20 dark:border-primary-800 p-4 text-xs text-neutral-700 dark:text-neutral-300 flex items-start gap-2">
        <Key className="w-4 h-4 text-primary-600 shrink-0 mt-0.5" />
        <div>
          <p className="font-bold">Permissions Django par rôle</p>
          <p className="mt-1">
            L'affectation fine des permissions (view / add / change / delete par
            modèle) se fait via l'admin Django &gt; Groups. Une matrice
            visuelle est planifiée en R41.
          </p>
        </div>
      </div>

      {/* Modale création */}
      {creatingRole && (
        <div
          className="fixed inset-0 z-[80] bg-neutral-900/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setCreatingRole(false)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newRoleName.trim()) createRole.mutate(newRoleName.trim());
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white dark:bg-neutral-800 rounded-2xl shadow-lift p-6 space-y-4"
          >
            <h2 className="text-lg font-extrabold text-neutral-900 dark:text-white">
              Nouveau rôle
            </h2>
            <Input
              placeholder="Nom du rôle (ex: Modérateur, Support…)"
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              autoFocus
              required
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCreatingRole(false)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={!newRoleName.trim() || createRole.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold disabled:opacity-60"
              >
                {createRole.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Créer
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modale renommer */}
      {renameTarget && (
        <div
          className="fixed inset-0 z-[80] bg-neutral-900/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setRenameTarget(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (renameValue.trim() && renameTarget) {
                renameRole.mutate({
                  id: renameTarget.id,
                  name: renameValue.trim(),
                });
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white dark:bg-neutral-800 rounded-2xl shadow-lift p-6 space-y-4"
          >
            <h2 className="text-lg font-extrabold text-neutral-900 dark:text-white">
              Renommer « {renameTarget.name} »
            </h2>
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              autoFocus
              required
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRenameTarget(null)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={!renameValue.trim() || renameRole.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold disabled:opacity-60"
              >
                {renameRole.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Renommer
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          deleteRole.mutate(deleteTarget.id);
        }}
        title="Supprimer ce rôle ?"
        description={
          deleteTarget
            ? `Le rôle "${deleteTarget.name}" sera supprimé. Cette action est refusée s'il contient encore des membres (retirez-les d'abord).`
            : ''
        }
        confirmLabel="Supprimer"
        destructive
        loading={deleteRole.isPending}
      />
    </AdminShell>
  );
}
