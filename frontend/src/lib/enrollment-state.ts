/**
 * lib/enrollment-state.ts — Dérivation de l'état d'un apprenant sur un
 * cours (R18.2). Alimente les 5 CTA du bouton principal :
 *   1. GUEST         → S'inscrire pour commencer
 *   2. LOGGED_OUT_OF → S'inscrire au cours
 *   3. NEW_ENROLL    → Commencer le cours
 *   4. IN_PROGRESS   → Continuer le cours (X%)
 *   5. COMPLETED     → Revoir le cours + Télécharger le certificat
 */
import type { LearnerEnrollment } from '@/hooks/player';

export type CourseCTAState =
  | 'GUEST'
  | 'NOT_ENROLLED'
  | 'ENROLLED_NEW'
  | 'ENROLLED_IN_PROGRESS'
  | 'COMPLETED';

export interface CTADescriptor {
  state: CourseCTAState;
  primaryLabel: string;
  primaryHref: string | null; // null → declenche mutation enroll
  secondaryLabel?: string;
  secondaryHref?: string;
  progressPercent?: number;
  showCertificateButton?: boolean;
  isFree: boolean;
}

export function deriveCourseCTA(params: {
  isAuthed: boolean;
  enrollment: LearnerEnrollment | null;
  courseId: number;
  courseSlug: string;
  isFree: boolean;
  isCertifying: boolean;
}): CTADescriptor {
  const { isAuthed, enrollment, courseId, isFree, isCertifying } = params;

  const playerHref = `/learn/courses/${courseId}/player`;

  // 1. Visiteur non connecté
  if (!isAuthed) {
    return {
      state: 'GUEST',
      primaryLabel: isFree
        ? "S'inscrire pour commencer"
        : "S'inscrire au cours",
      primaryHref: null, // handleEnroll gérera la redirection vers /login
      isFree,
    };
  }

  // 2. Connecté mais pas inscrit
  if (!enrollment) {
    return {
      state: 'NOT_ENROLLED',
      primaryLabel: isFree ? "S'inscrire gratuitement" : "Acheter et s'inscrire",
      primaryHref: null,
      isFree,
    };
  }

  const progress = enrollment.progress_percent ?? 0;
  const completed = enrollment.status === 'COMPLETED' || progress >= 100;

  // 5. Terminé
  if (completed) {
    return {
      state: 'COMPLETED',
      primaryLabel: 'Revoir le cours',
      primaryHref: playerHref,
      showCertificateButton: isCertifying,
      secondaryLabel: isCertifying ? 'Télécharger le certificat' : undefined,
      secondaryHref: isCertifying ? '/learn/certificates' : undefined,
      progressPercent: 100,
      isFree,
    };
  }

  // 3. Inscrit jamais commencé
  if (progress === 0) {
    return {
      state: 'ENROLLED_NEW',
      primaryLabel: 'Commencer le cours',
      primaryHref: playerHref,
      progressPercent: 0,
      isFree,
    };
  }

  // 4. Inscrit avec progression
  return {
    state: 'ENROLLED_IN_PROGRESS',
    primaryLabel: `Continuer (${progress}%)`,
    primaryHref: playerHref,
    progressPercent: progress,
    isFree,
  };
}
