# Frontend React — Guide setup Best Épargne

> Phase R3 : bootstrap complet du frontend React branché sur le backend
> Django (R1 JWT + R2 endpoints).

---

## Stack technique

| Couche | Choix | Rôle |
|---|---|---|
| Build tool | Vite 6 | Dev server ultra-rapide + build optimisé |
| Language | TypeScript 5.7 | Type safety + refactor safety |
| Framework | React 18.3 | SPA rendering |
| Router | React Router 6.28 | Routing + code splitting |
| CSS | Tailwind 3.4 | Utility-first, palette bleu/jaune sync backend |
| State | Zustand 5 | Auth store persisté localStorage |
| Data | TanStack Query 5 | Cache API + retry + refetch |
| HTTP | Axios 1.7 | Interceptors JWT + refresh auto |
| Forms | React Hook Form 7 + Zod | Validation typée |
| Icons | Lucide React | ~700 icônes SVG |

---

## Setup local (dev)

Prérequis : Node.js 20+, npm 10+.

```bash
# 1. Cloner le repo
cd /Users/ogahserge/Documents/best_epargne/frontend

# 2. Installer les dépendances
npm install

# 3. Copier + configurer l'env
cp .env.example .env.local
# Éditer VITE_API_URL selon votre backend :
#   Dev docker : VITE_API_URL=http://localhost:8000
#   Prod ayo   : VITE_API_URL=https://ayo-group.com

# 4. Lancer le dev server
npm run dev
# → http://localhost:5173

# 5. Vérifier que le backend est joignable
curl http://localhost:8000/api/docs/
```

---

## Coexistence avec le backend Django

Pendant la migration :

1. **Backend Django** continue de servir `/`, `/dashboard/*`, `/instructor/*`
   sur son domaine actuel (templates).
2. **Frontend React** vit sur `app.ayo-group.com` (sous-domaine) ou
   `/app/*` (path) et consomme uniquement `/api/*`.
3. Bascule progressive : quand le React est prêt pour un espace, on
   redirige les URLs Django vers le React.

**CORS backend** : ajouter le domaine frontend dans
`DJANGO_CORS_ALLOWED_ORIGINS` :

```bash
DJANGO_CORS_ALLOWED_ORIGINS=https://app.ayo-group.com,http://localhost:5173
```

---

## Architecture

### Auth flow

```
Login page      → useAuthStore.login({email, password})
                → POST /api/auth/login/
                → { access, refresh, user }
                → persist localStorage 'be-auth'
                → navigate('/dashboard')

Any API call    → Axios interceptor injecte Authorization: Bearer <access>
                → si 401 → refresh auto → retry
                → si refresh échoue → clear + redirect /login?next=

Logout          → useAuthStore.logout()
                → POST /api/auth/logout/ (blacklist refresh)
                → clear store + localStorage
```

### Data fetching

```
Page monte      → useQuery hook lance la requête
                → cache TanStack Query 30s
                → placeholderData pour transitions douces
                → refetch au focus fenêtre : DÉSACTIVÉ (choix perf)

Mutation        → useMutation.mutate(payload)
                → onSuccess : invalidateQueries (cache cohérent)
```

### Protected routes

```
<ProtectedRoute>
  Vérifie useIsAuthenticated()
  Si non authé → <Navigate to="/login?next=..." />
  Sinon rend children
</ProtectedRoute>

<GuestOnlyRoute>
  Empêche user connecté de voir /login /register.
  Si authé → redirige vers dashboard approprié (rôle-based).
</GuestOnlyRoute>
```

---

## Pages livrées (R3 → R6)

| Route | Composant | Statut |
|---|---|---|
| `/` | HomePage | ✅ Landing + cours populaires |
| `/catalogue` | CatalogPage | ✅ **R9** — Hero premium + sidebar sticky + drawer mobile + skeleton loaders + tri riche |
| `/courses/:slug` | CourseDetailPage | ✅ **R9** — Hero premium + sticky pricing + sticky nav + 6 sections (Présentation / Programme / Formateur / Avis / FAQ / Similaires) |
| `/login` | LoginPage | ✅ Form Zod + auth JWT |
| `/register` | RegisterPage | ✅ Form Zod + auth JWT |
| `/dashboard` | StudentDashboardPage | ✅ **R5** — KPI, continue, chart activité, enrollments |
| `/dashboard/instructor` | InstructorDashboardPage | ✅ **R5** — KPI, charts enroll/revenue, top 5 |
| `/dashboard/admin` | AdminDashboardPage | ✅ **R5** — 6 KPI, 3 charts, top 5 (admin only) |
| `/instructor/courses` | InstructorCoursesPage | ✅ **R6** — grille + filtres + CTA nouveau cours |
| `/instructor/courses/new` | InstructorCourseNewPage | ✅ **R6** — wizard 3 étapes (Bases/Détails/Résumé) |
| `/instructor/courses/:id/edit` | InstructorCourseEditPage | ✅ **R6** — tabs Métadonnées/Programme/Actions |
| `/admin/users` | AdminUsersPage | ✅ **R7** — liste paginée + filtres rôle/statut (admin only) |
| `/admin/users/:id` | AdminUserDetailPage | ✅ **R7** — édition + toggle actif / admin + reset password |
| `/admin/config` | AdminConfigPage | ✅ **R7** — snapshot config runtime lecture-seule |
| `*` | NotFoundPage | ✅ 404 |

### Composants ajoutés en R4 (`src/components/course/`)

| Composant | Rôle |
|---|---|
| `CourseCard` | Vignette cours réutilisable (catalogue, home, related) |
| `ReviewsList` | Liste paginée + tri (`recent` / `rating_high` / `rating_low`) |
| `ReviewsSummaryCard` | Widget moyenne + distribution 1-5 ★ |
| `RelatedCourses` | Grille de cours similaires (même catégorie, fallback populaires) |
| `LessonPreviewModal` | Aperçu gratuit d'une leçon `is_preview` : YouTube embed (no-cookie) ou `<video>` natif, Esc close, scroll lock |

### Hooks TanStack ajoutés en R4 (`src/hooks/queries.ts`)

```ts
useCourseReviews(slug, { ordering, page })        // paginé, staleTime 60s
useCourseReviewsSummary(slug)                     // staleTime 5min
useRelatedCourses(slug)                           // staleTime 5min
useLessonPreview(slug, lessonId)                  // staleTime 1h (contenu ~immuable)
```

### Composants ajoutés en R5 (`src/components/dashboard/`)

| Composant | Rôle |
|---|---|
| `DashboardShell` | Layout commun (header + PeriodSelector + slot main) |
| `KpiCard` | Tuile KPI (label + big number + icône + hint + accent color) |
| `PeriodSelector` | Segmented control 7d / 30d / 90d (ARIA `tablist`) |
| `TrendLineChart` | Recharts AreaChart avec gradient, tooltip fr-FR, `SeriesPoint[]` |
| `BarSeriesChart` | Recharts BarChart horizontal pour top listes |

Palette Recharts alignée sur le design system :
- `primary` → `#0284c7` (be-sky-600)
- `accent`  → `#eab308` (be-sun-500)
- `success` → `#059669` (emerald-600)

### Hooks dashboards R5 (avec période)

```ts
useStudentDashboard(period)       // '7d' | '30d' (défaut) | '90d'
useInstructorDashboard(period)    // idem
useAdminDashboard(period)         // idem — 403 si non-admin plateforme
```

Chaque hook renvoie maintenant `data.series` + (instructor/admin) `data.top_courses`
en plus des `kpis` initiaux. `placeholderData: prev` évite le flicker au changement
de période.

### Dépendance Recharts

Installer si pas encore fait :

```bash
cd frontend && npm install recharts
```

Version pinnée dans `package.json` → `^2.15.4`.

### Espace instructor (R6)

**Hooks dédiés** — `src/hooks/instructor.ts` :

```ts
useInstructorCourses(filters)         // GET /api/instructor/courses/ (q/status/pricing/course_type)
useInstructorCourseDetail(id)         // GET /api/apis/instructor/courses-private/:id/
useCreateInstructorCourse()           // POST /api/instructor/courses/create/
useUpdateInstructorCourse(id)         // PATCH /api/instructor/courses/:id/update/
useCourseLifecycle(id)                // POST publish|unpublish|archive|restore

useInstructorSections(courseId)       // GET /api/instructor/courses/:c/sections/
useCreateSection / Update / Delete    // ordre auto-incrémenté ; update accepte { title?, order? }

useInstructorLessons(courseId, sec)   // GET /api/instructor/courses/:c/sections/:s/lessons/
useCreateLesson / Update / Delete     // update accepte order pour réordonnancement swap
```

**Composants pages** — `src/pages/instructor/` :

| Fichier | Rôle |
|---|---|
| `InstructorCoursesPage.tsx` | Grille filtrable, badges statut, aperçu, CTA nouveau cours |
| `InstructorCourseNewPage.tsx` | Wizard 3 étapes (Zod + React Hook Form) |
| `InstructorCourseEditPage.tsx` | Header + 3 tabs (Métadonnées / Programme / Actions) |
| `CourseMetadataTab.tsx` | Édition titre/sous-titre/description/type/tarif/catégorie |
| `CourseCurriculumTab.tsx` | Sections + leçons CRUD + réordonner via ⬆⬇ + toggle preview |
| `CourseActionsTab.tsx` | Publier / Dépublier / Archiver / Restaurer |

**Backend patches R6** :

- `apis/serializers.py::CourseSerializer` — ajout du champ `category_id` (write-only, PK) pour permettre à la SPA de rattacher un cours à une catégorie via POST/PATCH.
- `apis/views.py::InstructorSectionUpdateView` / `InstructorLessonUpdateView` — accepte maintenant `order` (int) et effectue un **swap** avec la ressource voisine (idempotent, pas de collisions).

**Nav** — le `PublicHeader` affiche automatiquement "Mes cours" pour les
users qui ont `instructor` dans leur `roles`, et "Admin" pour les
`is_platform_admin`.

**Guard** — `InstructorOnlyRoute` protège les 3 routes `/instructor/*`
(redirect `/dashboard` si l'utilisateur n'est ni instructor ni admin
plateforme).

### Refonte UX/UI premium (R9)

**Dépendance ajoutée** : `framer-motion ^11.18` pour les micro-interactions.

**Helpers** — `src/lib/course-meta.ts` :

```ts
deriveBadges(course)          // Nouveau / Best Seller / Promotion / Gratuit / Certificat
deriveLevel(courseType)       // Débutant / Intermédiaire / Avancé / Tous niveaux
deriveLanguage()              // Français (par défaut, à raffiner en R10)
computeVideosCount(detail)    // Nombre de leçons type VIDEO
derivePrice(course)            // { main, old, discountPercent, isFree }
getCourseProgress(courseId)   // Placeholder pour progression apprenant
prefersReducedMotion()        // Respect a11y
```

**Composants premium** — `src/components/premium/` :

| Composant | Rôle |
|---|---|
| `RatingStars` | 5 étoiles avec fill fractionnel (0..5) + optional count |
| `StatsCounter` | Compteur 0→N animé (respect reduced-motion) |
| `ProgressBar` | Barre gradient primary / accent / success animée |
| `CoursePremiumCard` | Carte cours Udemy-like (badges + hover overlay + prix/promo) |
| `CourseCardSkeleton` | Placeholder pulse pendant le chargement |
| `CatalogHero` | Hero landing catalogue (search + stats animées) |
| `SidebarFilters` | Filtres catalogue (catégorie / niveau / prix / durée / note / certif) |
| `CourseHero` | Hero fiche cours (breadcrumb + meta enrichis + instructor) |
| `StickyPricingCard` | Sidebar prix sticky (achat + garantie + inclusions) |
| `StickySectionsNav` | Nav sticky des sections détail cours |
| `LearnGrid` | "Ce que vous apprendrez" avec dérivation depuis la description |
| `CurriculumAccordion` | Programme accordéon avec durée totale + preview per-lesson |
| `InstructorCard` | Formateur avec stats + bio |
| `FAQSection` | FAQ accordéon (contenu statique par défaut) |
| `RelatedCarousel` | Carrousel horizontal "Cours similaires" |

**A11y** — `src/index.css` :

- `:focus-visible` outline primary-600 (WCAG AA compatible)
- `@media (prefers-reduced-motion: reduce)` désactive globalement transitions et animations
- `scroll-mt-24` utility pour le scroll offset des sections avec la sticky nav
- `no-scrollbar` pour les carrousels tactiles

**Champs backend manquants dérivés côté client** :

- Niveau (`Débutant/Intermédiaire/Avancé`) — dérivé de `course_type`
- Langue (`fr` par défaut) — fixé, à exposer en R10
- Videos count — compté depuis `sections[].lessons[type=VIDEO]`
- Badges (Nouveau, Best Seller, Promotion, Gratuit, Certificat) — calculés depuis dates + counts
- `old_price` et `discount_percent` — champs optionnels, à ajouter en R10 backend

**Roadmap R10 (backend)** — pour lever les dérivations client :

- Ajouter `level`, `language`, `old_price`, `has_promotion_until`, `tags[]` sur `Course`
- Endpoint `GET /api/public/courses/:slug/faq/` pour FAQ personnalisée
- Enrichir `PublicInstructor` avec `bio`, `job_title`, `courses_count`

### Espace admin plateforme (R7)

**Backend** — nouveau module `best_epargne/apis/api_admin.py` :

| Endpoint | Auth | Description |
|---|---|---|
| `GET /api/admin/users/` | 🔒 admin | Liste paginée + filtres `q`, `role`, `is_active`, `page` |
| `GET /api/admin/users/:id/` | 🔒 admin | Détail + `enrollments_count`, `courses_created_count`, memberships |
| `PATCH /api/admin/users/:id/` | 🔒 admin | Update whitelisté : `is_active`, `platform_role`, `full_name`, `phone` |
| `POST /api/admin/users/:id/reset-password/` | 🔒 admin | Génère un token reset (support) |
| `GET /api/admin/config/` | 🔒 admin | Snapshot config runtime (app/features/limits/counts) |

**Anti-lockout** — un admin ne peut pas se désactiver lui-même ni se
rétrograder (`400 Bad Request` sur ces cas).

**Hooks dédiés** — `src/hooks/admin.ts` :

```ts
useAdminUsers(filters)            // Paginé, staleTime 30s
useAdminUserDetail(id)            // Détail complet
useUpdateAdminUser(id)            // PATCH whitelisté
useResetPasswordAdminUser()       // Génère token, expiration 2h
useAdminConfig()                  // Config plateforme
```

**Pages** — `src/pages/admin/` :

| Fichier | Rôle |
|---|---|
| `AdminUsersPage.tsx` | Table paginée + filtres q/role/is_active |
| `AdminUserDetailPage.tsx` | Toggle actif / admin + reset password + édit profil + stats |
| `AdminConfigPage.tsx` | 4 cards : App / Features / Limits / Population |

**Nav & guards** — le `PublicHeader` affiche "Users" en plus de "Admin"
pour les platform_admin. Les 3 routes `/admin/*` passent par
`AdminOnlyRoute` (redirect `/dashboard` sinon).

---

## Points d'attention

### Palette Tailwind

Miroir exact du backend Django (`best_epargne/tailwind.config.js`) :
- `primary-*` = `be-sky-*` (bleu marque)
- `accent-*` = `be-sun-*` (jaune)
- `neutral-*` = `be-ink-*` (gris)

Les alias `be-*` sont aussi disponibles pour compat.

### Types API

Les types TS de `src/lib/types.ts` sont le miroir des serializers DRF
(R1 + R2). Toute modification côté API impose une mise à jour de ces
types (ou génération auto via `openapi-typescript` — TODO R8).

### Sécurité JWT

- Access token en mémoire (store Zustand)
- Refresh token persisté localStorage
- Rotation des refresh tokens active côté backend (R1)
- Blacklist du précédent refresh (détection vol)

⚠️ **localStorage vs cookies httpOnly** : le choix actuel (localStorage)
est plus simple mais vulnérable à XSS. Pour la prod, considérer :
- Passer les refresh tokens en cookie httpOnly (nécessite adaptation
  côté backend : SIMPLE_JWT COOKIE middleware)
- Ou garder localStorage + CSP stricte (déjà en place P1)

---

## Commandes utiles

```bash
# Dev
npm run dev              # Vite dev server
npm run typecheck        # Vérifie les types TS

# Build
npm run build            # Build production → dist/
npm run preview          # Serve dist/ localement

# Quality
npm run lint             # ESLint

# Ajouter une dep
npm install <package>
npm install -D <package>  # devDependency
```

---

## Prochaines phases

- **R4** : ✅ CourseDetailPage tabs + reviews + related + modal preview.
  Reste optionnel : enrichir HomePage (témoignages, catégories mises en
  avant).
- **R5** : ✅ dashboards complets (Recharts, timeline activité, filtres
  7d/30d/90d, top courses).
- **R6** : ✅ Gestion cours instructor — liste + wizard création + éditeur
  tabs (métadonnées / programme / actions). Réordonnancement up/down.
  Upload thumbnail : reporté en R7 (nécessite intégration MinIO/media flow).
- **R7** : ✅ Admin plateforme — users (list/detail/edit/reset), config
  runtime lecture-seule. Audit log reporté (nécessite un modèle
  ``AdminAction`` dédié).
- **R8** : tests E2E Playwright + PWA (service worker cache offline) +
  CI/CD (GitHub Actions build + deploy Nginx)

---

## FAQ

**Q: Comment débugger les requêtes API ?**
A: TanStack Query Devtools (activé en dev, en bas de l'écran).

**Q: Le refresh JWT ne marche pas ?**
A: Vérifie que `refresh` est bien dans le localStorage `be-auth`.
Voir `lib/api.ts` → `performRefresh()`.

**Q: Comment gérer les erreurs formulaires ?**
A: React Hook Form + Zod. Voir `LoginPage.tsx` pour l'exemple type.

**Q: Ajouter un endpoint ?**
1. Ajouter le type dans `lib/types.ts`
2. Ajouter le hook dans `hooks/queries.ts`
3. Consommer dans la page

**Q: Comment tester en local avec le backend prod ?**
A: `VITE_API_URL=https://ayo-group.com` dans `.env.local` + le backend
doit avoir votre origin dans `DJANGO_CORS_ALLOWED_ORIGINS`.
