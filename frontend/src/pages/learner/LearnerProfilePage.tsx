/**
 * LearnerProfilePage.tsx — Profil apprenant (R12.5).
 *
 * 4 sections : Informations · Préférences · Sécurité · Sessions.
 * Persist local pour prefs. Backend /api/auth/me/ (déjà exposé R1).
 */
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Save, Shield, LogOut, KeyRound, Bell, Globe, Sun } from 'lucide-react';
import { LearnerShell } from '@/components/learner/LearnerShell';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { useAuthStore, useAuthUser } from '@/stores/auth';
import api from '@/lib/api';
import { extractApiError } from '@/lib/utils';

interface ProfileForm {
  full_name: string;
  phone: string;
  bio: string;
}

export default function LearnerProfilePage() {
  const user = useAuthUser();
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const [flash, setFlash] = useState<
    { kind: 'ok' | 'err'; msg: string } | null
  >(null);
  const [saving, setSaving] = useState(false);

  const { register, handleSubmit, reset, formState } = useForm<ProfileForm>({
    defaultValues: {
      full_name: user?.full_name ?? '',
      phone: user?.phone ?? '',
      bio: '',
    },
  });

  useEffect(() => {
    if (user) {
      reset({
        full_name: user.full_name ?? '',
        phone: user.phone ?? '',
        bio: '',
      });
    }
  }, [user, reset]);

  const onSubmit = async (v: ProfileForm) => {
    setFlash(null);
    setSaving(true);
    try {
      await api.patch('/auth/me/', {
        full_name: v.full_name,
        phone: v.phone,
      });
      await fetchMe();
      setFlash({ kind: 'ok', msg: 'Profil mis à jour.' });
    } catch (e) {
      setFlash({ kind: 'err', msg: extractApiError(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <LearnerShell
      title="Mon profil"
      subtitle="Gérez vos informations, préférences et sécurité."
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Colonne principale */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader
              title="Informations personnelles"
              subtitle="Ces informations sont affichées sur votre profil."
            />
            <CardBody>
              <form
                onSubmit={handleSubmit(onSubmit)}
                className="space-y-4"
              >
                <div className="flex items-center gap-4">
                  {user?.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt=""
                      className="w-20 h-20 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-2xl font-bold">
                      {(user?.full_name || user?.email || '?')
                        .charAt(0)
                        .toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-semibold">{user?.email}</p>
                    <p className="text-xs text-neutral-500">
                      Compte créé le{' '}
                      {user?.created_at
                        ? new Date(user.created_at).toLocaleDateString('fr-FR')
                        : '—'}
                    </p>
                  </div>
                </div>

                <Input
                  label="Nom complet"
                  required
                  {...register('full_name', { required: true })}
                  error={
                    formState.errors.full_name ? 'Nom requis' : undefined
                  }
                />
                <Input label="Téléphone" {...register('phone')} />
                <Textarea
                  label="Biographie"
                  rows={4}
                  {...register('bio')}
                  helper="La bio sera exposée aux formateurs (R13 backend)."
                />

                {flash && (
                  <p
                    className={
                      flash.kind === 'ok'
                        ? 'text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2'
                        : 'text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2'
                    }
                  >
                    {flash.msg}
                  </p>
                )}

                <div className="flex justify-end">
                  <Button
                    type="submit"
                    variant="primary"
                    loading={saving}
                  >
                    <Save className="w-4 h-4" />
                    Enregistrer
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Préférences" />
            <CardBody className="space-y-3">
              <PreferenceRow
                Icon={Sun}
                title="Thème"
                desc="Clair / Sombre / Système"
                right={
                  <select
                    className="text-sm border border-neutral-200 rounded-lg px-2 py-1 bg-white"
                    defaultValue={user?.preferences?.theme ?? 'system'}
                    disabled
                  >
                    <option value="system">Système</option>
                    <option value="light">Clair</option>
                    <option value="dark">Sombre</option>
                  </select>
                }
              />
              <PreferenceRow
                Icon={Globe}
                title="Langue"
                desc="Interface & contenus"
                right={
                  <select
                    className="text-sm border border-neutral-200 rounded-lg px-2 py-1 bg-white"
                    defaultValue={user?.preferences?.language ?? 'fr'}
                    disabled
                  >
                    <option value="fr">Français</option>
                    <option value="en">English</option>
                  </select>
                }
              />
              <PreferenceRow
                Icon={Bell}
                title="Notifications email"
                desc="Résumés hebdo, rappels de cours"
                right={
                  <input
                    type="checkbox"
                    defaultChecked={
                      user?.preferences?.notifications_email ?? true
                    }
                    className="accent-primary-600"
                    disabled
                  />
                }
              />
            </CardBody>
          </Card>
        </div>

        {/* Sidebar sécurité */}
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Sécurité"
              actions={
                <Shield className="w-5 h-5 text-emerald-500" aria-hidden />
              }
            />
            <CardBody className="space-y-3 text-sm">
              <div>
                <p className="font-semibold text-neutral-900">
                  Mot de passe
                </p>
                <p className="text-xs text-neutral-500 mb-2">
                  Changez-le régulièrement.
                </p>
                <Button variant="outline" size="sm">
                  <KeyRound className="w-3.5 h-3.5" />
                  Changer
                </Button>
              </div>
              <div className="pt-3 border-t border-neutral-100">
                <p className="font-semibold text-neutral-900">
                  Authentification 2FA
                </p>
                <p className="text-xs text-neutral-500 mb-2">
                  Bientôt disponible (R13).
                </p>
                <Button variant="outline" size="sm" disabled>
                  Activer 2FA
                </Button>
              </div>
              <div className="pt-3 border-t border-neutral-100">
                <p className="font-semibold text-neutral-900">
                  Sessions actives
                </p>
                <p className="text-xs text-neutral-500 mb-2">
                  Vous êtes connecté depuis ce navigateur.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => useAuthStore.getState().logout()}
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Déconnecter
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </LearnerShell>
  );
}

function PreferenceRow({
  Icon,
  title,
  desc,
  right,
}: {
  Icon: typeof Save;
  title: string;
  desc: string;
  right: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-neutral-100">
      <div className="w-9 h-9 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-neutral-900">{title}</p>
        <p className="text-xs text-neutral-500">{desc}</p>
      </div>
      {right}
    </div>
  );
}
