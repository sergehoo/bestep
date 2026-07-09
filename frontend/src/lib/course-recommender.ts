/**
 * lib/course-recommender.ts — R24.5
 *
 * Moteur de recommandation client-side simple mais extensible.
 * Score chaque cours en fonction du profil d'apprentissage :
 *   +30 par domaine matché (le domaine est mappé sur la catégorie du cours)
 *   +25 si le cours est certifiant et l'apprenant souhaite une certif
 *   +20 si le niveau du cours matche celui de l'apprenant
 *   +15 pour un cours gratuit (accès facilité)
 *   +10 pour un cours populaire (>500 enrollments)
 *   +10 pour une note ≥ 4.5
 *
 * On exclut les cours déjà suivis (via `enrolledIds`).
 * Le tri final est par score décroissant, puis note, puis popularité.
 */
import type { PublicCourseListItem, BackendLevel } from '@/lib/types';
import type {
  DerivedLearnerProfile,
  Domain,
  Level,
} from '@/stores/learner-profile';

// Mapping domaine apprenant → mots-clés catégorie backend
// (les slugs varient — on match sur le slug ou le nom en minuscules)
const DOMAIN_KEYWORDS: Record<Domain, string[]> = {
  business: ['business', 'gestion', 'entreprise'],
  finance: ['finance', 'bourse', 'investissement', 'epargne', 'épargne'],
  accounting: ['comptabilit', 'compta'],
  marketing: ['marketing', 'communication'],
  sales: ['vente', 'commercial'],
  it: ['informatique', 'it ', 'systeme', 'système'],
  webdev: ['web', 'developpement', 'développement', 'frontend', 'backend'],
  data_ai: ['data', 'ia', 'ai', 'intelligence artificielle', 'machine learning'],
  project: ['projet', 'agile', 'scrum', 'kanban'],
  leadership: ['leadership', 'management', 'manager'],
  languages: ['langue', 'anglais', 'francais', 'français', 'espagnol'],
  health: ['sante', 'santé', 'medical', 'médical'],
  law: ['droit', 'juridique', 'legal'],
  entrepreneurship: ['entrepreneur', 'startup', 'création'],
};

const LEARNER_LEVEL_TO_BACKEND: Record<Level, BackendLevel[]> = {
  beginner: ['BEGINNER', 'ALL'],
  intermediate: ['INTERMEDIATE', 'ALL'],
  advanced: ['ADVANCED', 'ALL'],
  expert: ['ADVANCED', 'ALL'], // pas de niveau expert côté backend
};

export interface RecommendationScore {
  course: PublicCourseListItem;
  score: number;
  reasons: string[];
}

interface Options {
  /** Ids des cours déjà suivis (à exclure). */
  enrolledIds?: Set<number>;
  /** Retourne au maximum N cours. */
  limit?: number;
}

export function recommendCourses(
  courses: PublicCourseListItem[],
  profile: DerivedLearnerProfile,
  learnerLevel: Level | null,
  learnerDomains: Domain[],
  opts: Options = {},
): RecommendationScore[] {
  const { enrolledIds, limit = 12 } = opts;

  const scored: RecommendationScore[] = [];

  for (const c of courses) {
    if (enrolledIds?.has(c.id)) continue;

    let score = 0;
    const reasons: string[] = [];

    // 1. Domaine (catégorie)
    if (learnerDomains.length > 0 && c.category) {
      const catText = `${c.category.slug ?? ''} ${c.category.name ?? ''}`.toLowerCase();
      const matchedDomain = learnerDomains.find((d) =>
        DOMAIN_KEYWORDS[d].some((kw) => catText.includes(kw)),
      );
      if (matchedDomain) {
        score += 30;
        reasons.push('Correspond à vos domaines d\'intérêt');
      }
    }

    // 2. Certification
    const isCertifying = c.course_type === 'CERTIFIANTE';
    if (isCertifying && profile.wantsCertification) {
      score += 25;
      reasons.push('Cours certifiant');
    }

    // 3. Niveau
    if (learnerLevel && c.level) {
      const allowed = LEARNER_LEVEL_TO_BACKEND[learnerLevel];
      if (allowed.includes(c.level)) {
        score += 20;
        reasons.push(`Adapté au niveau ${LEVEL_FR[learnerLevel]}`);
      }
    }

    // 4. Prix
    if (c.pricing_type === 'FREE') {
      score += 15;
      reasons.push('Cours gratuit');
    }

    // 5. Popularité
    if (c.enrolled_count && c.enrolled_count > 500) {
      score += 10;
      reasons.push('Cours populaire');
    }

    // 6. Note
    const rating = Number(c.rating_avg);
    if (!Number.isNaN(rating) && rating >= 4.5) {
      score += 10;
      reasons.push(`Excellente note (${rating.toFixed(1)})`);
    }

    // On garde tous les cours (score min 0). Le tri fera le reste.
    scored.push({ course: c, score, reasons });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ra = Number(a.course.rating_avg) || 0;
    const rb = Number(b.course.rating_avg) || 0;
    if (rb !== ra) return rb - ra;
    return (b.course.enrolled_count ?? 0) - (a.course.enrolled_count ?? 0);
  });

  return scored.slice(0, limit);
}

const LEVEL_FR: Record<Level, string> = {
  beginner: 'débutant',
  intermediate: 'intermédiaire',
  advanced: 'avancé',
  expert: 'professionnel',
};
