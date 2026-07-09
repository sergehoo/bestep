/**
 * InstructorProfilePublicPage.tsx — Profil marketplace instructeur (R13.6).
 *
 * Édition locale (persistée localStorage) en attendant l'API dédiée
 * `PATCH /api/auth/me/instructor-profile/` prévue en R14.
 */
import { useEffect, useState } from 'react';
import {
  User,
  Save,
  Linkedin,
  Twitter,
  Globe,
  Star,
  Users,
  BookOpen,
  Eye,
} from 'lucide-react';
import { InstructorShell } from '@/components/instructor/InstructorShell';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { useAuthUser } from '@/stores/auth';
import { useInstructorDashboard } from '@/hooks/queries';

interface PublicProfile {
  headline: string;
  bio: string;
  expertise: string[];
  website: string;
  linkedin: string;
  twitter: string;
  showRevenue: boolean;
}

const STORAGE_KEY = 'be-instructor-public';

const DEFAULT: PublicProfile = {
  headline: '',
  bio: '',
  expertise: [],
  website: '',
  linkedin: '',
  twitter: '',
  showRevenue: false,
};

function load(): PublicProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT, ...(JSON.parse(raw) as PublicProfile) } : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export default function InstructorProfilePublicPage() {
  const user = useAuthUser();
  const { data: dash } = useInstructorDashboard('30d');
  const [profile, setProfile] = useState<PublicProfile>(() => load());
  const [expertiseInput, setExpertiseInput] = useState('');
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } catch {
      /* ignore */
    }
  }, [profile]);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    setFlash('Profil enregistré localement.');
    setTimeout(() => setFlash(null), 2500);
  };

  const addExpertise = () => {
    const v = expertiseInput.trim();
    if (!v || profile.expertise.includes(v)) return;
    setProfile((p) => ({ ...p, expertise: [...p.expertise, v] }));
    setExpertiseInput('');
  };

  const removeExpertise = (v: string) => {
    setProfile((p) => ({
      ...p,
      expertise: p.expertise.filter((e) => e !== v),
    }));
  };

  return (
    <InstructorShell
      title="Profil public"
      subtitle="Ce que voient les apprenants dans le marketplace."
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        {/* Édition */}
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Vitrine formateur"
              subtitle="Ces informations apparaîtront sur votre profil public."
            />
            <CardBody>
              <form onSubmit={save} className="space-y-4">
                <Input
                  label="Titre professionnel"
                  placeholder="Ex : Analyste financière senior · BNP Paribas"
                  value={profile.headline}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, headline: e.target.value }))
                  }
                />
                <Textarea
                  label="Biographie"
                  rows={5}
                  placeholder="Racontez votre parcours, vos expertises et ce qui rend vos cours uniques…"
                  value={profile.bio}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, bio: e.target.value }))
                  }
                />

                <div>
                  <label className="text-xs font-bold text-neutral-700 uppercase tracking-wide mb-1.5 block">
                    Expertise
                  </label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {profile.expertise.map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => removeExpertise(e)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-primary-100 text-primary-700 hover:bg-primary-200"
                      >
                        {e}
                        <span aria-hidden>×</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={expertiseInput}
                      onChange={(e) => setExpertiseInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addExpertise();
                        }
                      }}
                      placeholder="Ajouter un domaine (ex : Bourse)"
                      className="flex-1 border border-neutral-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addExpertise}
                    >
                      Ajouter
                    </Button>
                  </div>
                </div>

                <div className="grid sm:grid-cols-3 gap-3">
                  <Input
                    label="Site web"
                    placeholder="https://…"
                    value={profile.website}
                    onChange={(e) =>
                      setProfile((p) => ({ ...p, website: e.target.value }))
                    }
                  />
                  <Input
                    label="LinkedIn"
                    placeholder="https://linkedin.com/in/…"
                    value={profile.linkedin}
                    onChange={(e) =>
                      setProfile((p) => ({
                        ...p,
                        linkedin: e.target.value,
                      }))
                    }
                  />
                  <Input
                    label="Twitter / X"
                    placeholder="@handle"
                    value={profile.twitter}
                    onChange={(e) =>
                      setProfile((p) => ({ ...p, twitter: e.target.value }))
                    }
                  />
                </div>

                <label className="flex items-start gap-2 p-3 rounded-xl border border-neutral-100 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={profile.showRevenue}
                    onChange={(e) =>
                      setProfile((p) => ({
                        ...p,
                        showRevenue: e.target.checked,
                      }))
                    }
                    className="mt-0.5 accent-primary-600"
                  />
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">
                      Afficher les revenus publiquement
                    </p>
                    <p className="text-xs text-neutral-500">
                      Certains formateurs mettent en avant leurs revenus pour
                      la crédibilité. Désactivé par défaut.
                    </p>
                  </div>
                </label>

                {flash && (
                  <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                    {flash}
                  </p>
                )}

                <div className="flex justify-end">
                  <Button type="submit" variant="primary">
                    <Save className="w-4 h-4" />
                    Enregistrer
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>

          <p className="text-xs text-neutral-400">
            💡 Les modifications sont enregistrées localement. La sync backend
            arrivera avec l'endpoint <code>/api/instructor/profile-public/</code>{' '}
            en R14.
          </p>
        </div>

        {/* Preview */}
        <div className="lg:sticky lg:top-24 self-start">
          <Card>
            <CardHeader
              title="Aperçu"
              subtitle="Vue apprenants"
              actions={<Eye className="w-5 h-5 text-neutral-400" aria-hidden />}
            />
            <CardBody>
              <div className="text-center">
                {user?.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt=""
                    className="w-20 h-20 rounded-full object-cover mx-auto"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full mx-auto bg-gradient-to-br from-primary-500 to-primary-700 text-white flex items-center justify-center font-extrabold text-2xl">
                    {(user?.full_name || user?.email || '?')
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                )}
                <p className="mt-3 font-extrabold text-neutral-900">
                  {user?.full_name || user?.email?.split('@')[0]}
                </p>
                {profile.headline && (
                  <p className="text-xs text-neutral-500 mt-1">
                    {profile.headline}
                  </p>
                )}
              </div>

              {profile.expertise.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-1 justify-center">
                  {profile.expertise.slice(0, 6).map((e) => (
                    <li
                      key={e}
                      className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary-100 text-primary-700"
                    >
                      {e}
                    </li>
                  ))}
                </ul>
              )}

              {profile.bio && (
                <p className="mt-3 text-xs text-neutral-600 leading-relaxed whitespace-pre-line line-clamp-6">
                  {profile.bio}
                </p>
              )}

              <dl className="mt-4 grid grid-cols-3 gap-2 text-center border-t border-neutral-100 pt-3">
                <PreviewStat
                  Icon={Star}
                  value={
                    dash?.kpis?.avg_rating
                      ? dash.kpis.avg_rating.toFixed(1)
                      : '—'
                  }
                  label="Note"
                />
                <PreviewStat
                  Icon={Users}
                  value={dash?.kpis?.total_enrollments ?? 0}
                  label="Étudiants"
                />
                <PreviewStat
                  Icon={BookOpen}
                  value={dash?.kpis?.published_courses ?? 0}
                  label="Cours"
                />
              </dl>

              {(profile.website || profile.linkedin || profile.twitter) && (
                <div className="mt-3 flex items-center justify-center gap-1.5 border-t border-neutral-100 pt-3">
                  {profile.website && (
                    <a
                      href={profile.website}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="p-2 rounded-lg hover:bg-neutral-100"
                      aria-label="Site web"
                    >
                      <Globe className="w-4 h-4 text-neutral-500" />
                    </a>
                  )}
                  {profile.linkedin && (
                    <a
                      href={profile.linkedin}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="p-2 rounded-lg hover:bg-neutral-100"
                      aria-label="LinkedIn"
                    >
                      <Linkedin className="w-4 h-4 text-neutral-500" />
                    </a>
                  )}
                  {profile.twitter && (
                    <a
                      href={
                        profile.twitter.startsWith('http')
                          ? profile.twitter
                          : `https://x.com/${profile.twitter.replace('@', '')}`
                      }
                      target="_blank"
                      rel="noreferrer noopener"
                      className="p-2 rounded-lg hover:bg-neutral-100"
                      aria-label="Twitter / X"
                    >
                      <Twitter className="w-4 h-4 text-neutral-500" />
                    </a>
                  )}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </InstructorShell>
  );
}

function PreviewStat({
  Icon,
  value,
  label,
}: {
  Icon: typeof User;
  value: number | string;
  label: string;
}) {
  return (
    <div>
      <div className="inline-flex items-center gap-1 text-neutral-900 font-bold text-sm">
        <Icon className="w-3 h-3" />
        {value}
      </div>
      <p className="text-[10px] text-neutral-500 uppercase tracking-wide">
        {label}
      </p>
    </div>
  );
}
