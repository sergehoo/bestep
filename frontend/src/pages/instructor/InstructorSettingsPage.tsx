/**
 * InstructorSettingsPage.tsx — Paramètres compte instructeur (R13.6).
 * Placeholder pour paiements/fiscalité/2FA/API — R14.
 */
import { Settings, Shield, CreditCard, Bell, Globe } from 'lucide-react';
import { InstructorShell } from '@/components/instructor/InstructorShell';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Link } from 'react-router-dom';

const SECTIONS = [
  {
    Icon: Settings,
    title: 'Profil & identité',
    desc: 'Informations personnelles, avatar, signature email.',
    href: '/learn/profile',
    label: 'Éditer',
  },
  {
    Icon: CreditCard,
    title: 'Paiements & fiscalité',
    desc: 'Compte bancaire ou mobile money, TVA, statut fiscal.',
    label: 'Bientôt (R14)',
    disabled: true,
  },
  {
    Icon: Shield,
    title: 'Sécurité',
    desc: 'Mot de passe, 2FA, sessions actives.',
    href: '/learn/profile',
    label: 'Gérer',
  },
  {
    Icon: Bell,
    title: 'Notifications',
    desc: 'Emails, push, résumés hebdo.',
    href: '/learn/profile',
    label: 'Préférences',
  },
  {
    Icon: Globe,
    title: 'Clés API',
    desc: 'Générer des clés pour intégrations externes.',
    label: 'Bientôt (R14)',
    disabled: true,
  },
];

export default function InstructorSettingsPage() {
  return (
    <InstructorShell
      title="Paramètres"
      subtitle="Compte, paiements, notifications et intégrations."
    >
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SECTIONS.map((s) => (
          <li key={s.title}>
            <Card>
              <CardHeader
                title={s.title}
                subtitle={s.desc}
                actions={<s.Icon className="w-5 h-5 text-neutral-400" aria-hidden />}
              />
              <CardBody>
                {s.href && !s.disabled ? (
                  <Link
                    to={s.href}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold bg-primary-600 text-white hover:bg-primary-700 transition"
                  >
                    {s.label}
                  </Link>
                ) : (
                  <button
                    disabled
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold border border-neutral-200 text-neutral-400 cursor-not-allowed"
                  >
                    {s.label}
                  </button>
                )}
              </CardBody>
            </Card>
          </li>
        ))}
      </ul>
    </InstructorShell>
  );
}
