/**
 * AdminUserDetailPage.tsx — Détail + édition d'un user (R7.4).
 */
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  KeyRound,
  Shield,
  ShieldOff,
  UserCheck,
  UserX,
  Mail,
  Phone,
  Copy,
} from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { useAuthUser } from '@/stores/auth';
import {
  useAdminUserDetail,
  useUpdateAdminUser,
  useResetPasswordAdminUser,
} from '@/hooks/admin';
import { extractApiError } from '@/lib/utils';
import type { PlatformRole } from '@/lib/types';

export default function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const currentUser = useAuthUser();
  const { data: user, isLoading } = useAdminUserDetail(id);
  const update = useUpdateAdminUser(id ?? '');
  const resetPw = useResetPasswordAdminUser();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [flash, setFlash] = useState<
    | { kind: 'ok' | 'err'; msg: string; token?: string | null }
    | null
  >(null);

  // Sync local state quand user est hydraté / re-fetch
  useEffect(() => {
    if (user) {
      setFullName(user.full_name || '');
      setPhone(user.phone || '');
    }
  }, [user?.id, user?.full_name, user?.phone]);

  const isSelf = user?.id === currentUser?.id;

  async function toggleActive() {
    if (!user || isSelf) return;
    setFlash(null);
    try {
      await update.mutateAsync({ is_active: !user.is_active });
      setFlash({
        kind: 'ok',
        msg: !user.is_active ? 'Compte réactivé.' : 'Compte désactivé.',
      });
    } catch (e) {
      setFlash({ kind: 'err', msg: extractApiError(e) });
    }
  }

  async function togglePlatformAdmin() {
    if (!user || isSelf) return;
    setFlash(null);
    const next: PlatformRole = user.is_platform_admin ? 'USER' : 'PLATFORM_ADMIN';
    try {
      await update.mutateAsync({ platform_role: next });
      setFlash({
        kind: 'ok',
        msg:
          next === 'PLATFORM_ADMIN'
            ? 'Utilisateur promu admin plateforme.'
            : 'Rétrogradation en utilisateur standard.',
      });
    } catch (e) {
      setFlash({ kind: 'err', msg: extractApiError(e) });
    }
  }

  async function saveProfile() {
    if (!user) return;
    setFlash(null);
    try {
      await update.mutateAsync({ full_name: fullName, phone });
      setFlash({ kind: 'ok', msg: 'Modifications enregistrées.' });
    } catch (e) {
      setFlash({ kind: 'err', msg: extractApiError(e) });
    }
  }

  async function requestReset() {
    if (!user) return;
    setFlash(null);
    try {
      const res = await resetPw.mutateAsync(user.id);
      setFlash({
        kind: 'ok',
        msg: res.detail || 'Token généré.',
        token: res.token,
      });
    } catch (e) {
      setFlash({ kind: 'err', msg: extractApiError(e) });
    }
  }

  if (isLoading && !user) {
    return (
      <AdminShell title="Utilisateur">
        <div className="py-20 flex justify-center">
          <Spinner size="xl" label="Chargement…" />
        </div>
      </AdminShell>
    );
  }

  if (!user) {
    return (
      <AdminShell title="Utilisateur">
        <div className="py-16 text-center">
          <h1 className="text-2xl font-bold">Utilisateur introuvable</h1>
          <Link to="/admin/users" className="text-primary-600 mt-4 inline-block">
            ← Retour à la liste
          </Link>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell
      title={user.full_name || user.email}
      subtitle={user.email + (user.phone ? ` · ${user.phone}` : '')}
      actions={
        <Link
          to="/admin/users"
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border border-neutral-200 hover:bg-neutral-50 text-neutral-700"
        >
          <ArrowLeft className="w-4 h-4" /> Retour
        </Link>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 -mt-2 flex-wrap">
          <span className="inline-flex items-center gap-1 text-sm text-neutral-500">
            <Mail className="w-3.5 h-3.5" />
            {user.email}
          </span>
          {user.phone && (
            <span className="inline-flex items-center gap-1 text-sm text-neutral-500">
              <Phone className="w-3.5 h-3.5" />
              {user.phone}
            </span>
          )}
          {isSelf && (
            <Badge variant="warning" size="xs">
              Vous
            </Badge>
          )}
        </div>
        {flash && (
          <div
            className={
              flash.kind === 'ok'
                ? 'text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2'
                : 'text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2'
            }
          >
            <p>{flash.msg}</p>
            {flash.token && (
              <div className="mt-2 flex items-center gap-2 bg-white rounded-lg p-2 border border-emerald-200">
                <code className="flex-1 text-[11px] break-all">{flash.token}</code>
                <button
                  onClick={() =>
                    navigator.clipboard?.writeText(flash.token ?? '')
                  }
                  className="p-1.5 rounded hover:bg-neutral-100"
                  aria-label="Copier le token"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Statut + rôles */}
        <Card>
          <CardHeader
            title="Statut & rôles"
            subtitle="Actions rapides sur le compte"
          />
          <CardBody className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                {user.is_active ? (
                  <Badge variant="success" size="sm">
                    <UserCheck className="w-3 h-3 mr-1" /> Actif
                  </Badge>
                ) : (
                  <Badge variant="danger" size="sm">
                    <UserX className="w-3 h-3 mr-1" /> Inactif
                  </Badge>
                )}
                {user.is_platform_admin && (
                  <Badge variant="danger" size="sm">
                    <Shield className="w-3 h-3 mr-1" /> Admin plateforme
                  </Badge>
                )}
                {user.is_instructor && (
                  <Badge variant="primary" size="sm">Formateur</Badge>
                )}
                {user.is_learner && (
                  <Badge variant="neutral" size="sm">Apprenant</Badge>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant={user.is_active ? 'outline' : 'primary'}
                disabled={isSelf}
                loading={update.isPending}
                onClick={toggleActive}
              >
                {user.is_active ? (
                  <>
                    <UserX className="w-4 h-4" /> Désactiver
                  </>
                ) : (
                  <>
                    <UserCheck className="w-4 h-4" /> Réactiver
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                disabled={isSelf}
                loading={update.isPending}
                onClick={togglePlatformAdmin}
              >
                {user.is_platform_admin ? (
                  <>
                    <ShieldOff className="w-4 h-4" /> Retirer admin
                  </>
                ) : (
                  <>
                    <Shield className="w-4 h-4" /> Promouvoir admin
                  </>
                )}
              </Button>
              <Button
                variant="ghost"
                onClick={requestReset}
                loading={resetPw.isPending}
              >
                <KeyRound className="w-4 h-4" />
                Générer un reset password
              </Button>
            </div>

            {isSelf && (
              <p className="text-xs text-neutral-500">
                Vous ne pouvez pas modifier votre propre statut / rôle admin ici
                (protection anti auto-lockout).
              </p>
            )}
          </CardBody>
        </Card>

        {/* Édition profil */}
        <Card>
          <CardHeader title="Profil" subtitle="Correction admin / support" />
          <CardBody className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <Input
                label="Nom complet"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
              <Input
                label="Téléphone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="flex justify-end">
              <Button
                variant="primary"
                onClick={saveProfile}
                loading={update.isPending}
              >
                <Save className="w-4 h-4" />
                Enregistrer
              </Button>
            </div>
          </CardBody>
        </Card>

        {/* Stats */}
        <Card>
          <CardHeader title="Activité" />
          <CardBody>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <dt className="text-xs text-neutral-500">Inscriptions</dt>
                <dd className="font-bold text-lg">{user.enrollments_count}</dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">Cours créés</dt>
                <dd className="font-bold text-lg">
                  {user.courses_created_count}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">Memberships</dt>
                <dd className="font-bold text-lg">
                  {user.memberships.length}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">Rôle plateforme</dt>
                <dd className="font-bold text-sm">{user.platform_role}</dd>
              </div>
            </dl>

            {user.memberships.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-neutral-500 mb-2">
                  Organisations :
                </p>
                <ul className="space-y-1">
                  {user.memberships.map((m, i) => (
                    <li key={i} className="text-sm">
                      Org #{m.organization_id} —{' '}
                      <Badge variant="neutral" size="xs">
                        {m.role}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </AdminShell>
  );
}
