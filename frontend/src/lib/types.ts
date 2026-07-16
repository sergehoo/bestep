/**
 * src/lib/types.ts — Types partagés miroir du contract API R1+R2.
 * Voir docs/API_FRONTEND_CONTRACT.md pour la spec complète.
 */

// ─────────────────────────────────────────────────────────────────────
// Auth (R1)
// ─────────────────────────────────────────────────────────────────────

export type UserRole = 'learner' | 'instructor' | 'org_admin' | 'platform_admin';

export interface UserPreferences {
  theme: 'system' | 'light' | 'dark';
  language: 'fr' | 'en';
  notifications_email: boolean;
  notifications_marketing: boolean;
  notifications_course_reminders: boolean;
  public_profile: boolean;
}

/**
 * Profil métier normalisé exposé par ``/api/auth/me``.
 * Le champ ``type`` détermine le dashboard cible et les capacités UI.
 */
export type UserProfile =
  | { type: 'platform_admin' }
  | { type: 'instructor'; is_verified: boolean; headline?: string; payout_percent?: number | null }
  | { type: 'org_admin' }
  | { type: 'learner'; job_title?: string }
  | { type: 'unknown' };

/** État d'approbation d'un formateur (ou 'not_applicable' pour les autres rôles). */
export type ApprovalStatus = 'not_applicable' | 'pending' | 'approved';

export interface User {
  id: number;
  email: string;
  full_name: string;
  phone: string;
  avatar_url: string | null;
  roles: UserRole[];
  is_platform_admin: boolean;
  // Ajouté pour Best-AI T4 — le compte peut être désactivé par un admin.
  // Optionnel pour rétro-compat : absent = considéré actif côté frontend.
  is_active?: boolean;
  /** SECURITE-05 — vérification e-mail obligatoire pour toute action métier. */
  email_verified?: boolean;
  /** État d'approbation formateur ; ``not_applicable`` pour les non-formateurs. */
  approval_status?: ApprovalStatus;
  /** Profil métier normalisé (source de vérité pour le routage). */
  profile?: UserProfile;
  /** True si le user a rempli son onboarding métier (LearnerKYC, InstructorProfile validé, …). */
  onboarding_completed?: boolean;
  preferences: UserPreferences;
  created_at: string;
  last_login: string | null;
}

export interface AuthResponse {
  access: string;
  refresh: string;
  user: User;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
  /** Whitelist backend : learner | instructor | org_admin. */
  account_type?: 'learner' | 'instructor' | 'org_admin';
  /** Renseigné uniquement si account_type === 'org_admin'. */
  organization_name?: string;
}

// ─────────────────────────────────────────────────────────────────────
// Public API (R2)
// ─────────────────────────────────────────────────────────────────────

export type CourseStatus = 'DRAFT' | 'REVIEW' | 'PUBLISHED' | 'ARCHIVED';
export type CourseType = 'CERTIFIANTE' | 'PROFESSIONNELLE' | 'ACADEMIQUE' | 'INTERNE';
export type PricingType = 'FREE' | 'PAID' | 'HYBRID';

export interface PublicInstructor {
  id: number;
  full_name: string;
  avatar_url: string | null;
  // R10 — enrichissements
  bio?: string;
  job_title?: string;
  courses_count?: number;
  students_count?: number;
  avg_rating?: number;
}

// R10 — niveau côté API (canonical enum). L'UI transforme en libellé lisible.
export type BackendLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'ALL';

export interface PublicCategory {
  id: number;
  name: string;
  slug: string;
}

export interface PublicCourseListItem {
  id: number;
  title: string;
  slug: string;
  subtitle: string;
  thumbnail_url: string | null;
  category: PublicCategory | null;
  instructor: PublicInstructor | null;
  course_type: CourseType;
  pricing_type: PricingType;
  price: string;
  currency: string;
  published_at: string;
  enrolled_count: number;
  rating_avg: string;
  rating_count: number;
  // R10 — enrichissements (optional car les vieux clients pouvaient ne pas recevoir)
  level?: BackendLevel;
  language?: string;
  old_price?: string | null;
  promotion_until?: string | null;
}

export interface PublicLesson {
  id: number;
  title: string;
  order: number;
  lesson_type: string;
  is_preview: boolean;
  duration_sec: number;
}

export interface PublicCourseSection {
  id: number;
  title: string;
  order: number;
  lessons: PublicLesson[];
}

export interface PublicCourseDetail extends PublicCourseListItem {
  description: string;
  preview_video_url: string;
  sections: PublicCourseSection[];
  sections_count: number;
  lessons_count: number;
  total_duration_sec: number;
  // R10
  updated_at?: string;
}

// ─────────────────────────────────────────────────────────────────────
// Pagination DRF
// ─────────────────────────────────────────────────────────────────────

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// ─────────────────────────────────────────────────────────────────────
// Dashboards (R2.2)
// ─────────────────────────────────────────────────────────────────────

export interface StudentDashboard {
  kpis: {
    in_progress: number;
    completed: number;
    certificates: number;
    total_hours: number;
  };
  continue_enrollment: {
    id: number;
    status: string;
    enrolled_at: string;
    progress_percent: number;
    course: {
      id: number;
      slug: string;
      title: string;
      thumbnail_url: string | null;
    };
    current_lesson_id: number | null;
  } | null;
  recent_enrollments: Array<{
    id: number;
    status: string;
    enrolled_at: string;
    progress_percent: number;
    course: {
      id: number;
      slug: string;
      title: string;
      thumbnail_url: string | null;
    };
    current_lesson_id: number | null;
  }>;
}

export interface InstructorDashboard {
  kpis: {
    total_courses: number;
    published_courses: number;
    draft_courses: number;
    review_courses: number;
    archived_courses: number;
    total_enrollments: number;
    avg_rating: number;
    rating_count: number;
  };
  recent_courses: Array<{
    id: number;
    slug: string;
    title: string;
    status: CourseStatus;
    pricing_type: PricingType;
    price: string;
    currency: string;
    thumbnail_url: string | null;
    enrolled_count: number;
    rating_avg: number;
    rating_count: number;
    created_at: string;
    updated_at: string;
  }>;
}

export interface AdminDashboard {
  kpis: {
    users_total: number;
    users_active: number;
    courses_total: number;
    courses_published: number;
    courses_draft: number;
    courses_archived: number;
    enrollments_total: number;
    enrollments_active: number;
    enrollments_completed: number;
    revenue_total: number;
    payments_count: number;
  };
  top_courses: Array<{
    id: number;
    title: string;
    slug: string;
    enrolled_count: number;
    instructor_name: string;
  }>;
  generated_at: string;
}


// ─────────────────────────────────────────────────────────────────────
// R4 — Reviews + Related + Preview
// ─────────────────────────────────────────────────────────────────────

export interface PublicReview {
  id: number;
  rating: number;
  comment: string;
  user_name: string;
  created_at: string;
}

export interface ReviewsSummary {
  average: number;
  count: number;
  distribution: {
    '1': number;
    '2': number;
    '3': number;
    '4': number;
    '5': number;
  };
}

export interface LessonPreviewResponse {
  id: number;
  title: string;
  lesson_type: string;
  duration_sec: number;
  content: string;
  video_url: string;
}

export type ReviewsOrdering = 'recent' | 'rating_high' | 'rating_low';


// ─────────────────────────────────────────────────────────────────────
// R5 — Dashboards enrichis (timeseries)
// ─────────────────────────────────────────────────────────────────────

export type DashboardPeriod = '7d' | '30d' | '90d';

export interface SeriesPoint {
  date: string; // ISO date (yyyy-mm-dd)
  value: number;
}

export interface StudentDashboardSeries {
  period: string;
  activity_minutes_per_day: SeriesPoint[];
}

export interface InstructorDashboardSeries {
  period: string;
  enrollments_per_day: SeriesPoint[];
  revenue_per_day: SeriesPoint[];
}

export interface AdminDashboardSeries {
  period: string;
  new_users_per_day: SeriesPoint[];
  enrollments_per_day: SeriesPoint[];
  revenue_per_day: SeriesPoint[];
}

export interface InstructorTopCourse {
  id: number;
  slug: string;
  title: string;
  enrolled_count: number;
}

// Extension des dashboards existants R2 → R5
export interface StudentDashboardV5 extends StudentDashboard {
  series: StudentDashboardSeries;
}

export interface InstructorDashboardV5 extends InstructorDashboard {
  series: InstructorDashboardSeries;
  top_courses: InstructorTopCourse[];
}

export interface AdminDashboardV5 extends AdminDashboard {
  series: AdminDashboardSeries;
}


// ─────────────────────────────────────────────────────────────────────
// R6 — Instructor course CRUD
// ─────────────────────────────────────────────────────────────────────

/**
 * Types de leçons — miroir des choix backend
 * (voir `catalog.models.Lesson.LessonType`).
 */
export type LessonType = 'VIDEO' | 'TEXT' | 'FILE' | 'QUIZ' | 'LIVE';

/** Métadonnées d'affichage pour chaque type de leçon (label + description). */
export const LESSON_TYPE_META: Record<
  LessonType,
  { label: string; description: string }
> = {
  VIDEO: {
    label: 'Vidéo',
    description: "Cours vidéo (upload MinIO ou URL externe YouTube/Vimeo).",
  },
  TEXT: {
    label: 'Texte',
    description: 'Leçon rédigée dans l\'éditeur riche (Tiptap).',
  },
  FILE: {
    label: 'Fichier',
    description: 'PDF ou document téléchargeable.',
  },
  QUIZ: {
    label: 'Quiz',
    description: 'Évaluation à choix multiples avec score.',
  },
  LIVE: {
    label: 'Live',
    description: 'Session en direct planifiée.',
  },
};

export interface InstructorLesson {
  id: number;
  title: string;
  order: number;
  lesson_type: LessonType | string;
  is_preview: boolean;
  duration_sec: number;
  content: string;
  video_url: string;
  /** UX-04 — Media asset lié (renvoyé par LessonSerializer.media_asset).
   * Absent si aucun média attaché. Utilisé pour ré-hydrater le player
   * vidéo avec la vraie URL presignée à chaque chargement. */
  media_asset?: MediaAsset | null;
  /** T8 — Ressources externes téléchargeables (PDF, image, HTML, ZIP). */
  resources?: LessonResource[];
}

/** T8 — Ressource externe attachée à une leçon (PDF, JPG, HTML, ZIP…). */
export type LessonResourceKind = 'pdf' | 'image' | 'html' | 'zip' | 'other';
export interface LessonResource {
  id: number;
  title: string;
  kind: LessonResourceKind;
  size: number;
  size_human: string;
  content_type: string;
  order: number;
  is_downloadable: boolean;
  file_url: string;
  created_at: string;
  updated_at: string;
}

export interface InstructorSection {
  id: number;
  title: string;
  order: number;
  lessons: InstructorLesson[];
  lessons_count?: number;
}

export interface InstructorCourseListItem {
  id: number;
  title: string;
  slug: string;
  subtitle: string;
  description: string;
  status: CourseStatus;
  course_type: CourseType;
  pricing_type: PricingType;
  price: string;
  currency: string;
  published_at: string | null;
  thumbnail_url: string | null;
  preview_video_url: string;
  category: PublicCategory | null;
  sections_count: number;
  lessons_count: number;
  enrolled_count: number;
  rating_avg: number | null;
  rating_count: number;
  completion_rate: number;
  updated_at_human: string;
  can_edit: boolean;
  can_delete: boolean;
  scope: string;
  /** R20 — id du CertificateTemplate assigné (null = template par défaut). */
  certificate_template?: number | null;
}

export interface InstructorCourseCreatePayload {
  title: string;
  subtitle?: string;
  description?: string;
  course_type?: CourseType;
  pricing_type?: PricingType;
  price?: string | number;
  currency?: string;
  category_id?: number | null;
}

export type InstructorCourseUpdatePayload = Partial<InstructorCourseCreatePayload>;

export interface InstructorCourseFilters {
  q?: string;
  status?: CourseStatus | '';
  pricing?: PricingType | '';
  course_type?: CourseType | '';
}

export interface SectionCreatePayload {
  title: string;
}
export interface SectionUpdatePayload {
  title?: string;
  order?: number;
}

export interface LessonCreatePayload {
  title: string;
  lesson_type?: LessonType | string;
  is_preview?: boolean;
  duration_sec?: number;
  video_url?: string;
  content?: string;
  /** UX-04 — Référence UUID vers un MediaAsset de la médiathèque.
   * Le backend re-génère une URL presignée à chaque lecture, évitant
   * l'expiration du token S3 stocké dans video_url. */
  media_asset_id?: string | null;
}
export interface LessonUpdatePayload extends Partial<LessonCreatePayload> {
  order?: number;
}


// ─────────────────────────────────────────────────────────────────────
// R7 — Admin plateforme
// ─────────────────────────────────────────────────────────────────────

export type PlatformRole = 'USER' | 'PLATFORM_ADMIN';

export interface AdminUserMembership {
  organization_id: number;
  role: string;
}

export interface AdminUserListItem {
  id: number;
  email: string;
  full_name: string;
  phone: string;
  is_active: boolean;
  platform_role: PlatformRole;
  is_platform_admin: boolean;
  is_instructor: boolean;
  is_learner: boolean;
  has_organization: boolean;
  /** SECURITE-06 — null si non-formateur, sinon status de validation. */
  instructor_is_verified?: boolean | null;
  /** SECURITE-05 — flag unifié (natif + allauth). */
  email_verified?: boolean;
  date_joined: string | null;
  last_login: string | null;
}

export interface AdminUserDetail extends AdminUserListItem {
  memberships: AdminUserMembership[];
  enrollments_count: number;
  courses_created_count: number;
}

export interface AdminUserFilters {
  q?: string;
  role?: 'all' | 'admin' | 'instructor' | 'learner';
  is_active?: 'true' | 'false' | '';
  /** SECURITE-06 — filtre sur InstructorProfile.is_verified. */
  verified?: 'true' | 'false' | '';
  page?: number;
}

export interface AdminUserUpdatePayload {
  is_active?: boolean;
  platform_role?: PlatformRole;
  full_name?: string;
  phone?: string;
}

export interface AdminConfig {
  app: {
    name: string;
    environment: string;
    debug: boolean;
    timezone: string;
    language: string;
  };
  features: {
    jwt_enabled: boolean;
    cors_enabled: boolean;
    email_reset: boolean;
    media_backend: string;
  };
  limits: {
    jwt_access_lifetime_minutes: number;
    review_page_size_max: number;
    user_page_size_max: number;
  };
  counts: {
    users_total: number;
    users_active: number;
    users_admin: number;
  };
  generated_at: string;
}


// ─────────────────────────────────────────────────────────────────────
// R14 — Learner player + progression
// ─────────────────────────────────────────────────────────────────────

export interface PlayerLesson {
  id: number;
  title: string;
  lesson_type: string;
  duration_sec: number;
  duration_seconds?: number;
  is_preview: boolean;
  progress_percent: number;
  percent?: number;
  completed: boolean;
  is_completed?: boolean;
}

export interface PlayerQuizStatus {
  id: number;
  title: string;
  passing_score: number;
  max_attempts: number;
  questions_count: number;
  attempts_count: number;
  attempts_remaining: number;
  best_score: number;
  passed: boolean;
}

export interface PlayerSection {
  id: number;
  title: string;
  order: number;
  lessons: PlayerLesson[];
  /** R19.6 — Quiz de la section (null si aucun quiz actif attaché). */
  quiz?: PlayerQuizStatus | null;
}

export interface PlayerData {
  course: {
    id: number;
    title: string;
  };
  current_lesson_id: number | null;
  sections: PlayerSection[];
}

export interface LessonStateResponse {
  lesson: {
    id: number;
    title: string;
    lesson_type: string;
    duration_sec: number;
    video_url?: string;
    content?: string;
    is_preview?: boolean;
    /** T8 — Ressources externes téléchargeables (PDF, JPG, HTML, ZIP). */
    resources?: LessonResource[];
  };
  progress: {
    progress_percent: number;
    last_position_sec: number;
    completed: boolean;
  };
  navigation?: {
    previous_lesson_id: number | null;
    next_lesson_id: number | null;
  };
}

export interface CourseProgressResponse {
  course_id: number;
  progress_percent: number;
  completed_lessons: number;
  total_lessons: number;
  status?: string;
  completed_at?: string | null;
}

export interface LessonProgressUpdatePayload {
  percent?: number;
  last_position_sec?: number;
  last_position_seconds?: number;
  is_completed?: boolean;
}

export interface LessonProgressUpdateResponse {
  ok: true;
  lesson_id: number;
  progress: {
    percent: number;
    progress_percent: number;
    completed: boolean;
    is_completed: boolean;
    last_position_sec: number;
    last_position_seconds: number;
  };
  course_progress: CourseProgressResponse;
}


// ─────────────────────────────────────────────────────────────────────
// R16 — Media Library (MinIO)
// ─────────────────────────────────────────────────────────────────────

export type MediaKind = 'video' | 'audio' | 'doc';

export type MediaProcessingStatus = 'pending' | 'processing' | 'ready' | 'failed';

export interface MediaAsset {
  id: string; // UUID
  kind: MediaKind;
  title: string;
  content_type: string;
  size: number;
  duration_seconds: number | null;
  created_at: string;
  processing_status: MediaProcessingStatus;
  can_edit: boolean;
  can_delete: boolean;
  scope: 'personal' | 'organization';
  owner_name: string;
  /** Indique explicitement que le fichier peut être rendu comme une image. */
  is_image?: boolean;
  /** UX-01 — URL de la miniature (image extraite pour vidéo, aperçu pour doc). */
  thumbnail_url?: string;
  /** UX-01 — URL de streaming (vidéo/audio) ou visualisation (doc image). */
  preview_url?: string;
}
