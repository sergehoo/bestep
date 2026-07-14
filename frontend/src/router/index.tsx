/**
 * src/router/index.tsx — React Router config (R3.2).
 *
 * Routes protégées via <ProtectedRoute> qui vérifie useIsAuthenticated().
 * Lazy loading via React.lazy pour code splitting.
 */
import { lazy, Suspense } from 'react';
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
  type RouteObject,
} from 'react-router-dom';
import { useIsAuthenticated, useIsPlatformAdmin, useAuthUser } from '@/stores/auth';
import { PageSpinner } from '@/components/ui/Spinner';
import { resolvePostLoginTarget } from '@/lib/auth-redirect';
import { RouteErrorElement } from '@/components/RouteErrorElement';
import { RootLayout } from '@/components/RootLayout';
import { DashboardResolver } from '@/components/DashboardResolver';

// Lazy pages (code-split)
const HomePage = lazy(() => import('@/pages/HomePage'));
// T7 — Landing publique B2B "Espace Entreprise"
const EnterprisePage = lazy(() => import('@/pages/EnterprisePage'));
const CatalogPage = lazy(() => import('@/pages/CatalogPage'));
const CourseDetailPage = lazy(() => import('@/pages/CourseDetailPage'));
const CertifyPage = lazy(() => import('@/pages/CertifyPage'));
const LoginPage = lazy(() => import('@/pages/LoginPage'));
const RegisterPage = lazy(() => import('@/pages/RegisterPage'));
// R5 : dashboards séparés (charts Recharts, filtres période)
const StudentDashboardPage = lazy(() => import('@/pages/StudentDashboardPage'));
const InstructorDashboardPage = lazy(() => import('@/pages/InstructorDashboardPage'));
const AdminDashboardPage = lazy(() => import('@/pages/AdminDashboardPage'));
// R6 : gestion cours instructor
const InstructorCoursesPage = lazy(() => import('@/pages/instructor/InstructorCoursesPage'));
const InstructorCourseNewPage = lazy(() => import('@/pages/instructor/InstructorCourseNewPage'));
const InstructorCourseEditPage = lazy(() => import('@/pages/instructor/InstructorCourseEditPage'));
// R13 : espace instructeur premium
const InstructorCockpitPage = lazy(() => import('@/pages/instructor/InstructorCockpitPage'));
// R16 : éditeur de leçon Tiptap
const InstructorLessonEditorPage = lazy(() => import('@/pages/instructor/InstructorLessonEditorPage'));
// R19 : éditeur de quiz + passage apprenant
const InstructorQuizEditorPage = lazy(() => import('@/pages/instructor/InstructorQuizEditorPage'));
const LearnerQuizPage = lazy(() => import('@/pages/learner/LearnerQuizPage'));
const InstructorStudentsPage = lazy(() => import('@/pages/instructor/InstructorStudentsPage'));
const InstructorRevenuePage = lazy(() => import('@/pages/instructor/InstructorRevenuePage'));
const InstructorReviewsPage = lazy(() => import('@/pages/instructor/InstructorReviewsPage'));
const InstructorReportsPage = lazy(() => import('@/pages/instructor/InstructorReportsPage'));
const InstructorProfilePublicPage = lazy(() => import('@/pages/instructor/InstructorProfilePublicPage'));
const InstructorSettingsPage = lazy(() => import('@/pages/instructor/InstructorSettingsPage'));
// R20 : Certificate Template Builder
const InstructorCertificateTemplatesPage = lazy(
  () => import('@/pages/instructor/InstructorCertificateTemplatesPage'),
);
// AI-P2 : Générateur de cours IA
const AICourseGeneratorPage = lazy(
  () => import('@/pages/instructor/AICourseGeneratorPage'),
);
// AI-P4 : Atelier des outils IA
const AIToolsPage = lazy(() => import('@/pages/AIToolsPage'));
// AI-P5 : Base de connaissances
const AIKnowledgeBasePage = lazy(() => import('@/pages/AIKnowledgeBasePage'));
// AI-P6 : Centre admin IA (super admin only)
const AIAdminCenterPage = lazy(() => import('@/pages/admin/AIAdminCenterPage'));
// R7 : admin plateforme
const AdminUsersPage = lazy(() => import('@/pages/admin/AdminUsersPage'));
const AdminUserDetailPage = lazy(() => import('@/pages/admin/AdminUserDetailPage'));
const AdminConfigPage = lazy(() => import('@/pages/admin/AdminConfigPage'));
// R27 : supervision des cours plateforme
const AdminCoursesPage = lazy(() => import('@/pages/admin/AdminCoursesPage'));
// R28 : audit + enrollments + placeholders
const AdminAuditLogPage = lazy(() => import('@/pages/admin/AdminAuditLogPage'));
// SECURITE-06 : Audit unifié des événements sécurité admin
const AdminSecurityAuditPage = lazy(
  () => import('@/pages/admin/AdminSecurityAuditPage'),
);
const AdminEnrollmentsPage = lazy(() => import('@/pages/admin/AdminEnrollmentsPage'));
// R30 : page instructeurs branchée (remplace le placeholder)
const AdminInstructorsPage = lazy(() => import('@/pages/admin/AdminInstructorsPage'));
// R31 : page organisations branchée
const AdminOrganizationsPage = lazy(() => import('@/pages/admin/AdminOrganizationsPage'));
// R32 : page modération branchée
const AdminModerationPage = lazy(() => import('@/pages/admin/AdminModerationPage'));
// R33 : page quiz plateforme branchée
const AdminQuizzesPage = lazy(() => import('@/pages/admin/AdminQuizzesPage'));
// R35 : page contenu pédagogique branchée
const AdminContentPage = lazy(() => import('@/pages/admin/AdminContentPage'));
// R37 : page paiements branchée
const AdminPaymentsPage = lazy(() => import('@/pages/admin/AdminPaymentsPage'));
// R38 : page marketing/coupons branchée
const AdminMarketingPage = lazy(() => import('@/pages/admin/AdminMarketingPage'));
// R39 : page rôles & permissions branchée
const AdminRolesPage = lazy(() => import('@/pages/admin/AdminRolesPage'));
// R40 : page support (MVP notifications) branchée
const AdminSupportPage = lazy(() => import('@/pages/admin/AdminSupportPage'));
// R41 : page commissions branchée
const AdminCommissionsPage = lazy(() => import('@/pages/admin/AdminCommissionsPage'));
// R42 : page reversements branchée
const AdminPayoutsPage = lazy(() => import('@/pages/admin/AdminPayoutsPage'));
// R43 : page rapports branchée
const AdminReportsPage = lazy(() => import('@/pages/admin/AdminReportsPage'));
// R44 : page paramètres avancés branchée
const AdminSettingsPage = lazy(() => import('@/pages/admin/AdminSettingsPage'));
// R31 : placeholder Organizations retiré, remplacé par AdminOrganizationsPage
// R39 : placeholder Roles remplacé par AdminRolesPage
// R35 : placeholder Content remplacé par AdminContentPage
// R33 : placeholder Quizzes remplacé par AdminQuizzesPage
// R37 : placeholder Payments remplacé par AdminPaymentsPage
// R41 : placeholder Commissions remplacé par AdminCommissionsPage
// R42 : placeholder Payouts remplacé par AdminPayoutsPage
// R38 : placeholder Marketing remplacé par AdminMarketingPage
// R32 : placeholder Moderation remplacé par AdminModerationPage
// R40 : placeholder Support remplacé par AdminSupportPage (MVP)
// R43 : placeholder Reports remplacé par AdminReportsPage
// R44 : placeholder Settings remplacé par AdminSettingsPage
// R12 : espace apprenant premium
const LearnerDashboardPage = lazy(() => import('@/pages/learner/LearnerDashboardPage'));
const LearnerCoursesPage = lazy(() => import('@/pages/learner/LearnerCoursesPage'));
// R14 : lecteur de cours apprenant
const LearnerCoursePlayerPage = lazy(() => import('@/pages/learner/LearnerCoursePlayerPage'));
const LearnerCertificatesPage = lazy(() => import('@/pages/learner/LearnerCertificatesPage'));
const LearnerBadgesPage = lazy(() => import('@/pages/learner/LearnerBadgesPage'));
const LearnerGoalsPage = lazy(() => import('@/pages/learner/LearnerGoalsPage'));
const LearnerFavoritesPage = lazy(() => import('@/pages/learner/LearnerFavoritesPage'));
const LearnerNotificationsPage = lazy(() => import('@/pages/learner/LearnerNotificationsPage'));
const LearnerHistoryPage = lazy(() => import('@/pages/learner/LearnerHistoryPage'));
const LearnerProfilePage = lazy(() => import('@/pages/learner/LearnerProfilePage'));
const LearnerMessagesPage = lazy(() => import('@/pages/learner/LearnerMessagesPage'));
// R24 — Onboarding apprenant + recommandations
const LearnerOnboardingPage = lazy(
  () => import('@/pages/onboarding/LearnerOnboardingPage'),
);
const RecommendedCoursesPage = lazy(
  () => import('@/pages/onboarding/RecommendedCoursesPage'),
);
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));
// SECURITE-05 — écrans transverses de sécurité
const VerifyEmailPage = lazy(() => import('@/pages/VerifyEmailPage'));
const InstructorPendingPage = lazy(() => import('@/pages/InstructorPendingPage'));
const AccountSuspendedPage = lazy(() => import('@/pages/AccountSuspendedPage'));

// ─────────────────────────────────────────────────────────────────────
// Guards
// ─────────────────────────────────────────────────────────────────────

/**
 * Guard racine : authentifié + actif + e-mail vérifié.
 * Les routes exemptées de la vérif e-mail (login, verify-email, resend) ne
 * DOIVENT PAS être enveloppées par ProtectedRoute.
 */
function ProtectedRoute({
  children,
  requireVerifiedEmail = true,
}: {
  children: React.ReactNode;
  requireVerifiedEmail?: boolean;
}) {
  const isAuthed = useIsAuthenticated();
  const user = useAuthUser();
  if (!isAuthed) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if (user?.is_active === false) {
    return <Navigate to="/account-suspended" replace />;
  }
  if (requireVerifiedEmail && user?.email_verified === false) {
    return <Navigate to="/verify-email" replace />;
  }
  return <>{children}</>;
}

function GuestOnlyRoute({ children }: { children: React.ReactNode }) {
  // Empêche un utilisateur connecté de voir login/register.
  const isAuthed = useIsAuthenticated();
  const user = useAuthUser();
  if (isAuthed && user) {
    // Redirection vers le dashboard approprié selon le rôle.
    const target = resolvePostLoginTarget(user.roles, user.is_platform_admin);
    return <Navigate to={target} replace />;
  }
  return <>{children}</>;
}

function AdminOnlyRoute({ children }: { children: React.ReactNode }) {
  const isAdmin = useIsPlatformAdmin();
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function InstructorOnlyRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthUser();
  const isAdmin = useIsPlatformAdmin();
  const isInstructor = !!user?.roles?.includes('instructor');
  if (!isInstructor && !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }
  // Formateur non approuvé → page d'attente (sauf admin bypass).
  if (!isAdmin && user?.approval_status === 'pending') {
    return <Navigate to="/instructor-pending" replace />;
  }
  return <>{children}</>;
}

/**
 * VerifiedEmailRoute — utilisé pour les routes qui exigent un e-mail vérifié
 * mais ne veulent pas nécessairement basculer sur le flow "protected+auth".
 * (En pratique ProtectedRoute couvre déjà ce besoin.)
 */
export function VerifiedEmailRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthUser();
  if (user?.email_verified === false) {
    return <Navigate to="/verify-email" replace />;
  }
  return <>{children}</>;
}

/**
 * RoleRoute — restreint une route à un ou plusieurs rôles.
 * Un ``platform_admin`` peut TOUJOURS accéder (bypass).
 */
export function RoleRoute({
  children,
  allow,
}: {
  children: React.ReactNode;
  allow: Array<'learner' | 'instructor' | 'org_admin' | 'platform_admin'>;
}) {
  const user = useAuthUser();
  const isAdmin = useIsPlatformAdmin();
  if (isAdmin) return <>{children}</>;
  const has = (user?.roles ?? []).some((r) => allow.includes(r as typeof allow[number]));
  if (!has) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

// resolvePostLoginTarget est exporté par @/lib/auth-redirect
// afin d'être réutilisé par la LoginPage (R23).

// ─────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────

/**
 * R29.2 — Décore récursivement chaque route avec un `errorElement` par
 * défaut si elle n'en a pas déjà un. Toute erreur JS non catchée ou 4xx
 * loader tombera sur `RouteErrorElement` au lieu de la page « Unexpected
 * Application Error » par défaut de React Router.
 */
function withErrorBoundary(routes: RouteObject[]): RouteObject[] {
  // RouteObject est une union (index vs non-index) — le spread littéral
  // casse la vérification stricte. On cast car on préserve la structure.
  return routes.map(
    (r) =>
      ({
        ...r,
        errorElement: r.errorElement ?? <RouteErrorElement />,
        ...(r.children
          ? { children: withErrorBoundary(r.children) }
          : {}),
      }) as RouteObject,
  );
}

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <RouteErrorElement />,
    children: withErrorBoundary([
  // ─── Public ─────────────────────────────────────────────
  {
    path: '/',
    element: (
      <Suspense fallback={<PageSpinner />}>
        <HomePage />
      </Suspense>
    ),
  },
  {
    path: '/catalogue',
    element: (
      <Suspense fallback={<PageSpinner />}>
        <CatalogPage />
      </Suspense>
    ),
  },
  // T7 — Landing publique B2B (CTA "Découvrir nos offres" de AudienceSpaces)
  {
    path: '/entreprise',
    element: (
      <Suspense fallback={<PageSpinner />}>
        <EnterprisePage />
      </Suspense>
    ),
  },
  {
    path: '/courses/:slug',
    element: (
      <Suspense fallback={<PageSpinner />}>
        <CourseDetailPage />
      </Suspense>
    ),
  },
  // R18 : page publique de vérification / téléchargement certificat
  {
    path: '/certify/:code',
    element: (
      <Suspense fallback={<PageSpinner />}>
        <CertifyPage />
      </Suspense>
    ),
  },

  // ─── Auth (guest only) ──────────────────────────────────
  {
    path: '/login',
    element: (
      <GuestOnlyRoute>
        <Suspense fallback={<PageSpinner />}>
          <LoginPage />
        </Suspense>
      </GuestOnlyRoute>
    ),
  },
  {
    path: '/register',
    element: (
      <GuestOnlyRoute>
        <Suspense fallback={<PageSpinner />}>
          <RegisterPage />
        </Suspense>
      </GuestOnlyRoute>
    ),
  },

  // ─── Espaces protégés ───────────────────────────────────
  // R12 : /dashboard alias vers /learn (nouvel espace apprenant premium)
  {
    path: '/dashboard',
    element: <DashboardResolver />,
  },
  // SECURITE-05 — écrans transverses (accessibles authentifiés sans vérif e-mail)
  {
    path: '/verify-email',
    element: (
      <Suspense fallback={<PageSpinner />}>
        <VerifyEmailPage />
      </Suspense>
    ),
  },
  {
    path: '/instructor-pending',
    element: (
      <ProtectedRoute requireVerifiedEmail={false}>
        <Suspense fallback={<PageSpinner />}>
          <InstructorPendingPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: '/account-suspended',
    element: (
      <Suspense fallback={<PageSpinner />}>
        <AccountSuspendedPage />
      </Suspense>
    ),
  },
  // R24 : onboarding apprenant
  {
    path: '/onboarding/learner',
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageSpinner />}>
          <LearnerOnboardingPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: '/recommended-courses',
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageSpinner />}>
          <RecommendedCoursesPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: '/learn',
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageSpinner />}>
          <LearnerDashboardPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: '/learn/courses',
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageSpinner />}>
          <LearnerCoursesPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  // R14 : lecteur de cours (ID numérique côté backend)
  {
    path: '/learn/courses/:id/player',
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageSpinner />}>
          <LearnerCoursePlayerPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: '/learn/certificates',
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageSpinner />}>
          <LearnerCertificatesPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: '/learn/badges',
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageSpinner />}>
          <LearnerBadgesPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: '/learn/goals',
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageSpinner />}>
          <LearnerGoalsPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: '/learn/favorites',
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageSpinner />}>
          <LearnerFavoritesPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: '/learn/notifications',
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageSpinner />}>
          <LearnerNotificationsPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: '/learn/history',
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageSpinner />}>
          <LearnerHistoryPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: '/learn/profile',
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageSpinner />}>
          <LearnerProfilePage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: '/learn/messages',
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageSpinner />}>
          <LearnerMessagesPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: '/learn/dashboard-classic',
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageSpinner />}>
          <StudentDashboardPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: '/dashboard/instructor',
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageSpinner />}>
          <InstructorDashboardPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: '/dashboard/admin',
    element: (
      <ProtectedRoute>
        <AdminOnlyRoute>
          <Suspense fallback={<PageSpinner />}>
            <AdminDashboardPage />
          </Suspense>
        </AdminOnlyRoute>
      </ProtectedRoute>
    ),
  },

  // ─── R6 + R13 : Espace instructor ──────────────────────
  {
    path: '/instructor',
    element: (
      <ProtectedRoute>
        <InstructorOnlyRoute>
          <Suspense fallback={<PageSpinner />}>
            <InstructorCockpitPage />
          </Suspense>
        </InstructorOnlyRoute>
      </ProtectedRoute>
    ),
  },
  {
    path: '/instructor/courses',
    element: (
      <ProtectedRoute>
        <InstructorOnlyRoute>
          <Suspense fallback={<PageSpinner />}>
            <InstructorCoursesPage />
          </Suspense>
        </InstructorOnlyRoute>
      </ProtectedRoute>
    ),
  },
  {
    path: '/instructor/students',
    element: (
      <ProtectedRoute>
        <InstructorOnlyRoute>
          <Suspense fallback={<PageSpinner />}>
            <InstructorStudentsPage />
          </Suspense>
        </InstructorOnlyRoute>
      </ProtectedRoute>
    ),
  },
  {
    path: '/instructor/revenue',
    element: (
      <ProtectedRoute>
        <InstructorOnlyRoute>
          <Suspense fallback={<PageSpinner />}>
            <InstructorRevenuePage />
          </Suspense>
        </InstructorOnlyRoute>
      </ProtectedRoute>
    ),
  },
  {
    path: '/instructor/reviews',
    element: (
      <ProtectedRoute>
        <InstructorOnlyRoute>
          <Suspense fallback={<PageSpinner />}>
            <InstructorReviewsPage />
          </Suspense>
        </InstructorOnlyRoute>
      </ProtectedRoute>
    ),
  },
  {
    path: '/instructor/reports',
    element: (
      <ProtectedRoute>
        <InstructorOnlyRoute>
          <Suspense fallback={<PageSpinner />}>
            <InstructorReportsPage />
          </Suspense>
        </InstructorOnlyRoute>
      </ProtectedRoute>
    ),
  },
  {
    path: '/instructor/profile-public',
    element: (
      <ProtectedRoute>
        <InstructorOnlyRoute>
          <Suspense fallback={<PageSpinner />}>
            <InstructorProfilePublicPage />
          </Suspense>
        </InstructorOnlyRoute>
      </ProtectedRoute>
    ),
  },
  // R20 : Certificate Template Builder
  {
    path: '/instructor/certificate-templates',
    element: (
      <ProtectedRoute>
        <InstructorOnlyRoute>
          <Suspense fallback={<PageSpinner />}>
            <InstructorCertificateTemplatesPage />
          </Suspense>
        </InstructorOnlyRoute>
      </ProtectedRoute>
    ),
  },
  // AI-P2 : Générateur de cours IA
  {
    path: '/instructor/ai/generate-course',
    element: (
      <ProtectedRoute>
        <InstructorOnlyRoute>
          <Suspense fallback={<PageSpinner />}>
            <AICourseGeneratorPage />
          </Suspense>
        </InstructorOnlyRoute>
      </ProtectedRoute>
    ),
  },
  // AI-P4 : Atelier des tools IA (instructor + admin)
  {
    path: '/ai/tools',
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageSpinner />}>
          <AIToolsPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  // AI-P5 : Base de connaissances (instructor + admin)
  {
    path: '/ai/knowledge',
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageSpinner />}>
          <AIKnowledgeBasePage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  // AI-P6 : Centre d'administration IA (platform_admin uniquement)
  {
    path: '/admin/ai',
    element: (
      <ProtectedRoute>
        <AdminOnlyRoute>
          <Suspense fallback={<PageSpinner />}>
            <AIAdminCenterPage />
          </Suspense>
        </AdminOnlyRoute>
      </ProtectedRoute>
    ),
  },
  {
    path: '/instructor/settings',
    element: (
      <ProtectedRoute>
        <InstructorOnlyRoute>
          <Suspense fallback={<PageSpinner />}>
            <InstructorSettingsPage />
          </Suspense>
        </InstructorOnlyRoute>
      </ProtectedRoute>
    ),
  },
  {
    path: '/instructor/courses/new',
    element: (
      <ProtectedRoute>
        <InstructorOnlyRoute>
          <Suspense fallback={<PageSpinner />}>
            <InstructorCourseNewPage />
          </Suspense>
        </InstructorOnlyRoute>
      </ProtectedRoute>
    ),
  },
  {
    path: '/instructor/courses/:id/edit',
    element: (
      <ProtectedRoute>
        <InstructorOnlyRoute>
          <Suspense fallback={<PageSpinner />}>
            <InstructorCourseEditPage />
          </Suspense>
        </InstructorOnlyRoute>
      </ProtectedRoute>
    ),
  },
  // R16 : éditeur de leçon riche
  {
    path: '/instructor/courses/:cid/lessons/:lid/edit',
    element: (
      <ProtectedRoute>
        <InstructorOnlyRoute>
          <Suspense fallback={<PageSpinner />}>
            <InstructorLessonEditorPage />
          </Suspense>
        </InstructorOnlyRoute>
      </ProtectedRoute>
    ),
  },
  // R19 : éditeur de quiz instructor
  {
    path: '/instructor/courses/:cid/quizzes/:qid',
    element: (
      <ProtectedRoute>
        <InstructorOnlyRoute>
          <Suspense fallback={<PageSpinner />}>
            <InstructorQuizEditorPage />
          </Suspense>
        </InstructorOnlyRoute>
      </ProtectedRoute>
    ),
  },
  // R19 : passage de quiz apprenant
  {
    path: '/learn/courses/:cid/sections/:sid/quiz',
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageSpinner />}>
          <LearnerQuizPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },

  // ─── R7 : Espace admin plateforme ─────────────────────
  {
    path: '/admin/users',
    element: (
      <ProtectedRoute>
        <AdminOnlyRoute>
          <Suspense fallback={<PageSpinner />}>
            <AdminUsersPage />
          </Suspense>
        </AdminOnlyRoute>
      </ProtectedRoute>
    ),
  },
  // R27 : supervision cours plateforme
  {
    path: '/admin/courses',
    element: (
      <ProtectedRoute>
        <AdminOnlyRoute>
          <Suspense fallback={<PageSpinner />}>
            <AdminCoursesPage />
          </Suspense>
        </AdminOnlyRoute>
      </ProtectedRoute>
    ),
  },
  // R28 : audit log
  {
    path: '/admin/audit',
    element: (
      <ProtectedRoute>
        <AdminOnlyRoute>
          <Suspense fallback={<PageSpinner />}>
            <AdminAuditLogPage />
          </Suspense>
        </AdminOnlyRoute>
      </ProtectedRoute>
    ),
  },
  // SECURITE-06 : audit sécurité unifié
  {
    path: '/admin/audit/security',
    element: (
      <ProtectedRoute>
        <AdminOnlyRoute>
          <Suspense fallback={<PageSpinner />}>
            <AdminSecurityAuditPage />
          </Suspense>
        </AdminOnlyRoute>
      </ProtectedRoute>
    ),
  },
  // R28 : inscriptions
  {
    path: '/admin/enrollments',
    element: (
      <ProtectedRoute>
        <AdminOnlyRoute>
          <Suspense fallback={<PageSpinner />}>
            <AdminEnrollmentsPage />
          </Suspense>
        </AdminOnlyRoute>
      </ProtectedRoute>
    ),
  },
  // R28 : placeholders honnêtes (modules WIP, backend R29+)
  ...[
    { path: '/admin/instructors', Component: AdminInstructorsPage },
    { path: '/admin/organizations', Component: AdminOrganizationsPage },
    { path: '/admin/roles', Component: AdminRolesPage },
    { path: '/admin/content', Component: AdminContentPage },
    { path: '/admin/quiz', Component: AdminQuizzesPage },
    { path: '/admin/payments', Component: AdminPaymentsPage },
    { path: '/admin/commissions', Component: AdminCommissionsPage },
    { path: '/admin/payouts', Component: AdminPayoutsPage },
    { path: '/admin/marketing', Component: AdminMarketingPage },
    { path: '/admin/moderation', Component: AdminModerationPage },
    { path: '/admin/support', Component: AdminSupportPage },
    { path: '/admin/reports', Component: AdminReportsPage },
    { path: '/admin/settings', Component: AdminSettingsPage },
  ].map(({ path, Component }) => ({
    path,
    element: (
      <ProtectedRoute>
        <AdminOnlyRoute>
          <Suspense fallback={<PageSpinner />}>
            <Component />
          </Suspense>
        </AdminOnlyRoute>
      </ProtectedRoute>
    ),
  })),
  {
    path: '/admin/users/:id',
    element: (
      <ProtectedRoute>
        <AdminOnlyRoute>
          <Suspense fallback={<PageSpinner />}>
            <AdminUserDetailPage />
          </Suspense>
        </AdminOnlyRoute>
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/config',
    element: (
      <ProtectedRoute>
        <AdminOnlyRoute>
          <Suspense fallback={<PageSpinner />}>
            <AdminConfigPage />
          </Suspense>
        </AdminOnlyRoute>
      </ProtectedRoute>
    ),
  },

  // ─── 404 ─────────────────────────────────────────────────
  {
    path: '*',
    element: (
      <Suspense fallback={<PageSpinner />}>
        <NotFoundPage />
      </Suspense>
    ),
  },
    ]),
  },
], {
  // Opt-in RR v7 future flags côté router — supprime les warnings console
  // et prépare la migration React Router 7 sans surprise.
  // (v7_startTransition vit sur RouterProvider, pas ici.)
  future: {
    v7_relativeSplatPath: true,
    v7_fetcherPersist: true,
    v7_normalizeFormMethod: true,
    v7_partialHydration: true,
    v7_skipActionErrorRevalidation: true,
  },
});

export function AppRouter() {
  return (
    <RouterProvider
      router={router}
      future={{ v7_startTransition: true }}
    />
  );
}
