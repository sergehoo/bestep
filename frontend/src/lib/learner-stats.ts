/**
 * lib/learner-stats.ts — Dérivations gamification côté client (R12.2).
 *
 * Le backend ne remonte pas encore XP / niveau / streak / badges.
 * Ces helpers dérivent des valeurs plausibles depuis la série
 * `activity_minutes_per_day` renvoyée par /api/dashboard/student/,
 * afin de livrer l'UI premium sans attendre un modèle DB dédié.
 *
 * Tous les fallback renvoient 0 / [] safe si les données manquent.
 */
import type { StudentDashboardV5, SeriesPoint } from '@/lib/types';

// ─────────────────────────────────────────────────────────────
// Streak
// ─────────────────────────────────────────────────────────────

/**
 * Learning streak : nombre de jours consécutifs (en fin de série) avec
 * au moins 1 minute d'activité.
 */
export function computeStreak(series?: SeriesPoint[]): number {
  if (!series || series.length === 0) return 0;
  // Parcours de la fin vers le début : on compte tant que value > 0.
  let streak = 0;
  for (let i = series.length - 1; i >= 0; i--) {
    if ((series[i].value ?? 0) > 0) streak++;
    else break;
  }
  return streak;
}

/**
 * Temps d'apprentissage sur les 7 derniers jours (minutes).
 */
export function computeMinutesThisWeek(series?: SeriesPoint[]): number {
  if (!series || series.length === 0) return 0;
  const last7 = series.slice(-7);
  return last7.reduce((s, p) => s + (p.value ?? 0), 0);
}

// ─────────────────────────────────────────────────────────────
// XP + niveau
// ─────────────────────────────────────────────────────────────

/**
 * XP dérivé : 10 XP par cours complété + 1 XP par heure apprise +
 * 20 XP par certificat. À remplacer par un vrai compteur backend R13.
 */
export function computeXP(dashboard?: StudentDashboardV5): number {
  if (!dashboard) return 0;
  const completed = dashboard.kpis?.completed ?? 0;
  const totalHours = dashboard.kpis?.total_hours ?? 0;
  const certificates = dashboard.kpis?.certificates ?? 0;
  return Math.round(completed * 10 + totalHours * 1 + certificates * 20);
}

/** Niveau = 1 + floor(xp/100). Chaque niveau demande +100 XP. */
export function xpToLevel(xp: number): { level: number; progress: number; toNext: number } {
  const level = 1 + Math.floor(xp / 100);
  const progress = xp % 100;
  const toNext = 100 - progress;
  return { level, progress, toNext };
}

// ─────────────────────────────────────────────────────────────
// Badges (état statique + progression dérivée)
// ─────────────────────────────────────────────────────────────

export interface Badge {
  id: string;
  label: string;
  description: string;
  icon: string; // emoji pour éviter une dépendance visuelle
  earned: boolean;
  progress: number; // 0..1
}

/**
 * Génère la liste des badges avec leur état gagné/en-cours calculé
 * depuis les KPI du dashboard.
 */
export function computeBadges(dashboard?: StudentDashboardV5): Badge[] {
  const totalHours = dashboard?.kpis?.total_hours ?? 0;
  const completed = dashboard?.kpis?.completed ?? 0;
  const certificates = dashboard?.kpis?.certificates ?? 0;
  const inProgress = dashboard?.kpis?.in_progress ?? 0;
  const streak = computeStreak(dashboard?.series?.activity_minutes_per_day);

  return [
    {
      id: 'first-course',
      label: 'Premier cours',
      description: 'Rejoindre votre premier cours',
      icon: '🎓',
      earned: inProgress + completed >= 1,
      progress: Math.min(1, (inProgress + completed) / 1),
    },
    {
      id: 'first-certificate',
      label: 'Premier certificat',
      description: 'Obtenir votre premier certificat',
      icon: '🏆',
      earned: certificates >= 1,
      progress: Math.min(1, certificates / 1),
    },
    {
      id: '5h',
      label: '5h de lecture',
      description: 'Cumuler 5 heures d\'apprentissage',
      icon: '⏱️',
      earned: totalHours >= 5,
      progress: Math.min(1, totalHours / 5),
    },
    {
      id: '10h',
      label: '10h de lecture',
      description: 'Cumuler 10 heures d\'apprentissage',
      icon: '📚',
      earned: totalHours >= 10,
      progress: Math.min(1, totalHours / 10),
    },
    {
      id: 'streak-7',
      label: 'Assidu·e',
      description: '7 jours consécutifs',
      icon: '🔥',
      earned: streak >= 7,
      progress: Math.min(1, streak / 7),
    },
    {
      id: 'streak-30',
      label: '30 jours consécutifs',
      description: 'Un mois complet sans interruption',
      icon: '⚡',
      earned: streak >= 30,
      progress: Math.min(1, streak / 30),
    },
    {
      id: 'expert',
      label: 'Expert',
      description: 'Compléter 5 formations',
      icon: '🥇',
      earned: completed >= 5,
      progress: Math.min(1, completed / 5),
    },
    {
      id: 'top-learner',
      label: 'Top apprenant',
      description: '3 certificats obtenus',
      icon: '👑',
      earned: certificates >= 3,
      progress: Math.min(1, certificates / 3),
    },
  ];
}

// ─────────────────────────────────────────────────────────────
// Répartition par catégorie
// ─────────────────────────────────────────────────────────────

export interface CategoryShare {
  name: string;
  value: number;
}

/**
 * Répartition des enrollments par catégorie — utilisée pour le
 * PieChart du dashboard.
 */
export function computeCategoryShare(
  enrollments: StudentDashboardV5['recent_enrollments'] = [],
): CategoryShare[] {
  const map = new Map<string, number>();
  for (let i = 0; i < enrollments.length; i++) {
    const key = 'Général'; // pas exposé par le backend R2, valeur par défaut
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  // Fallback démo si complètement vide
  if (map.size === 0) return [];
  return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
}
