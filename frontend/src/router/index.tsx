/**
 * src/router/index.tsx — React Router config (R3.2).
 *
 * Routes protégées via <ProtectedRoute> qui vérifie useIsAuthenticated().
 * Lazy loading via React.lazy pour code splitting.
 */
import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { useIsAuthenticated, useIsPlatformAdmin, useAuthUser } from '@/stores/auth';
import { PageSpinner } from '@/components/ui/Spinner';
import { resolvePostLoginTarget } from '@/lib/auth-redirect';

// Lazy pages (code-split)
const HomePage = lazy(() => import('@/pages/HomePage'));
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
// R7 : admin plateforme
const AdminUsersPage = lazy(() => import('@/pages/admin/AdminUsersPage'));
const AdminUserDetailPage = lazy(() => import('@/pages/admin/AdminUserDetailPage'));
const AdminConfigPage = lazy(() => import('@/pages/admin/AdminConfigPage'));
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

// ─────────────────────────────────────────────────────────────────────
// Guards
// ─────────────────────────────────────────────────────────────────────

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthed = useIsAuthenticated();
  if (!isAuthed) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
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
  return <>{children}</>;
}

// resolvePostLoginTarget est exporté par @/lib/auth-redirect
// afin d'être réutilisé par la LoginPage (R23).

// ─────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────

const router = createBrowserRouter([
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
    element: <Navigate to="/learn" replace />,
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
