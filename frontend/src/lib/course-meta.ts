/**
 * lib/course-meta.ts — Helpers de dérivation d'attributs premium (R9.1).
 *
 * Le backend actuel ne remonte pas encore certains champs riches (niveau,
 * langue, videos_count, badges Best Seller / Nouveau / Promo, ancien_prix).
 * Ces helpers dérivent ces champs à partir des données existantes, ce qui
 * permet de livrer l'UI premium immédiatement, sans attendre R10 backend.
 */
import type {
  PublicCourseListItem,
  PublicCourseDetail,
  CourseType,
  BackendLevel,
} from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────
// Badges
// ─────────────────────────────────────────────────────────────────────

export type CourseBadge =
  | 'new'
  | 'best-seller'
  | 'promotion'
  | 'free'
  | 'certificate';

export interface BadgeLabel {
  id: CourseBadge;
  label: string;
  variant: 'success' | 'accent' | 'warning' | 'primary' | 'danger';
}

const BADGE_LABELS: Record<CourseBadge, BadgeLabel> = {
  new: { id: 'new', label: 'Nouveau', variant: 'accent' },
  'best-seller': { id: 'best-seller', label: 'Best Seller', variant: 'warning' },
  promotion: { id: 'promotion', label: 'Promotion', variant: 'danger' },
  free: { id: 'free', label: 'Gratuit', variant: 'success' },
  certificate: { id: 'certificate', label: 'Certificat', variant: 'primary' },
};

/**
 * Retourne les badges applicables à un cours.
 *
 * Règles :
 * - "Nouveau" : publié il y a < 30 jours
 * - "Best Seller" : enrolled_count >= 100
 * - "Gratuit" : pricing_type === 'FREE'
 * - "Promotion" : old_price présent (R10) ET promotion_until dans le futur
 * - "Certificat" : course_type === 'CERTIFIANTE'
 */
export function deriveBadges(
  course: Pick<
    PublicCourseListItem,
    'pricing_type' | 'course_type' | 'published_at' | 'enrolled_count'
  > & {
    old_price?: string | number | null;
    promotion_until?: string | null;
  },
): BadgeLabel[] {
  const out: BadgeLabel[] = [];
  if (course.pricing_type === 'FREE') out.push(BADGE_LABELS.free);

  // R10 : promo active seulement si old_price > 0 ET promotion_until non expirée
  if (course.old_price) {
    const promoActive =
      !course.promotion_until ||
      new Date(course.promotion_until).getTime() > Date.now();
    if (promoActive) out.push(BADGE_LABELS.promotion);
  }

  if (course.published_at) {
    const publishedMs = new Date(course.published_at).getTime();
    if (!isNaN(publishedMs)) {
      const days = (Date.now() - publishedMs) / (1000 * 60 * 60 * 24);
      if (days < 30) out.push(BADGE_LABELS.new);
    }
  }

  if ((course.enrolled_count ?? 0) >= 100) out.push(BADGE_LABELS['best-seller']);
  if (course.course_type === 'CERTIFIANTE') out.push(BADGE_LABELS.certificate);
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// Niveau (level)
// ─────────────────────────────────────────────────────────────────────

export type CourseLevel = 'Débutant' | 'Intermédiaire' | 'Avancé' | 'Tous niveaux';

const LEVEL_BY_TYPE: Record<CourseType, CourseLevel> = {
  CERTIFIANTE: 'Avancé',
  PROFESSIONNELLE: 'Intermédiaire',
  ACADEMIQUE: 'Tous niveaux',
  INTERNE: 'Tous niveaux',
};

const LEVEL_LABEL_BY_BACKEND: Record<BackendLevel, CourseLevel> = {
  BEGINNER: 'Débutant',
  INTERMEDIATE: 'Intermédiaire',
  ADVANCED: 'Avancé',
  ALL: 'Tous niveaux',
};

/**
 * R10 : signature étendue — accepte soit le vieux `courseType` seul
 * (fallback), soit un objet complet avec le champ `level` backend.
 * Priorité : champ backend > dérivation.
 */
export function deriveLevel(
  input: CourseType | { course_type: CourseType; level?: BackendLevel | null },
): CourseLevel {
  if (typeof input === 'string') {
    return LEVEL_BY_TYPE[input] ?? 'Tous niveaux';
  }
  if (input.level && input.level in LEVEL_LABEL_BY_BACKEND) {
    return LEVEL_LABEL_BY_BACKEND[input.level];
  }
  return LEVEL_BY_TYPE[input.course_type] ?? 'Tous niveaux';
}

// ─────────────────────────────────────────────────────────────────────
// Langue
// ─────────────────────────────────────────────────────────────────────

/**
 * R10 : priorité au champ backend `language` si présent (code ISO 639-1),
 * sinon fallback sur "Français".
 */
const LANGUAGE_LABELS: Record<string, string> = {
  fr: 'Français',
  en: 'Anglais',
  es: 'Espagnol',
  ar: 'Arabe',
  pt: 'Portugais',
  de: 'Allemand',
};

export function deriveLanguage(code?: string | null): string {
  if (!code) return 'Français';
  return LANGUAGE_LABELS[code.toLowerCase()] ?? code.toUpperCase();
}

// ─────────────────────────────────────────────────────────────────────
// Comptage vidéos vs leçons totales
// ─────────────────────────────────────────────────────────────────────

export function computeVideosCount(course: PublicCourseDetail): number {
  return course.sections.reduce(
    (sum, s) => sum + s.lessons.filter((l) => l.lesson_type === 'VIDEO').length,
    0,
  );
}

// ─────────────────────────────────────────────────────────────────────
// Formatage prix + promo
// ─────────────────────────────────────────────────────────────────────

export interface PriceDisplay {
  main: string;
  old?: string;
  discountPercent?: number;
  isFree: boolean;
}

export function derivePrice(
  course: Pick<PublicCourseListItem, 'pricing_type' | 'price' | 'currency'> & {
    old_price?: string | number | null;
  },
): PriceDisplay {
  const isFree = course.pricing_type === 'FREE';
  if (isFree) return { main: 'Gratuit', isFree: true };
  const price = Number(course.price) || 0;
  const oldPrice = course.old_price ? Number(course.old_price) : null;
  const main = new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: course.currency || 'XOF',
    maximumFractionDigits: 0,
  }).format(price);
  const out: PriceDisplay = { main, isFree: false };
  if (oldPrice && oldPrice > price) {
    out.old = new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: course.currency || 'XOF',
      maximumFractionDigits: 0,
    }).format(oldPrice);
    out.discountPercent = Math.round(((oldPrice - price) / oldPrice) * 100);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// Progression (client-side placeholder — R10 pour vraie donnée backend)
// ─────────────────────────────────────────────────────────────────────

/**
 * Mock : quand on aura la vraie liste des enrollments du user, on
 * lookera dessus. Pour l'instant on renvoie null (aucune progression).
 */
export function getCourseProgress(_courseId: number): number | null {
  return null;
}

// ─────────────────────────────────────────────────────────────────────
// Preferences motion (a11y)
// ─────────────────────────────────────────────────────────────────────

/**
 * Retourne true si l'utilisateur a activé prefers-reduced-motion.
 * À utiliser pour désactiver les animations Framer Motion coûteuses.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
