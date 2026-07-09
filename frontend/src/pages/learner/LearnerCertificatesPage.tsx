/**
 * LearnerCertificatesPage.tsx — Certificats obtenus (R12.4 → R18.3).
 *
 * Source de vérité : `useLearnerEnrollments()` → enrollments avec
 * `status === 'COMPLETED'`. Un certificat est généré côté client à partir
 * du cours + user, imprimable via window.print (le user peut "Enregistrer
 * en PDF" via le dialog système).
 *
 * Le modèle backend `IssuedCertificate` existe mais l'endpoint d'exposition
 * dédié n'est pas encore livré (roadmap R19).
 */
import { Link } from 'react-router-dom';
import {
  Award,
  QrCode,
  Linkedin,
  MessageCircle,
  CheckCircle2,
  ExternalLink,
  Printer,
  Share2,
} from 'lucide-react';
import { LearnerShell } from '@/components/learner/LearnerShell';
import { Card, CardBody } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { useLearnerEnrollments, type LearnerEnrollment } from '@/hooks/player';
import { useAuthUser } from '@/stores/auth';

interface CertificateItem {
  id: string;
  code: string;
  courseTitle: string;
  courseSlug: string;
  courseId: number;
  issuedAt: string;
  skills: string[];
}

/** Génère un code de certificat déterministe à partir du couple user/course. */
function certificateCode(userId: number, enrollmentId: number): string {
  const base = `${userId}-${enrollmentId}`;
  const hash =
    Math.abs(
      base.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0),
    ) % 1_000_000;
  return `BE-${String(hash).padStart(6, '0')}-${enrollmentId}`;
}

function toCertificateItems(
  enrollments: LearnerEnrollment[],
  userId: number,
): CertificateItem[] {
  return enrollments
    .filter((e) => e.status === 'COMPLETED')
    .map((e) => ({
      id: `cert-${e.id}`,
      code: certificateCode(userId, e.id),
      courseTitle: e.course.title,
      courseSlug: e.course.slug,
      courseId: e.course.id,
      issuedAt: e.completed_at || e.updated_at || new Date().toISOString(),
      skills: ['Analyse', 'Application', 'Décision'],
    }));
}

export default function LearnerCertificatesPage() {
  const { data: enrollments, isLoading } = useLearnerEnrollments();
  const user = useAuthUser();

  const certificates =
    enrollments && user ? toCertificateItems(enrollments, user.id) : [];

  return (
    <LearnerShell
      title="Mes certificats"
      subtitle={
        certificates.length > 0
          ? `${certificates.length} certificat${certificates.length > 1 ? 's' : ''} obtenu${certificates.length > 1 ? 's' : ''}`
          : 'Complétez un cours certifiant pour recevoir votre premier certificat.'
      }
    >
      {isLoading && !enrollments ? (
        <div className="py-20 flex justify-center">
          <Spinner size="xl" label="Chargement…" />
        </div>
      ) : certificates.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {certificates.map((c) => (
            <CertificateCard key={c.id} cert={c} user={user} />
          ))}
        </div>
      )}
    </LearnerShell>
  );
}

// ─────────────────────────────────────────────────────────────

function CertificateCard({
  cert,
  user,
}: {
  cert: CertificateItem;
  user: ReturnType<typeof useAuthUser>;
}) {
  const verifyUrl = `${window.location.origin}/certify/${cert.code}`;

  const share = async (platform: 'linkedin' | 'whatsapp' | 'copy') => {
    if (platform === 'linkedin') {
      window.open(
        `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(verifyUrl)}`,
        '_blank',
        'noopener',
      );
    } else if (platform === 'whatsapp') {
      window.open(
        `https://wa.me/?text=${encodeURIComponent(
          `J'ai obtenu ce certificat sur BestÉpargne : ${verifyUrl}`,
        )}`,
        '_blank',
        'noopener',
      );
    } else {
      try {
        await navigator.clipboard.writeText(verifyUrl);
      } catch {
        /* ignore */
      }
    }
  };

  const printCertificate = () => {
    // Ouvre la page publique dans un nouvel onglet en mode print
    window.open(
      `/certify/${cert.code}?print=1`,
      '_blank',
      'noopener,noreferrer',
    );
  };

  return (
    <Card>
      <div className="relative aspect-[4/3] bg-gradient-to-br from-primary-700 via-primary-500 to-accent-400 p-5 text-white flex flex-col">
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-2 px-2 py-0.5 rounded-full bg-white/15 text-[10px] font-bold uppercase tracking-widest">
            <Award className="w-3 h-3" />
            Certificat
          </div>
          <div className="w-14 h-14 rounded-lg bg-white/15 backdrop-blur flex items-center justify-center">
            <QrCode className="w-8 h-8" />
          </div>
        </div>
        <div className="mt-auto">
          <p className="text-[10px] uppercase tracking-widest text-primary-100">
            Délivré à
          </p>
          <p className="text-lg font-extrabold truncate">
            {user?.full_name || user?.email || 'Apprenant·e'}
          </p>
          <p className="mt-2 text-[10px] uppercase tracking-widest text-primary-100">
            Formation
          </p>
          <p className="text-base font-bold line-clamp-2">
            {cert.courseTitle}
          </p>
        </div>
        <p className="absolute bottom-3 right-4 text-[10px] font-mono opacity-80">
          {cert.code}
        </p>
      </div>
      <CardBody>
        <p className="text-xs text-neutral-500">
          Obtenu le{' '}
          {new Date(cert.issuedAt).toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
        {cert.skills.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {cert.skills.slice(0, 4).map((s) => (
              <span
                key={s}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100"
              >
                <CheckCircle2 className="w-3 h-3" />
                {s}
              </span>
            ))}
          </div>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={printCertificate}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary-600 hover:bg-primary-700 text-white transition"
          >
            <Printer className="w-3.5 h-3.5" />
            Télécharger PDF
          </button>
          <Link
            to={`/certify/${cert.code}`}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-neutral-200 text-neutral-700 hover:bg-neutral-50 transition"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Vérifier
          </Link>
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => share('linkedin')}
            className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold border border-neutral-200 hover:bg-neutral-50"
          >
            <Linkedin className="w-3 h-3" />
            LinkedIn
          </button>
          <button
            type="button"
            onClick={() => share('whatsapp')}
            className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold border border-neutral-200 hover:bg-neutral-50"
          >
            <MessageCircle className="w-3 h-3" />
            WhatsApp
          </button>
          <button
            type="button"
            onClick={() => share('copy')}
            className="inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold border border-neutral-200 hover:bg-neutral-50"
            aria-label="Copier le lien"
          >
            <Share2 className="w-3 h-3" />
          </button>
        </div>
      </CardBody>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardBody className="text-center py-10">
        <Award className="w-10 h-10 text-neutral-300 mx-auto" />
        <p className="mt-3 text-lg font-bold text-neutral-900">
          Vous n'avez pas encore de certificat
        </p>
        <p className="mt-1 text-sm text-neutral-500">
          Terminez un cours certifiant à 100% pour recevoir votre certificat
          automatiquement, avec téléchargement PDF et lien de vérification.
        </p>
        <Link
          to="/catalogue"
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold transition"
        >
          Voir les cours certifiants
        </Link>
      </CardBody>
    </Card>
  );
}
