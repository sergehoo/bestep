# Best Épargne — Statut projet (juillet 2026)

> Snapshot état global de la refonte. Dernière mise à jour : **R8 clôture**.

---

## Vue d'ensemble

| Macro-phase | Périmètre | Statut |
|---|---|---|
| **P1–P6** | Backend Django : refactoring, design system, permissions, perf, UX, tests/docs | ✅ Livré |
| **R1–R8** | Refonte React SPA + adaptation backend DRF/JWT | ✅ Livré |
| **R9**    | Refonte UX/UI premium Catalogue + Détail cours (Framer Motion) | ✅ Livré |

Stack finale :

- **Backend** : Django 4.2 · DRF · PostgreSQL 16 · Redis 7 · Celery · MinIO · JWT (`simplejwt`) · drf-spectacular
- **Frontend** : Vite 6 · React 18 · TypeScript 5.7 · Tailwind 3.4 · TanStack Query 5 · Zustand · React Hook Form + Zod · Recharts · Framer Motion 11 · Playwright · vite-plugin-pwa

---

## Phase R (refonte React) — détail

### R1 — JWT auth backend

- `simplejwt` : access 15 min, refresh 7 j, rotation + blacklist
- 8 endpoints `/api/auth/*` (register / login / refresh / logout / me / password change / reset / reset-confirm)
- Tests pytest 18 cas → ✅

### R2 — Endpoints DRF frontend-ready

- **Public** : `/api/public/{courses,courses/:slug,categories,courses/:slug/lessons/:id/preview}/`
- **Dashboards** : `/api/dashboard/{student,instructor,admin}/` avec KPIs agrégés
- **Enrollments** : `/api/enrollments/`
- Contract exhaustif documenté dans `docs/API_FRONTEND_CONTRACT.md`

### R3 — Bootstrap frontend

- 31 fichiers, ~2200 LOC
- Vite + TS + Tailwind + Router + Zustand + TanStack + Axios refresh race-safe
- Design system : Button / Card / Badge / Input / Spinner (miroir des classes `.be-*` Django)
- Pages livrées : Home, Catalog, CourseDetail, Login, Register, Dashboard placeholder, 404

### R4 — Enrichissement pages publiques

- 3 endpoints reviews + related
- Composants `CourseCard`, `ReviewsList`, `ReviewsSummaryCard`, `RelatedCourses`, `LessonPreviewModal`
- `CourseDetailPage` refondu en tabs (Programme / Avis / Similaires) + modal preview leçon YouTube-nocookie

### R5 — Dashboards enrichis

- Backend : query param `?period=7d|30d|90d`, séries temporelles (activity, enrollments, revenue, new_users)
- Frontend : `KpiCard`, `PeriodSelector`, `TrendLineChart`, `BarSeriesChart`, `DashboardShell`
- 3 pages dédiées : StudentDashboardPage, InstructorDashboardPage, AdminDashboardPage
- Recharts palette be-sky / be-sun / emerald

### R6 — Gestion cours instructor

- Backend : `category_id` write en serializer + `order` swap sur sections/lessons update
- 12 hooks TanStack (`hooks/instructor.ts`) : CRUD courses + lifecycle + sections + lessons
- Pages : liste filtrable, wizard création 3 étapes (Zod), éditeur tabs (métadonnées / programme / actions)
- Guard `InstructorOnlyRoute` (bypass admin)

### R7 — Admin plateforme

- Backend : `apis/api_admin.py` — users list/detail/PATCH + reset-password + config runtime
- Anti-lockout : refus auto-désactivation / auto-rétrogradation admin
- Pages : `/admin/users`, `/admin/users/:id`, `/admin/config`
- Guard `AdminOnlyRoute`, shortcuts dashboard

### R9 — Refonte UX/UI premium Catalogue + Détail cours

- **Catalogue** : hero avec search + 4 stats animées, sidebar sticky (filtres catégorie/niveau/prix/durée/note/certification), drawer mobile Framer Motion, grid responsive skeleton, tri riche (6 options), pagination
- **Détail cours** : hero premium (breadcrumb + meta enrichis + instructor + rating), sticky nav 6 sections, sticky pricing card (thumbnail play, ancien prix, promo %, garantie, inclusions), programme accordéon avec preview per-lesson
- **6 sections** : Présentation (LearnGrid dérivé), Programme (accordéon durée/type), Formateur (avatar + stats), Avis (distribution + liste paginée), FAQ (accordéon), Similaires (carrousel horizontal)
- **Design system** : 15 composants premium (`RatingStars`, `StatsCounter`, `ProgressBar`, `CoursePremiumCard`, `CourseCardSkeleton`, `CatalogHero`, `SidebarFilters`, `CourseHero`, `StickyPricingCard`, `StickySectionsNav`, `LearnGrid`, `CurriculumAccordion`, `InstructorCard`, `FAQSection`, `RelatedCarousel`)
- **A11y** : `:focus-visible`, `prefers-reduced-motion`, ARIA sur nav/carousels, contrastes WCAG AA
- **Helpers** : `lib/course-meta.ts` dérive badges / niveau / langue / prix / promo côté client, en attendant les champs backend R10

### R8 — Tests + PWA + CI/CD

- **Playwright** : suite smoke + auth ; config CI-friendly ; fixtures `createUser` + `seedAuth`
- **PWA** : `vite-plugin-pwa` autoUpdate, offline shell, runtime cache API/images, prompt update in-app
- **CI** : workflow `.github/workflows/frontend.yml` (typecheck + build + Playwright smoke) en plus du `ci.yml` backend existant
- **@types/node** installé → typecheck 100% propre (0 erreur)

---

## Métriques finales

| Indicateur | Valeur |
|---|---|
| Fichiers frontend R3→R8 | ~55 |
| LOC frontend (src/) | ~5 000 |
| Endpoints API `/api/*` | ~60 |
| Tests pytest backend | 48+ |
| Tests Playwright (smoke + auth) | 8 |
| Chunks JS après build | ~7 (react-vendor, query, forms, charts, per-page lazy) |
| Typecheck TS | 0 erreur ✅ |
| Syntaxe Python (fichiers modifiés) | 100% OK ✅ |

---

## Dette technique connue (à traiter en R9+)

- **P4.5** — split de `apis/views.py` (3500 LOC) en sous-modules — reporté (strangler-fig prévu)
- **Upload thumbnail** dans l'éditeur instructor — reporté R9 (nécessite flow MinIO présigné)
- **Audit log admin** — modèle `AdminAction` non créé (traçabilité GDPR)
- **Playwright** — élargir la suite (enroll, curriculum edit, admin actions) une fois la CI stable
- **Legacy Django templates** — coexistent encore ; à démonter après validation SPA en prod
- **openapi-typescript** — génération auto des types depuis le schéma OpenAPI (aujourd'hui écrits à la main)

---

## Références documents

- `docs/API_FRONTEND_CONTRACT.md` — contrat REST exhaustif (auth, public, dashboards, admin, instructor, enrollments)
- `docs/FRONTEND_SETUP.md` — setup local, architecture, pages, hooks, guards, nav
- `docs/RELEASE_NOTES.md` — journal des livraisons R1→R8
- `frontend/e2e/README.md` — lancer les tests Playwright
- `.github/workflows/ci.yml` — CI backend (lint + pytest + security)
- `.github/workflows/frontend.yml` — CI frontend (typecheck + build + Playwright)
