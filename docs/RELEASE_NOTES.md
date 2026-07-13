# Best Épargne — Release notes R1 → R8

Refonte React SPA + adaptation backend, livrée en 8 sous-phases.

---

## R1 — JWT authentication backend

Publié : bascule DRF authentification par tokens JWT (`simplejwt`), accès 15 min + refresh 7 j avec rotation et blacklist. 8 endpoints `/api/auth/*` couvrent register, login, refresh, logout, me, password change, reset et confirm. 18 tests pytest.

## R2 — API frontend-ready

Publié : endpoints publics unifiés sous `/api/public/*` (courses + categories + preview lesson), dashboards par rôle sous `/api/dashboard/{student,instructor,admin}/`, contract `docs/API_FRONTEND_CONTRACT.md` exhaustif (507 lignes).

## R3 — Bootstrap frontend React

Publié : projet Vite + TypeScript + Tailwind branché sur R1+R2. 31 fichiers, ~2 200 LOC. Design system aligné bleu/jaune sur le backend. Pages Home, Catalog, CourseDetail, Login, Register, Dashboard placeholder. Client Axios avec refresh JWT race-safe. Store Zustand persist localStorage.

## R4 — Pages publiques enrichies

Publié : 3 endpoints reviews + related sous `/api/public/courses/<slug>/…`. `CourseDetailPage` refondu en 3 tabs (Programme / Avis / Similaires) avec modal aperçu leçon YouTube-nocookie + `<video>` fallback. Composants `ReviewsList`, `ReviewsSummaryCard`, `RelatedCourses`, `CourseCard`, `LessonPreviewModal`.

## R5 — Dashboards enrichis

Publié : query param `?period=7d|30d|90d` sur les 3 dashboards backend, séries temporelles (activity, enrollments, revenue, new_users) avec gaps remplis à 0. 3 pages React dédiées (Student / Instructor / Admin) avec `KpiCard`, `PeriodSelector`, `TrendLineChart` (Recharts AreaChart gradient), `BarSeriesChart`, `DashboardShell`. Dépendance ajoutée : `recharts@2.15`.

## R6 — Gestion cours instructor

Publié : patch backend minimal (`category_id` write dans `CourseSerializer`, swap `order` sur update de sections/lessons). 12 hooks TanStack. Pages `/instructor/courses` (grille filtrable), `/instructor/courses/new` (wizard 3 étapes Zod), `/instructor/courses/:id/edit` (3 tabs — métadonnées / programme / actions). Réordonnancement sections + leçons via up/down. Guard `InstructorOnlyRoute` (bypass admin).

## R7 — Admin plateforme

Publié : module `apis/api_admin.py` (4 endpoints, ~256 LOC) — users list/detail/patch, reset-password, config runtime. Anti-lockout : refus de rétrograder ou désactiver son propre compte. Pages `/admin/users`, `/admin/users/:id`, `/admin/config` avec 4 hooks TanStack. Nav header : "Users" et "Admin" apparaissent pour `is_platform_admin`.

## R8 — Tests + PWA + CI/CD

Publié :

- **Playwright** — config CI-friendly (baseURL, retries, HTML reporter), fixtures `createUser` + `seedAuth`, 8 tests (smoke public + flow auth). `npm run e2e`, `npm run e2e:ui`, `npm run e2e:install`.
- **PWA** — `vite-plugin-pwa` autoUpdate, offline shell, runtime cache API/images, prompt update in-app (`PWAUpdatePrompt`). Manifest complet (icônes 192/512, maskable). Cache stratégies : NetworkFirst API publiques (5 min), CacheFirst images (30 j).
- **CI** — `.github/workflows/frontend.yml` (typecheck + build + Playwright smoke) en plus du `ci.yml` backend existant.
- **@types/node** ajouté → typecheck 100% propre (0 erreur sur ~55 fichiers frontend).

## R9 — Refonte premium landing catalog + course detail

Publié : refonte visuelle premium avec `framer-motion` et un système
de tokens design cohérent. Composants primitifs premium (Hero, Chip,
Card premium avec hover). `CatalogPage` refondu avec filtres et
animations. `CourseDetailPage` : Hero magistral + Sticky Pricing +
sections riches (À qui s'adresse ce cours / Ce que vous apprendrez /
Programme / Instructor / Avis / FAQ / Similaires). Micro-interactions
partout, responsive impeccable, a11y (focus-visible, aria labels).

## R10 — Enrichissement des données Course + branchement UI

Publié :

- **Backend (R10.1/R10.2)** — migration additive-safe qui ajoute 4 champs
  sur `catalog.Course` :
  - `level` (BEGINNER/INTERMEDIATE/ADVANCED)
  - `language` (str, défaut "fr")
  - `old_price` (DecimalField nullable — permet d'afficher un prix
    barré et le pourcentage de remise)
  - `promotion_until` (DateTimeField nullable — date d'expiration de
    la promo)
  Les serializers publics (`PublicCourseSerializer`,
  `PublicInstructorSerializer`) exposent ces nouveaux champs pour le
  front sans casser les vieux clients (optionnels).

- **Frontend (R10.3)** — types TypeScript enrichis (`level?`,
  `language?`, `old_price?`, `promotion_until?` sur `PublicCourse`).
  Les composants `CatalogPage`, `CourseDetailPage`, `CourseCard` et
  hero pricing utilisent maintenant les vrais champs backend au lieu
  de dérivations client-side hasardeuses. Badge "Débutant/Interm./
  Avancé" affiché à partir du champ `level`, prix barré avec % de
  remise calculé quand `old_price > price`, compte-à-rebours de
  promo à partir de `promotion_until`.

- **R10.5** — fix responsive : les hero cards et le sticky pricing
  s'empilent proprement en mobile (< sm), les stats KPI passent en
  grid 2 colonnes sur < md, les CTA ne débordent plus sur les
  très petits écrans.

Fichiers principaux : `catalog/migrations/00XX_course_level_language_
old_price_promotion_until.py`, `catalog/serializers.py`, `frontend/src/
lib/types.ts`, `frontend/src/pages/CatalogPage.tsx`, `frontend/src/
pages/CourseDetailPage.tsx`, `frontend/src/components/course/*`.

## R11-R19 — Espaces utilisateurs premium

Publié en 9 sous-lots (R11 → R19) : refonte complète des espaces
learner, instructor et lecteur de cours. Highlights :

- **R11** — Landing page premium avec Hero, StatsBar, Categories,
  CourseRows, WhyChooseUs, HowItWorks, Instructors, Testimonials,
  Partners, CTA final, Footer premium, Navbar enrichie + SEO helmet.
- **R12** — Espace apprenant complet : `LearnerShell` + sidebar,
  dashboard cockpit, mes formations (tabs), certificats, badges,
  objectifs, profil, favoris, notifications, historique.
- **R13** — Espace instructor : `InstructorShell`, dashboard cockpit,
  liste cours (toggle cards/table) + filtres avancés + actions rapides,
  gestion apprenants + risque d'abandon, revenus + avis, rapports
  export, profil public marketplace.
- **R14** — Lecteur de cours apprenant avec vraie progression,
  endpoint POST complete-lesson, sommaire + player + wire dashboard.
- **R15** — GlobalSearch dialog (Cmd+K), dropdowns premium
  (notifications, messages, user menu, theme, langue), PublicHeader
  refonte + MobileBottomNav.
- **R16** — Course builder Tiptap + dnd-kit + MediaLibrary + éditeur
  de leçon Tiptap + autosave + route preview + description WYSIWYG.
- **R17** — Reviews endpoints CRUD + ReviewForm (5 étoiles +
  commentaire) intégré dans CourseDetailPage.
- **R18** — Enrollment state 5 états (bouton adaptatif), certificats
  apprenant avec vraies données + PDF client.
- **R19** — Quiz complet : audit backend, types + hooks, QuizBuilder
  instructor (onglet + Ajouter quiz), QuizPlayer apprenant (passage +
  score), sommaire player avec quiz + verrouillage progression.

## R20 — Certificate Template Builder

Publié : enrichissement complet du modèle `CertificateTemplate` (~20 nouveaux
champs : style, orientation, palette couleurs, font, images, textes avec
variables `{{student_name}}` etc., options d'affichage, portée) + FK
optionnel `Course.certificate_template`. Deux migrations additives-safe
(`certifications/0004_certificate_template_builder`,
`catalog/0013_course_certificate_template`) + data-migration `0005` qui
seed 7 presets globaux (Classique / Moderne / Premium / Académique /
Entreprise / Minimaliste / Luxe).

Endpoints DRF `/api/instructor/certificate-templates/` (GET liste, POST
créer, GET/PATCH/DELETE `<id>`, POST `<id>/duplicate/`). Filtre `?style`.
Permissions : templates visibles = owner + publics + presets globaux ;
écriture réservée à l'owner ou platform_admin. `CourseSerializer` accepte
`certificate_template` en écriture avec validation de visibilité.

Frontend : hook `useCertificateTemplates`, `useCreate/Update/Delete/Duplicate`
et `useAssignCourseCertificateTemplate` (branché sur PATCH course update).
Composant `CertificatePreview` réutilisable (7 styles visuels, respect
orientation A4). Page `/instructor/certificate-templates` (liste
filtrable + éditeur avec preview live, palette couleurs, insertion de
variables dynamiques, options QR/serial/date). Section "Certification"
dans `CourseMetadataTab` (radio de sélection + preview + link vers l'éditeur).
`CertifyPage` refondue pour rendre via `CertificatePreview` avec fallback
local (template classique) si l'utilisateur n'est pas authentifié.

Roadmap R21 (documenté) : éditeur DnD complet type Canva/Certifier
(Konva.js/Fabric.js), génération PDF server-side (Weasyprint), endpoint
public `/api/public/certificates/<code>/` renvoyant `{template, student_name,
course_title, issued_at}` pour la vérification.

## R23 — Refonte page de connexion

Publié : `LoginPage` refondu en split-screen premium (panel gauche
gradient primary→accent avec value props + testimonial ; panel droite
formulaire premium). Toggle password, remember-me (persiste l'email
seulement), lien mot de passe oublié, bouton loading, erreurs
identifiants + détection compte désactivé (bannière ambre + renvoi
d'email d'activation). Boutons connexion sociale (Google, LinkedIn,
Microsoft) désactivés tant que `VITE_OAUTH_*_CLIENT_ID` non configurés.
3 chips persona vers `/register?role=…`.

Extraction de `resolvePostLoginTarget` + `sanitizeNextTarget` dans
`lib/auth-redirect.ts` — helper partagé entre router et LoginPage.
Support `?next=<path>` avec anti open-redirect. Dark mode compatible.

## R24 — Inscription premium + Onboarding apprenant + Recommandations

Publié : parcours complet post-inscription en 7 sous-tâches.

**RegisterPage refonte** — split-screen cohérent avec LoginPage, account
type selector (Apprenant / Formateur / Organisation) avec champs
dynamiques (`organization_name` conditionnel), validation Zod stricte
(password ≥ 8 avec lettres+chiffres, confirmation obligatoire, CGU),
barre de force du mot de passe temps réel, redirection intelligente
selon le type de compte (learner → onboarding, instructor → cockpit +
bandeau pending, org → cockpit + bandeau org).

**LearnerOnboarding** — wizard progressif 6 étapes (objectif, domaines,
niveau, disponibilité, styles, certification), sauvegarde auto via
Zustand persist `be-learner-profile`, reprise à tout moment. Génération
d'un archétype (7 profils : débutant certif, reconversion, autonome
avancé, entreprise, examen…) + score de maturité 0-100 + tags.

**Recommandations personnalisées** — page `/recommended-courses` avec
moteur client-side (`lib/course-recommender.ts`) qui score chaque cours
(+30 par domaine matché, +25 certif si souhaité, +20 niveau match, +15
gratuit, +10 popularité, +10 note haute), exclut les cours suivis,
affiche raisons + score de reco. `CourseRecommendationCard` premium
avec badges + CTA "S'inscrire".

**Intégration dashboard** — `OnboardingBanner` affiché sur
`LearnerDashboardPage` tant que l'onboarding n'est pas complété (ni
dismissed) avec CTA reprise + step courant. `LearnerProfileSummary`
(archétype, score ring, chips domaines/styles) + bouton "Modifier mon
profil d'apprentissage".

Roadmap R25+ documentée : endpoint backend `/api/learner/profile/`,
moteur IA server-side, activation instructor/org par admin, onboarding
dédié formateur/organisation.

## R25 — Production Readiness

Publié : durcissement et documentation complète pour la mise en production.

**Backend `settings/prod.py`** — nouveaux garde-fous : `DEBUG_PROPAGATE_EXCEPTIONS=False`,
`DATA_UPLOAD_MAX_MEMORY_SIZE` (10 Mo par défaut, override env), `FILE_UPLOAD_MAX_MEMORY_SIZE`,
`DATA_UPLOAD_MAX_NUMBER_FIELDS`, `CONN_HEALTH_CHECKS=True` sur PostgreSQL
(Django 4.1+, détecte les connexions mortes avant réutilisation), intégration
Sentry optionnelle (Django + Celery + Redis) activée automatiquement si
`SENTRY_DSN` est défini, avec `send_default_pii=False` pour la RGPD.

**Configuration** — `.env.example` racine listant toutes les variables prod
requises (Django core, DB, Redis, MinIO, email SMTP, HSTS, upload limits,
Sentry). `frontend/.env.production.example` avec `VITE_API_URL`,
`VITE_SENTRY_DSN`, feature flags OAuth.

**Build frontend** — `vite.config.ts` optimisé pour la prod : sourcemaps
configurables via `VITE_BUILD_SOURCEMAP` (défaut `hidden` pour upload
Sentry sans exposer publiquement), CSS minification esbuild, chunk
splitting enrichi (framer-motion + tiptap séparés), `reportCompressedSize:false`
pour accélérer la CI.

**Documentation** — `docs/PRODUCTION_CHECKLIST.md` (15 sections coche par
coche : secrets, DNS/SSL, DB, Redis, MinIO, emails, Django, SPA, sécurité
HTTP, observabilité, CI/CD, contenu initial, RGPD, rollback, post-deploy)
et `docs/DEPLOY.md` (runbook exécution : preparer release, preflight,
backup DB, deploy Docker Compose ou Systemd, smoke test, rollback).

**Outillage** — `deploy/preflight.sh` (bash) qui vérifie les 7 pré-requis
critiques avant chaque déploiement : variables d'environnement définies,
`SECRET_KEY` non-placeholder, PostgreSQL joignable, Redis répond PONG,
migrations pending, `check --deploy` sans erreur, bundle `dist/` présent,
`.env` bien ignoré par git. Exit code non-zéro bloque le deploy.

Roadmap R26+ non couvert : rate-limiting sur endpoints auth
(`django-ratelimit`), Content-Security-Policy explicite au reverse-proxy,
métriques Prometheus, OAuth Google/LinkedIn/Microsoft (variables d'env
déjà prêtes côté front R23).

## R26 — Bascule SPA React remplace HTML Django

Publié : le frontend historique Django (`HomeView`, `/catalog/`,
`/dashboard/…`) est remplacé en production par la SPA React. L'exposition
Traefik du container Django (`bestweb`) est retirée au profit d'un
nouveau container **`bestfront`** (nginx-alpine multi-stage) qui devient
le point d'entrée public.

**Nouveaux fichiers**
- `frontend/Dockerfile` — build multi-stage `node:20-alpine` (typecheck +
  `npm run build`) puis `nginx:1.27-alpine` avec le bundle.
- `frontend/nginx.conf` — SPA fallback (`try_files … /index.html`), reverse
  proxy `/api/`, `/admin/`, `/media/`, `/static/` vers `upstream django_backend`
  (bestweb:8000), cache long pour `/assets/*` (hashés Vite immutables),
  no-cache pour `sw.js`/`index.html`, `client_max_body_size 12M` cohérent
  avec les upload limits Django, endpoint `/healthz` interne.

**`docker-compose.yml`**
- Nouveau service `bestfront` avec labels Traefik host `${APP_HOST}`,
  middlewares HSTS + compression, healthcheck HTTP.
- `bestweb` perd ses labels Traefik (`traefik.enable=false`) et son
  network `proxy` (network `internal` uniquement).
- Toutes les variables `VITE_*` sont passées en build-args au container
  frontend (VITE_API_URL, VITE_SENTRY_DSN, VITE_OAUTH_*).

**Django `urls.py`** — commentaire de contrat clarifie que les vues HTML
sont conservées pour ne pas casser les `reverse()` internes (emails,
redirections) mais ne sont plus atteignables du public. Le vrai cleanup
est planifié R27+ après validation prod.

**Procédure de bascule**
1. `git pull` sur le serveur → nouvelles définitions.
2. `cp .env.example .env` et remplir `APP_HOST`, `VITE_API_URL=https://${APP_HOST}`.
3. `docker compose build bestfront` (build image ~ 60-90 s).
4. `docker compose up -d bestfront` → Traefik prend le nouveau routeur.
5. Vérifier `docker compose logs bestfront` puis `curl -I https://${APP_HOST}` (200 OK, `Server: nginx`).
6. Test manuel : landing SPA + login + une page authentifiée.

**Rollback** : `docker compose stop bestfront` et remettre les labels
Traefik sur `bestweb` (voir git blame `docker-compose.yml` R25).

Roadmap R27+ : nettoyage des vues HTML Django (`formations.HomeView`,
`catalog.urls`, etc.), retrait des templates Django statiques, suppression
des dépendances `tinymce` / template-forms uniquement utilisées par le
front legacy.

## R27 — Espace admin premium

Publié : refonte visuelle et fonctionnelle de l'espace administrateur
plateforme. Les pages existaient déjà (R7) mais utilisaient `PublicHeader`
ou `DashboardShell` sans vraie navigation dédiée. On aligne enfin l'admin
sur les shells apprenant/instructeur.

**Nouveau composant `components/admin/AdminShell.tsx`** — cohérent avec
`LearnerShell` (R12) et `InstructorShell` (R13) : sidebar sticky desktop
(w-64), drawer motion mobile, header sticky avec titre/sous-titre/actions,
badge « Admin plateforme » en rose (`ShieldCheck`), lien Django admin
externe dans les raccourcis. Dark mode compatible.

**Pages migrées vers `AdminShell`** :
- `pages/AdminDashboardPage.tsx` — `PeriodSelector` déplacé dans slot `actions`
- `pages/admin/AdminUsersPage.tsx`
- `pages/admin/AdminUserDetailPage.tsx`
- `pages/admin/AdminConfigPage.tsx`

**Nouvelle page `pages/admin/AdminCoursesPage.tsx`** — supervision cours
plateforme sur route `/admin/courses`. 4 KPI (publiés / certifiants /
gratuits / inscrits agrégés), filtres (recherche + catégorie + type + prix),
table avec formateur/note/inscrits/prix, actions rapides (fiche publique +
éditeur bypass admin).

**Router** — nouvelle route `/admin/courses` protégée par `AdminOnlyRoute`.
Le lien « Admin plateforme » du `UserMenu` (topbar) reste pointé sur
`/dashboard/admin` qui bénéficie du nouveau shell.

Roadmap R28+ : endpoints backend `/api/admin/courses/…` pour la vraie
modération (unpublish massif, alertes qualité, warnings), page
`/admin/organizations`, audit log, monitoring runtime (Redis / Postgres /
MinIO health).

## R28 — Espace admin premium : composants + audit + enrollments + roadmap honnête

Publié : livraison structurée du back-office admin en 7 sous-tâches. Choix
délibéré de **ne pas mocker** les modules non branchés : les 13 sections
sans backend affichent une `AdminPlaceholderPage` explicite avec la liste
des features prévues, les endpoints à créer et un lien vers l'admin
Django comme fallback opérationnel.

**Composants réutilisables** (`components/admin/primitives.tsx`) —
`StatCard` (KPI avec delta), `StatusBadge` (12 statuts normalisés),
`PageHeader` (avec breadcrumbs), `EmptyState`, `ErrorState` (retry),
`PermissionGuard` (admin/roles), `ConfirmDialog` (destructive), `ExportMenu`
(CSV/Excel/PDF), `DataTable` générique (sort + row actions + skeletons).

**AdminShell nav enrichie** — 6 sections groupées (Vue d'ensemble,
Communauté, Catalogue, Certifications, Finance, Plateforme) avec badge
`WIP` sur les modules en attente de backend R29+.

**Nouvelle page `/admin/audit`** — journal d'audit lifecycle des cours,
consomme `GET /api/admin/audit/course-lifecycle/` (nouveau, réservé
`is_platform_admin`). Filtres action / cours / acteur / date. Pagination
30 par page.

**Nouvelle page `/admin/enrollments`** — supervision de toutes les
inscriptions plateforme, consomme `GET /api/admin/enrollments/`
(nouveau). KPI rapides + filtres statut/cours/user/email. Barre de
progression par ligne.

**13 placeholders honnêtes** — formateurs, organisations, rôles, contenu,
quiz, paiements, commissions, reversements, marketing, modération,
support, rapports, paramètres avancés. Chacun listant précisément les
features attendues et les endpoints backend à créer.

**Endpoints backend nouveaux** :
- `api_admin_audit.py` — `AdminAuditCourseLifecycleView` (list + filtres)
- `api_admin_enrollments.py` — `AdminEnrollmentsListView` (list + filtres)

**Roadmap détaillée** dans `docs/R28_ADMIN_ROADMAP.md` — ordre suggéré
R29 → R37 avec priorités business, modèles DB à créer (`CommissionRule`,
`Payout`, `AdminRole`, `Report`, `Ticket`, `Coupon`, `PlatformSettings`,
etc.) et endpoints par module.

## R29 — Hardening dashboards + ErrorBoundary + actions admin cours

Publié : consolidation qualité pré-prod en 4 sous-tâches.

**Hardening défensif** — `InstructorDashboardPage` et `StudentDashboardPage`
appliquent le même pattern que `AdminDashboardPage` (R27) : accès à
`data.kpis.X`, `data.series.X` sécurisé via defaults locaux (`kpis ?? {}`,
`series ?? {…}`). Plus jamais de crash React sur un payload backend
incomplet (fresh install, compte tout neuf, réponse d'erreur transitoire).

**ErrorBoundary global** — nouveau `components/RouteErrorElement.tsx`
avec rendu propre : icône, titre, hint, détail technique repliable,
boutons Recharger / Retour / Accueil. `router/index.tsx` décore
automatiquement **toutes** les routes via `withErrorBoundary()` qui
injecte `errorElement: <RouteErrorElement />` sur chaque `RouteObject`.
Fini le « Unexpected Application Error! » brut de React Router.

**Actions admin lifecycle** — `AdminCoursesPage` intègre `CourseRowActions`
avec Unpublish + Archive fonctionnels via `useCourseLifecycle` (bypass
admin déjà présent via `is_platform_admin`). `ConfirmDialog` obligatoire
avec description contextuelle. Feedback flash succès/échec par ligne.
Boutons désactivés pendant la mutation.

**Vérification** — typecheck TS : 0 erreur sur tout le projet.

## R30 — Module Formateurs (backend + frontend réels)

Publié : premier module WIP débloqué de la roadmap R28. Le placeholder
`AdminInstructorsPlaceholder` est remplacé par une **vraie page branchée**
sur un nouvel endpoint backend qui agrège les stats.

**Backend `api_admin_instructors.py`** — endpoint `GET /api/admin/instructors/`
réservé `is_platform_admin`. Retourne les users ayant un `InstructorProfile`
avec annotations agrégées : `published_courses` (COUNT filtré status=PUBLISHED),
`total_courses`, `total_enrollments`, `avg_rating` (moyenne pondérée), `rating_count`,
`payout_percent`. Filtres query `q` (recherche email/nom/headline),
`verified`, `active`. Pagination 25 par page. Stats globales exposées via
`aggregated` (total, verified, active).

**Frontend `AdminInstructorsPage.tsx`** — remplace le placeholder R28.6.
Table `DataTable` avec sort sur cours/inscrits/note/reversement. 4 KPI
cards (total, vérifiés, actifs, cours publiés sur la page). Avatar ou
initiale, badge `BadgeCheck` si vérifié. Actions par ligne : voir profil
(`/admin/users/:id`), toggle actif/suspendu via `ConfirmDialog` pour la
suspension (utilise `PATCH /api/admin/users/<id>/` existant de R7).

**Router** — `/admin/instructors` route maintenant sur la vraie page. Badge
`WIP` retiré de la nav admin.

**Roadmap R31+** (documenté dans la page) : workflow complet validation
formateur avec docs et vérification identité, commissions personnalisées,
historique reversements. `payout_percent` déjà exposé pour préparer.

## R31 — Module Organisations (backend + frontend)

Publié : deuxième placeholder R28 débloqué. Endpoint
`GET /api/admin/organizations/` + `PATCH /<id>/` (toggle is_active).
Retourne les orgs avec `members_count`, `active_members_count`,
`courses_count`. Filtres `q`, `active`. Réservé `is_platform_admin`.

Page `AdminOrganizationsPage` : 4 StatCards, filtres recherche +
statut, DataTable avec sort sur membres/cours/date, actions toggle
active via ConfirmDialog. Route `/admin/organizations`, badge WIP retiré.

Fichiers : `best_epargne/apis/api_admin_organizations.py` (nouveau),
`frontend/src/pages/admin/AdminOrganizationsPage.tsx` (nouveau).

## R32 — Module Modération avis (backend + frontend)

Publié : troisième placeholder débloqué. Endpoint
`GET /api/admin/reviews/` + `PATCH /<id>/` (toggle is_public) +
`DELETE /<id>/` (suppression définitive). Retourne les `CourseReview`
avec enrichissement user + cours. Filtres `q`, `rating`, `is_public`.

Page `AdminModerationPage` : 4 StatCards (total, masqués, notes ≤ 2,
publiés), rendu étoiles, actions par ligne : toggle visibilité (hide/show)
+ suppression définitive avec ConfirmDialog destructive. Route
`/admin/moderation`, badge WIP retiré.

Fichiers : `best_epargne/apis/api_admin_moderation.py` (nouveau),
`frontend/src/pages/admin/AdminModerationPage.tsx` (nouveau).

## R35 — Module Contenu pédagogique (backend + frontend)

Publié : cinquième placeholder débloqué. Endpoint
`GET /api/admin/content/lessons/` avec enrichissement course/section.
Filtres `q`, `lesson_type`, `course_id`. Stats agrégées par type de
leçon (`aggregated.by_type`).

Page `AdminContentPage` : 5 StatCards (total + par type — Video / Text /
Quiz / File), DataTable avec icônes par type, badges preview, lien vers
cours parent. Route `/admin/content`, badge WIP retiré.

Fichiers : `best_epargne/apis/api_admin_content.py` (nouveau),
`frontend/src/pages/admin/AdminContentPage.tsx` (nouveau).

## R33 — Module Quiz plateforme (backend + frontend)

Publié : quatrième placeholder débloqué. Endpoint
`GET /api/admin/quizzes/` avec annotations `questions_count`,
`attempts_count`, `avg_score`, `passing_rate`. Filtres `q`, `is_final`,
`is_active`, `has_course`.

Page `AdminQuizzesPage` : 4 StatCards (total, actifs, finaux, onboarding),
DataTable avec sort sur questions/tentatives/score, badges (Final,
Onboarding, Inactif), lien vers cours parent. Route `/admin/quiz`,
badge WIP retiré.

Fichiers : `best_epargne/apis/api_admin_quizzes.py` (nouveau),
`frontend/src/pages/admin/AdminQuizzesPage.tsx` (nouveau).

## R37 — Module Paiements (backend + frontend)

Publié : septième placeholder débloqué. Endpoint `GET /api/admin/payments/`
qui liste les `Order` avec enrichissement user/company/coupon + annotations
`items_count`. Filtres `status`, `user_id`, `company_id`, `q`. Stats
agrégées : `total_orders`, `revenue_paid` (Sum sur PAID), `by_status`
avec count + total par statut.

Page `AdminPaymentsPage` : 5 StatCards (revenus perçus, commandes total,
payées, en attente, échouées), DataTable avec sort sur total, badges
statut sur 8 valeurs (DRAFT / PENDING / PAID / FAILED / CANCELED /
REFUND_* / REFUNDED), affichage remise + code coupon.

Fichiers : `best_epargne/apis/api_admin_payments.py` (nouveau),
`frontend/src/pages/admin/AdminPaymentsPage.tsx` (nouveau).

## R38 — Module Marketing/Coupons (backend + frontend CRUD complet)

Publié : huitième placeholder débloqué. **Premier CRUD complet admin** :
- `GET /api/admin/marketing/coupons/` — liste + filtres + stats
- `POST /api/admin/marketing/coupons/` — création (validation XOR
  percent_off/amount_off)
- `PATCH /api/admin/marketing/coupons/<id>/` — update partiel
- `DELETE /api/admin/marketing/coupons/<id>/` — refusé (409) si le coupon
  a déjà été utilisé (protection intégrité)

Page `AdminMarketingPage` : 3 StatCards (total, actifs, utilisations
totales), colonnes code + type de remise (% ou XOF) + progress bar
d'utilisation vs limite, toggle actif/inactif, suppression avec
ConfirmDialog destructive, **CreateCouponModal** avec formulaire
(pourcentage/montant, devise, limite d'utilisation).

Fichiers : `best_epargne/apis/api_admin_marketing.py` (nouveau),
`frontend/src/pages/admin/AdminMarketingPage.tsx` (nouveau).

## R39 — Module Rôles & Permissions (Django Groups)

Publié : neuvième placeholder débloqué **sans nouvelle migration**. Utilise
`django.contrib.auth.Group` natif via la relation M2M `user.groups`.

**Endpoints CRUD complet** :
- `GET /api/admin/roles/` — liste + `users_count` + `permissions_count`
- `POST /api/admin/roles/` — création (409 si nom déjà pris)
- `PATCH /api/admin/roles/<id>/` — renommer
- `DELETE /api/admin/roles/<id>/` — supprimer (409 si rôle a des membres)
- `GET /api/admin/roles/<id>/users/` — liste membres du rôle
- `POST /api/admin/roles/<id>/users/` — ajouter user (body : `user_id`)
- `DELETE /api/admin/roles/<id>/users/<user_id>/` — retirer

**Page `AdminRolesPage`** : layout 2 colonnes (liste rôles à gauche,
membres du rôle sélectionné à droite), création via modal, renommer via
modal, suppression avec ConfirmDialog, ajout user par ID avec Input,
retrait user avec un clic. 3 StatCards (rôles, affectations, permissions
Django agrégées). Bandeau info roadmap R41+ pour la matrice permissions.

Fichiers : `best_epargne/apis/api_admin_roles.py` (nouveau, 4 vues),
`frontend/src/pages/admin/AdminRolesPage.tsx` (nouveau, 500 lignes).

## R40 — Module Support (MVP notifications)

Publié : dixième placeholder débloqué. **Pivot pragmatique** — le vrai
modèle `Ticket` avec fils de messages est planifié R41, mais le module
Support affiche déjà les notifications plateforme comme MVP fonctionnel.

Endpoint `GET /api/admin/notifications/` avec filtres `q`, `kind`,
`user_id`, `unread`. Stats : total, non-lues, système.

Page `AdminSupportPage` : 4 StatCards, dot indicator lu/non-lu animé,
filtres type / lues / recherche, table avec type badgé + titre + body +
destinataire, action ExternalLink vers le lien associé si présent.
Bandeau statut explicite « MVP — Ticket complet planifié R41 ».

Fichiers : `best_epargne/apis/api_admin_notifications.py` (nouveau),
`frontend/src/pages/admin/AdminSupportPage.tsx` (nouveau).

## R41 — Module Commissions (backend + frontend + migration)

Publié : onzième placeholder débloqué avec **nouveau modèle DB** +
migration additive-safe.

**Modèle `commerce.CommissionRule`** :
- `scope` : `DEFAULT` / `INSTRUCTOR` / `CATEGORY` / `COURSE`
- `percent` : commission plateforme (0-100, validators)
- FK `instructor` / `category` / `course` selon scope
- `is_active`, `note`, timestamps
- `CheckConstraint` DB qui garantit la cohérence scope ↔ FK
- 4 indexes pour lookups rapides
- Méthode de classe `resolve_for(course, instructor)` — algorithme
  déterministe : COURSE → INSTRUCTOR → CATEGORY → DEFAULT

**Migration `commerce/0008_commission_rule.py`** — création table +
seed idempotent d'une règle DEFAULT à 30% (RunPython avec reverse).

**Endpoints CRUD + Simulate** :
- `GET /api/admin/commissions/` (filtres scope + is_active + stats)
- `POST /api/admin/commissions/` (validation scope ↔ FK)
- `PATCH /api/admin/commissions/<id>/`
- `DELETE /api/admin/commissions/<id>/` (409 si dernière DEFAULT active)
- `POST /api/admin/commissions/simulate/` (body: amount + course_id? +
  instructor_id?) — retourne rule appliquée + part plateforme + part
  formateur avec arrondi 2 décimales

**Page `AdminCommissionsPage`** : 5 StatCards (commission défaut, +
counts par scope), filtres, DataTable avec sort sur % / statut,
CreateRuleModal avec formulaire dynamique par scope (FK requis
uniquement si nécessaire), **SimulateModal** avec preview live du calcul,
toggle actif/inactif, suppression avec protection DEFAULT.

Fichiers : `commerce/models.py` (extension), `commerce/migrations/0008_commission_rule.py`,
`best_epargne/apis/api_admin_commissions.py`, `frontend/src/pages/admin/AdminCommissionsPage.tsx`.

**Migration à appliquer côté serveur** :
```bash
cd /home/ubuntu/bestep
git pull
docker compose exec bestweb python manage.py migrate commerce
# → applique 0008_commission_rule + seed DEFAULT 30%
docker compose build bestfront && docker compose up -d bestfront
```

## R42 — Module Reversements (backend + frontend + migration)

Publié : douzième placeholder débloqué avec **nouveau modèle DB** +
migration additive-safe + workflow complet à 5 états.

**Modèle `commerce.Payout`** :
- `instructor` (FK PROTECT) — pas de cascade DELETE, on préserve l'historique
- `period_start` / `period_end` (contrainte DB `period_end ≥ period_start`)
- `currency`, `gross_amount`, `commission_amount`, `tax_amount`,
  `refund_amount`, `net_amount` (14 chiffres décimaux, 2 après virgule)
- `status` : `PENDING` / `VALIDATED` / `PAID` / `FAILED` / `CANCELED`
- `payment_method` + `payment_reference` (renseignés à la validation PAID)
- `validated_by` (FK), `validated_at`, `paid_at`, `note`, timestamps
- UniqueConstraint `(instructor, period_start, period_end)` — pas de doublon
- 3 indexes pour lookups performants

**Migration `commerce/0009_payout.py`** — création table + contraintes,
aucun seed.

**Endpoints workflow** :
- `GET /api/admin/payouts/` (filtres status + instructor_id + stats agg)
- `POST /api/admin/payouts/` (création manuelle avec recalcul net_amount)
- `PATCH /api/admin/payouts/<id>/` (409 si déjà PAID)
- `POST /api/admin/payouts/<id>/validate/` — PENDING → VALIDATED
  (set validated_by + validated_at)
- `POST /api/admin/payouts/<id>/mark_paid/` — VALIDATED → PAID
  (exige `payment_method` + `payment_reference`)
- `POST /api/admin/payouts/<id>/cancel/` — * → CANCELED (409 si déjà PAID)

**Page `AdminPayoutsPage`** : 5 StatCards (net cumulé, commissions,
pending, validated, paid), DataTable avec brut/commission/net colorés
(rose pour commission, emerald pour net), actions par ligne selon
statut (valider si PENDING, marquer payé si VALIDATED, annuler sinon),
**MarkPaidModal** (sélecteur Wave/OrangeMoney/Stripe/BankTransfer +
référence), **CreatePayoutModal** avec preview live du net calculé.

Fichiers : extension `commerce/models.py`, `commerce/migrations/0009_payout.py`,
`best_epargne/apis/api_admin_payouts.py`, `frontend/src/pages/admin/AdminPayoutsPage.tsx`.

**Migration à appliquer côté serveur** :
```bash
docker compose exec bestweb python manage.py migrate commerce
# → applique 0008 (commissions) + 0009 (payouts)
```

## R43 — Module Rapports (exports CSV synchrones)

Publié : treizième placeholder débloqué. 5 endpoints `StreamingHttpResponse`
CSV avec BOM UTF-8 (compat Excel Windows), limite prudente à
10 000 lignes par export (garde-fou OOM).

**Endpoints exports** :
- `GET /api/admin/reports/users.csv[?active=&role=]`
- `GET /api/admin/reports/courses.csv[?status=&category=]`
- `GET /api/admin/reports/enrollments.csv[?status=&since=&until=]`
- `GET /api/admin/reports/orders.csv[?status=&since=&until=]`
- `GET /api/admin/reports/payouts.csv[?status=]`

Utilisation d'`iterator(chunk_size=500)` pour ne pas charger toute la
queryset en RAM. `csv.writer` sur pseudo-buffer streamé.

**Page `AdminReportsPage`** — 5 cards rapport chacune avec description,
filtres dépliants (select/date/text), bouton « Télécharger CSV » avec
Loader2 pendant génération. Download via axios blob + createObjectURL
(bénéficie du header Authorization JWT). Section « Roadmap R45+ »
listant les évolutions prévues (Celery async, Excel natif, PDF,
planification).

Fichiers : `best_epargne/apis/api_admin_reports.py` (nouveau, 5 vues),
`frontend/src/pages/admin/AdminReportsPage.tsx` (nouveau).

## Fix — `/admin/` renvoyait 404 (nginx / Django mal routé)

Symptôme rapporté : `https://ayo-group.com/admin/` → **Not Found**.

**Cause** — La config nginx (`frontend/nginx.conf`) avait
`location /admin/` qui reverse-proxyait toute URL commençant par
`/admin/` vers Django. Or Django admin (superuser) est monté à
`/admin/super/` dans `best_epargne/urls.py`. Résultat :

- Requête utilisateur : `GET /admin/`
- nginx match `location /admin/` → proxy vers Django
- Django n'a aucune route pour `/admin/` (que `/admin/super/`)
- **404 Django** interceptée par nginx

Ce comportement empêchait aussi d'atteindre l'espace admin SPA
React (`AdminShell`) qui a des routes React Router à `/admin/*`.

**Fix (`frontend/nginx.conf`)** :

- **`location /admin/`** retiré. La règle est remplacée par
  **`location /admin/super/`** qui ne reverse-proxie que le vrai
  chemin Django admin. Toutes les autres URLs `/admin/*` tombent
  maintenant sur le fallback SPA (`location /`) qui sert
  `index.html`, laissant React Router prendre le relais.

- Ajout de **`location /accounts/`** → proxy Django (pour que le
  redirect legacy `/accounts/login/` fonctionne côté serveur avec
  `LOGIN_URL=/login`).

- Ajout de **`location /account/`** → proxy Django (allauth interne
  si utilisé).

**Séparation logique confirmée** :

| URL                | Servie par         | Rôle                              |
|--------------------|-------------------|-----------------------------------|
| `/admin/`          | SPA React         | `AdminShell` — back-office SaaS   |
| `/admin/users`     | SPA React         | Gestion users plateforme          |
| `/admin/ai`        | SPA React         | Centre Best-AI                    |
| `/admin/super/`    | Django admin      | Dépannage bas-niveau (rare)       |
| `/api/*`           | Django DRF        | API REST + JWT                    |
| `/accounts/login/` | Django → redirect | 302 vers `/login` (SPA)           |

**Mise en service** — nginx doit être rechargé :
```bash
docker compose exec bestfront nginx -s reload
# ou plus simplement :
docker compose restart bestfront
```

Aucune migration Django ni rebuild du bundle React nécessaire.

## Fix — `/accounts/login/` retournait 404

Symptôme rapporté en prod : `https://ayo-group.com/accounts/login/?next=/admin/`
→ **404 Page introuvable**.

**Cause** — Depuis la bascule SPA (R26), les vues HTML Django
(`/account/login/`, `/accounts/login/`) n'existent plus. Le login vit
côté React à `/login`. Or `settings.LOGIN_URL` n'était pas configuré
en prod → Django utilisait son défaut `/accounts/login/`, qui pointait
vers une URL inexistante. Quand un utilisateur non-connecté frappait
`/admin/`, Django Auth Middleware redirigeait vers ce défaut, d'où le
404.

**Fix (3 changements)** :

1. **`best_epargne/settings/base.py`** — `LOGIN_URL = "/login"`
   (SPA React) + `LOGOUT_REDIRECT_URL = "/"` (accueil publique).
   Toute redirection automatique Django (`@login_required`, admin
   Django, allauth…) pointe désormais vers la SPA qui gère le
   query `?next=` proprement (`LoginPage.sanitizeNextTarget`
   anti open-redirect).

2. **`best_epargne/settings/dev.py`** — override aligné sur
   `/login` (avait `/account/login/` obsolète depuis R26).

3. **`best_epargne/urls.py`** — filet de sécurité pour les anciens
   liens (emails, bookmarks, cache navigateur) : redirection
   permanent-non `/accounts/login/` → `/login` avec préservation
   du query string (`RedirectView(query_string=True)`).

**Résultat** — `/accounts/login/?next=/admin/` redirige maintenant
vers `/login?next=/admin/`, la SPA affiche la page login premium,
et après authentification l'utilisateur est renvoyé sur `/admin/`
(espace admin SPA, gated par `AdminOnlyRoute`).

**Vérification** — aucun changement de logique métier, uniquement de
la configuration. À déployer avec un `docker compose restart bestweb`
(reload settings).

## Fix — Incohérences typecheck + Médiathèque cassée

Correctifs de bugs identifiés à l'audit :

### 1. TypeScript — `User.is_active` manquant

Les 3 composants Best-AI (`AIAssistant`, `AIFloatingButton`,
`AIAssistantPanel`) référençaient `user.is_active` pour la
vérification de compte, mais le champ était absent du type `User`
(`lib/types.ts`). Résultat : 3 erreurs TS2339 et un typecheck cassé.

**Fix** — ajout de `is_active?: boolean` (optionnel pour rétro-compat)
dans l'interface `User`. Le comportement front reste : `user.is_active
!== false` → un user dont on ne connaît pas le flag est considéré
comme actif (fallback prudent).

### 2. Médiathèque — 2 bugs critiques d'intégration

**Bug A — upload_id manquant dans le finalize**

`useUploadMedia` faisait :
```
POST /media/upload/init/
  → réponse: {upload_id, object_key, upload_url, ...}
PUT sur MinIO
POST /media/upload/finalize/
  → body: {object_key, filename, ...}   ← ❌ pas d'upload_id
```

Or `MediaUploadFinalizeSerializer` (backend) déclare
`upload_id = serializers.CharField(max_length=255)` **required**.
Résultat : chaque upload retournait `400 Bad Request { upload_id:
["Ce champ est obligatoire."] }` et l'utilisateur voyait uniquement
"Échec de l'upload".

**Fix** — `useUploadMedia` transmet maintenant `init.upload_id` au
finalize. L'interface `UploadInitResponse` déclare désormais le
champ. Le finalize ne transmet plus `filename` (retiré du serializer
backend depuis, remplacé par `title`).

**Bug B — Suppression HTTP method incorrecte**

`useDeleteMedia` faisait `api.post(/instructor/media/:id/delete/)`
alors que la vue `InstructorMediaDeleteView` n'implémente que
`def delete(self, ...)`. Django DRF retournait donc systématiquement
`405 Method Not Allowed`.

**Fix** — le hook utilise maintenant `api.delete(...)` conformément
à la sémantique HTTP et à la vue backend.

**Impact utilisateur** — la médiathèque instructeur est de nouveau
fonctionnelle : upload → visible dans la grille en <2s, rename OK,
delete OK (avec purge S3 + optimized + thumbnail).

**Vérification** : `tsc --noEmit` 0 erreur.

## Best-AI — Verrou strict "utilisateurs authentifiés uniquement"

Durcissement de sécurité : Best-AI est désormais **inaccessible au
grand public** avec trois couches indépendantes de vérification, en
défense-en-profondeur.

### Couche 1 — Permissions Backend

`ai/permissions.py::user_can_use_assistant()` réécrit avec des règles
cumulatives strictes et explicites :

```python
if user is None:                              → False
if not user.is_authenticated:                 → False   # bloque AnonymousUser
if not user.is_active:                        → False   # bloque comptes désactivés
return True
```

`role_bundle()` renvoie explicitement `{"role": "guest"}` si
l'utilisateur n'est pas autorisé — mais chaque vue refuse en amont,
donc ce fallback ne devrait jamais être atteint en pratique.

### Couche 2 — Vues DRF

Toutes les vues du module Best-AI ont `permission_classes=[IsAuthenticated]`
DRF (bloque au niveau du framework avant même d'entrer dans la vue)
ET appellent `user_can_use_assistant()` en début de méthode pour la
vérification `is_active` (que DRF ne teste pas par défaut) et pour
répondre proprement `403 "Best-AI indisponible pour ce compte"`.

Audit : **41 vues** dans `api_ai*.py` gates par IsAuthenticated
(8+12+5+7+5+8 = 45 imports, dont 4 dans les décorateurs de `_StepMixin`).

### Couche 3 — Frontend

- **`AIAssistant`** (root component) — check `useIsAuthenticated() &&
  user.is_active !== false` avant même de monter `AIFloatingButton` +
  `AIAssistantPanel`. Retourne `null` sur les routes publiques
  (landing `/`, `/catalogue`, `/courses/:slug`, `/login`, `/register`,
  `/certify/:code`).
- **`AIFloatingButton`** — double check du même flag (défense
  redondante).
- **`AIAssistantPanel`** — triple check (retour `null` si non-authent).
- **Router** — toutes les routes IA sont wrappées `ProtectedRoute` :
  - `/instructor/ai/generate-course` → ProtectedRoute + InstructorOnlyRoute
  - `/ai/tools` → ProtectedRoute
  - `/ai/knowledge` → ProtectedRoute
  - `/admin/ai` → ProtectedRoute + AdminOnlyRoute

Un visiteur non-connecté qui tape directement une URL AI est redirigé
vers `/login` (comportement standard `ProtectedRoute`).

### Impact utilisateur

- **Visiteur anonyme sur la landing publique** : aucun bouton flottant
  Best-AI, aucune trace visuelle du module IA. La landing reste
  100% conforme à sa vocation marketing.
- **Utilisateur authentifié actif** : bouton flottant partout, plein
  accès selon RBAC (learner/instructor/admin).
- **Compte désactivé** (`is_active=False`) : bouton caché, endpoints
  répondent 403, message clair « Best-AI indisponible pour ce compte ».

### Vérification

- AST backend OK
- `tsc --noEmit` 0 erreur
- Aucune migration nécessaire (changement de logique uniquement)

## Best-AI — Rebranding + branchement production Claude

Deux chantiers livrés en un tour :

### 1. Rebranding "Best-AI"

L'assistant IA de Best-Épargne s'appelle désormais officiellement
**Best-AI**. Le renommage touche :

- **Prompt système backend** (`ai/services.py`) — nouvelle identité :
  « Tu es Best-AI, l'assistant IA officiel de Best-Épargne. Développé
  par l'équipe Best-Épargne. Ton : professionnel, chaleureux,
  direct… ». Le modèle sait maintenant qui il est et le communique
  clairement s'il est interrogé.
- **UI frontend** — libellés visibles renommés partout :
  - `AIFloatingButton` — bouton bottom-right : "Best-AI"
  - `AIAssistantPanel` — header, messages d'accueil, badge des
    réponses assistant : "Best-AI"
  - `AICourseGeneratorPage` — titre : "Best-AI — générateur de cours"
  - `AIToolsPage` — titre : "Atelier des outils Best-AI"
  - `AIAdminCenterPage` — titre : "Centre d'administration Best-AI"
- **Messages d'erreur backend** — "Best-AI indisponible pour ce
  compte" (4 fichiers d'endpoints).

Aucun renommage de modèle Django (les tables `ai_*` restent
identiques — aucune migration nécessaire, aucun risque de casse).

### 2. Branchement production sur l'API Claude d'Anthropic

Le driver `AnthropicProvider` (`ai/providers/anthropic_compat.py`)
est maintenant **production-ready** :

- **Headers complets** : `x-api-key`, `anthropic-version=2023-06-01`,
  `Accept: text/event-stream`, `User-Agent: Best-Epargne/Best-AI`.
- **Validation clé API** stricte au démarrage — erreur explicite si
  vide (« Renseignez ANTHROPIC_API_KEY ou configurez le champ api_key
  dans /admin/ai »).
- **Extraction des vrais tokens** — parse les évènements SSE
  `message_start` (input_tokens) et `message_delta` (output_tokens)
  au lieu d'estimer. Fallback estimation si l'API n'en fournit pas.
- **Gestion erreurs enrichie** — `HTTPError` lit le body pour le
  message d'erreur, `URLError`/`TimeoutError` remontent proprement,
  évènements SSE `type=error` sont convertis en exception.
- **Validation format tours** — force au moins un tour utilisateur en
  premier (contrainte Anthropic).
- **model_used exact** — retourne le vrai identifiant de modèle
  utilisé par Anthropic (utile si l'alias diffère du name enregistré).

**Fallback env** dans le router (`ai/providers/router.py`) : si un
`AIProvider(kind=anthropic)` est configuré sans clé, on lit
`ANTHROPIC_API_KEY` depuis l'environnement. Idem pour OpenAI
(`OPENAI_API_KEY`/`OPENAI_BASE_URL`).

**Management command** `python manage.py setup_best_ai` :

```
python manage.py setup_best_ai --api-key sk-ant-xxx --activate
```

- Crée (ou met à jour) le provider `anthropic-claude` avec priorité 10.
- Provisionne 3 modèles logiques par défaut :
  - `chat_fast` → `claude-haiku-4-5-20251001`
  - `chat_advanced` → `claude-sonnet-4-6`
  - `analysis` → `claude-sonnet-4-6` (temperature basse)
- Marque ces 3 modèles `is_default=True` pour leur purpose.
- Le flag `--activate` désactive le provider `stub-dev` pour basculer
  Best-AI intégralement sur Claude.
- Sans clé API fournie, le provider est créé mais laissé inactif
  (sécurité — la commande le signale avec un warning).

**`.env.example`** — nouvelle section "Best-AI" avec `ANTHROPIC_API_KEY`,
`OPENAI_API_KEY`, `OPENAI_BASE_URL` documentés.

**Vérification** : AST backend OK, `tsc --noEmit` 0 erreur, aucune
migration nécessaire.

**Mise en service pour un déploiement existant** :
```bash
# 1. Renseigner la clé
echo 'ANTHROPIC_API_KEY=sk-ant-...' >> .env

# 2. Provisionner le provider + modèles
docker compose exec bestweb python manage.py setup_best_ai --activate

# 3. Tester la connexion : /admin/ai → onglet Providers → bouton Test
```

L'assistant flottant Best-AI répond désormais avec Claude (Sonnet 4.6
pour les tâches avancées, Haiku 4.5 pour le chat rapide). Basculement
possible à chaud depuis `/admin/ai` — modification du `is_default` sur
un autre modèle sans downtime.

## AI-P6 — Centre d'administration IA (finale du module)

Dernière phase du module IA. Le super administrateur dispose maintenant
d'un vrai centre de contrôle : providers, modèles, quotas, audit,
génération d'images — tout est visible, modifiable et journalisé.

**Backend**

- **3 nouveaux modèles** (`ai/models.py`) :
  - `AIQuota` — quotas d'usage IA scoped (GLOBAL / ROLE / USER / ORG)
    × période (DAILY / MONTHLY) × plafonds (max_calls, max_input_tokens,
    max_output_tokens, max_cost_usd). Les compteurs sont évalués à la
    volée depuis `AIUsageRecord` — le modèle stocke uniquement la config.
  - `AIImageGeneration` — jobs de génération d'image (prompt, style,
    aspect_ratio, width/height, provider, urls, statut, cost_usd,
    lien optionnel course_id/lesson_id).
  - `AIContentVersion` — snapshots des versions générées par l'IA
    (entity_type COURSE/SECTION/LESSON, origin AI/HUMAN/MIXED, payload
    JSON, generation_id pour tracer la source). Prêt pour un historique
    de versions avec compare/restore côté phase suivante.
- Migration `0006` additive-safe + 4 nouveaux kinds d'audit
  (`quota_exceeded`, `image_gen`, `content_version`, `provider_test`).

- **11 endpoints admin** (`api_ai_admin.py`), tous gates par
  `is_platform_admin` :
  - `GET /ai/admin/overview/` — KPIs consolidés : mois/semaine/total
    (calls, input_tokens, output_tokens, cost_usd), top 5 users, top 5
    modèles, providers actifs, quotas actifs, approvals pending, KB.
  - `GET/POST /ai/admin/providers/` + `GET/PATCH/DELETE .../:id/` —
    CRUD full des `AIProvider` avec masquage de la clé API en lecture
    (`sk-xxx…yyyy`).
  - `POST /ai/admin/providers/:id/test/` — smoke test réel : instancie
    le driver + envoie un chat "ping" court + mesure la latence.
    Journalise dans `AIAuditLog(provider_test)`.
  - `GET/POST /ai/admin/models/` + `GET/PATCH/DELETE .../:id/` — CRUD
    des `AIModel`. Un modèle marqué `is_default=True` déclenche le
    reset des autres `is_default` pour le même purpose.
  - `GET/POST /ai/admin/quotas/` + `GET/PATCH/DELETE .../:id/`.
  - `GET /ai/admin/audit-logs/?kind=&q=&ok=` — journal filtrable
    paginé (50/page, 200 max).
  - `GET /ai/admin/usage/` — `AIUsageRecord` détaillés.
  - `POST /ai/image-generate/` — stub production-ready : accepte
    prompt + style + aspect_ratio (1:1/3:4/4:3/16:9/9:16), retourne
    une URL placehold.co dimensionnée + persiste `AIImageGeneration`
    + audit. Prêt à être remplacé par un vrai driver (OpenAI DALL-E,
    Stability, Replicate) via `AIProvider.kind="image"`.

**Frontend**

- Types (`ai-types.ts`) : `AIProviderRow`, `AIModelRow`, `AIQuotaRow`,
  `AIAdminOverviewPayload`, `AIAuditLogRow`, `AIProviderKind`,
  `AIModelPurpose`, `AIQuotaTargetType`.
- 13 hooks TanStack (`hooks/ai.ts`) : `useAIAdminOverview`,
  `useAIProviders`/`Create`/`Update`/`Delete`/`Test`, `useAIModels`/
  `Create`/`Delete`, `useAIQuotas`/`Create`/`Delete`, `useAIAuditLogs`.
- **`AIAdminCenterPage.tsx`** (`/admin/ai`, ~850 lignes) — page
  consolidée dans `AdminShell` avec **5 onglets** :
  1. **Vue d'ensemble** — 4 StatCards KPI, top 5 users, top 5
     modèles, résumé KB, coût total historique.
  2. **Providers** — table CRUD avec toggle actif inline, clé API
     masquée (4 premiers/4 derniers), bouton "Test" qui lance le
     smoke test + affiche latence + ✓/✗, formulaire création
     inline (name / kind / base_url / api_key / priority).
  3. **Modèles** — table avec provider, purpose, model_name, tokens,
     coûts par 1k, badge "default", formulaire création avec
     sélection provider + purpose + checkbox default.
  4. **Quotas** — table + formulaire création (scope + role optionnel
     si ROLE + period + max calls/tokens/cost). "0" = illimité.
  5. **Journal d'audit** — filtres kind (10 types) + ok/failed + q
     (email/erreur), table paginée avec date, kind badge, user_email,
     ✓/✗, payload tronqué, IP.
- Router : nouvelle route `/admin/ai` protégée par `AdminOnlyRoute`.

**Sécurité & garanties**
- Tous les endpoints admin gates strict par `is_platform_admin`
  (403 sinon, journalisé).
- Clés API jamais retournées en clair (masquage 4/4).
- Test de connexion journalisé avec IP client.
- `is_default` mutuellement exclusif par purpose (un seul modèle
  default par purpose).
- Image gen stub réservé instructor/admin (pas d'usage learner).

**Vérification** : AST backend OK, `tsc --noEmit` 0 erreur.

**Migration** : `python manage.py migrate ai` applique la 0006
(additive-safe, aucune donnée touchée).

**En pratique** — un super admin ouvre `/admin/ai`, voit
instantanément la consommation IA du mois (nombre d'appels, tokens
sortie, coût), les top users et modèles. Il clique sur "Providers",
ajoute un `AIProvider` OpenAI avec sa clé, clique "Test" → validation
en 300 ms. Il ajoute un `AIModel` (purpose=chat_advanced,
model_name=gpt-4o, is_default=True) → à partir de ce moment, toutes
les générations avancées basculent sur GPT-4o (le routeur choisit
automatiquement le default de chaque purpose). Il pose un quota
ROLE:learner = 100 appels/jour → les apprenants au-delà voient une
erreur de quota (journalisée `quota_exceeded`).

---

## 🎯 Module IA — Récapitulatif final (6 phases livrées)

| Phase | Livraison |
|---|---|
| **P1** — Fondations | app `ai/`, 6 modèles fondamentaux, provider abstraction (OpenAI-compat + Anthropic + stub-dev), assistant global streaming SSE, panel flottant sur toutes les pages avec contexte de route |
| **P2** — Générateur de cours | assistant guidé 6 étapes (brief → plan → contenu → quiz → certification → validation), `AICourseGeneration` avec machine d'état, fallback déterministe complet, finalisation atomique vers `catalog.Course` en DRAFT |
| **P3** — IA dans le builder + Recommandations | 18 actions text-transform (write/improve/reformulate/summarize/to_list/example/case_study/exercise/translate/adapt_level…), moteur de recommandations 8 catégories avec feedback loop, widget dashboard learner |
| **P4** — Agent outillé | framework tools + 6 outils concrets (search_courses/analyze_progress L0, create_course_draft/enroll_learner L1, publish_course/deactivate_user L2), 3 niveaux de confirmation avec modal détaillée, whitelist stricte |
| **P5** — RAG + Web search | `AIKnowledgeSpace` (6 scopes) + `AIKnowledgeDocument` + `AIKnowledgeChunk` avec embeddings 128-dim, chunker préservant paragraphes/phrases, retrieval cosine avec filtre RBAC, recherche web allowlist/blocklist, page KB manager |
| **P6** — Centre admin | 3 modèles (`AIQuota`, `AIImageGeneration`, `AIContentVersion`), 11 endpoints admin (providers/models/quotas/audit/usage), page 5 onglets, test de connexion providers, image gen stub production-ready |

**Chiffres du module :**
- **18 modèles Django** (`AIProvider`, `AIModel`, `AIConversation`, `AIMessage`, `AIUsageRecord`, `AIAuditLog`, `AICourseGeneration`, `AIRecommendation`, `AIToolExecution`, `AIActionApproval`, `AIKnowledgeSpace`, `AIKnowledgeDocument`, `AIKnowledgeChunk`, `AIWebSearch`, `AIQuota`, `AIImageGeneration`, `AIContentVersion`)
- **6 migrations additives-safe**
- **~40 endpoints REST** couvrant conversations, générateur cours, text-transform, recos, tools, KB, web search, admin
- **17 kinds d'audit** dans `AIAuditLog` (traçabilité complète)
- **6 outils agent whitelistés** avec RBAC + 3 niveaux de confirmation
- **9 pages React admin/instructor/learner** dédiées IA
- **Provider abstraction** compatible OpenAI/Azure/Ollama/DeepSeek/Mistral/Anthropic + stub-dev pour dev sans clé

**Design pgvector-ready + provider-agnostic** — le module fonctionne
100% en local dès le premier `manage.py migrate` (stubs déterministes)
et se transforme en système IA de production dès qu'un vrai provider
est configuré via `/admin/ai`.

## AI-P5 — RAG (Knowledge base) + Recherche web contrôlée

Cinquième phase du module IA. L'assistant peut maintenant s'appuyer
sur une **base de connaissances vectorielle** propre à la plateforme
+ une **recherche web filtrée** par allowlist/blocklist. Le pipeline
est full multi-org avec RBAC strict par espace.

**Backend**

- **4 nouveaux modèles** (`ai/models.py`) :
  - `AIKnowledgeSpace` — espace de connaissance segmenté par scope
    (GLOBAL / ORG / COURSE / INSTRUCTOR / PRIVATE / ADMIN).
  - `AIKnowledgeDocument` — document indexé (title, source_url,
    doc_type, langue, version, content, metadata, status, chunks_count,
    embedding_dim).
  - `AIKnowledgeChunk` — fragment de document + `embedding` JSONField
    (list[float]) + unique_together `(document, idx)`.
  - `AIWebSearch` — journal des recherches Internet (provider,
    domaines, results_count, IP).
- Migration `0005` additive-safe + seed d'un espace GLOBAL "Global"
  par défaut + 2 nouveaux kinds d'audit (`kb_document_indexed`,
  `kb_search`).

- **Pipeline RAG** (`ai/knowledge/`) :
  - `chunker.py` — splitter ~800 chars avec overlap 120, respecte
    les paragraphes puis phrases, purge HTML.
  - `embeddings.py` — provider embeddings avec **stub hash-based
    déterministe** (128 dimensions L2-normalisées, bag-of-words hashé
    signé) qui permet la RAG sans clé externe. `cosine_similarity`
    = simple dot product grâce à la normalisation.
  - `retrieval.py` — `accessible_document_ids(user)` compute la liste
    des docs visibles selon le rôle + memberships + enrollments +
    cours possédés. `search_knowledge()` cosine + filtre + tri.
  - `services.py` — `index_document()` idempotent (purge + rechunk +
    embed + persist en une transaction, statut INDEXING→INDEXED),
    `reindex_document()` (bump version + re-index).

- **Web search** (`ai/web_search/`) :
  - `AbstractWebSearchProvider` base + `StubWebSearchProvider` qui
    produit 3 résultats synthétiques cohérents sur des domaines
    "sûrs" (OCDE, BCEAO, OpenStax) — aucune requête réseau en dev.
  - `search.py` : lit `allow_domains` / `block_domains` depuis
    `PlatformSettings.data.web_search` (fallback sur allowlist par
    défaut : wikipedia, openstax, oecd, bceao, worldbank, imf, un,
    gouv.sn, gouv.fr), filtre les résultats, journalise dans
    `AIWebSearch` + `AIAuditLog`.

- **6 endpoints** (`api_ai_kb.py`), tous IsAuthenticated + RBAC KB :
  - `GET /ai/knowledge/spaces/` — liste filtrée par RBAC
  - `POST /ai/knowledge/spaces/` — création (GLOBAL/ADMIN réservés
    aux platform_admins)
  - `GET/POST /ai/knowledge/documents/`
  - `GET/PATCH/DELETE /ai/knowledge/documents/:id/`
  - `POST /ai/knowledge/documents/:id/reindex/`
  - `POST /ai/knowledge/search/` — recherche RAG (avec filtre RBAC)
  - `POST /ai/web-search/` — recherche web (avec allowlist)

**Frontend**

- Types (`ai-types.ts`) : `AIKnowledgeSpace`, `AIKnowledgeDocument`,
  `AIKnowledgeSearchHit`, `AIWebSearchResult`, `AIWebSearchPayload`,
  `KBSpaceScope`, `KBDocStatus`, `KBDocType`.
- 9 hooks TanStack (`hooks/ai.ts`) : `useKBSpaces`, `useCreateKBSpace`,
  `useKBDocuments`, `useKBDocument`, `useCreateKBDocument`,
  `useReindexKBDocument`, `useDeleteKBDocument`, `useKBSearch`,
  `useAIWebSearch`.
- **`AIKnowledgeBasePage.tsx`** (`/ai/knowledge`, ~500 lignes) —
  interface complète réservée instructor/admin :
  - Colonne gauche : liste des **espaces visibles** avec icônes de
    scope colorées (Globe/Building2/BookOpen/ShieldCheck/Lock) +
    formulaire création espace inline (respecte le RBAC).
  - Colonne droite : **liste des documents** avec badges statut
    (INDEXED emerald / INDEXING sky / PENDING amber / FAILED rose),
    chunks_count, version, boutons Réindexer + Supprimer.
  - Formulaire création document (sélecteur d'espace + titre +
    contenu Markdown) → indexation immédiate.
  - Section **Test RAG** : input query → hits triés par score
    (badge %), extrait de chunk, lien source.
  - Section **Recherche web** : input + affichage résultats avec
    badge source_kind (web/official/academic/regulator).
- Router : nouvelle route `/ai/knowledge` (auth required + filtre
  interne instructor/admin).

**Sécurité & garanties**
- **RBAC strict par espace** : un formateur ne voit que ses espaces
  INSTRUCTOR/PRIVATE + les GLOBAL + ceux des orgs auxquelles il
  appartient + ceux des cours qu'il possède/suit. Un apprenant voit
  GLOBAL + ORG + COURSE (via enrollments). Admin voit tout.
- **Cross-org isolation** : `accessible_document_ids()` filtre en
  amont, `search_knowledge()` n'a jamais accès aux docs d'une autre
  org.
- **Whitelist web stricte** : par défaut, seuls les domaines
  institutionnels sont autorisés. Configurable via
  `PlatformSettings.data.web_search.{allow_domains, block_domains}`.
- **Aucune donnée sensible dans les chunks** : les documents doivent
  être créés explicitement par un rôle éditeur. Rien n'est indexé
  automatiquement en Phase 5 (l'auto-indexation des cours viendra en
  Phase 6).
- Journal complet : `AIAuditLog(kb_document_indexed | kb_search |
  web_search)` avec IP client.

**Design pgvector-ready** : le vecteur est stocké en JSONField pour
rester portable dev/tests. En production, une migration future peut
convertir vers `django-pgvector` sans casser le contrat côté services
(retrieval reste identique côté API).

**Vérification** : AST backend 13 fichiers Python OK, `tsc --noEmit`
0 erreur.

**Migration** : `python manage.py migrate ai` applique la 0005
(additive-safe, seed d'un espace GLOBAL).

**En pratique** — un formateur ouvre `/ai/knowledge`, crée un espace
"Ma pédagogie" (scope INSTRUCTOR), colle un texte long dans un
nouveau document → indexation immédiate → tape une question dans le
test RAG → voit 3-5 chunks pertinents triés par score de similarité
cosine. La recherche web filtre automatiquement les résultats à des
domaines institutionnels + affiche des badges "official / academic /
regulator" pour aider l'utilisateur à évaluer la fiabilité.

## AI-P4 — Agent outillé + confirmations 3 niveaux

Quatrième phase du module IA. Livraison de l'ossature d'un vrai agent :
l'IA peut désormais **exécuter des actions réelles** dans la
plateforme, avec un modèle de sécurité strict (RBAC + whitelist +
3 niveaux de confirmation) et un audit complet.

**Backend**

- **2 nouveaux modèles** (`ai/models.py`) :
  - `AIToolExecution` — journal des exécutions (tool_key, statut
    PENDING_APPROVAL → RUNNING → SUCCESS | FAILED | CANCELLED |
    DENIED, input/output JSON, latency_ms, IP client, conversation
    optionnelle).
  - `AIActionApproval` — file d'attente des confirmations sensibles
    (level 0/1/2, summary + impact + affected_items JSON +
    permissions_used, statut PENDING → CONFIRMED | CANCELLED |
    EXPIRED). OneToOne avec `AIToolExecution` pour tracer le lien.
- Migration `0004` additive-safe (2 tables, 6 index).
- **Framework tools** (`ai/tools/`) :
  - `AbstractAITool` base : `key`, `title`, `description`,
    `allowed_roles`, `confirmation_level`, `params_schema`,
    `build_preview()`, `run()`, `user_can_run()`.
  - `TOOL_REGISTRY` global + décorateur `@register`.
  - `dispatcher.py` : `list_tools_for_user()`, `request_execution()`,
    `confirm_execution()`, `cancel_execution()` — machine d'état
    complète avec RBAC, journalisation `AIToolExecution` +
    `AIAuditLog`, gestion des erreurs propre.
- **6 outils concrets** :
  - `search_courses` (**L0**, all) — recherche catalogue publiée.
  - `analyze_progress` (**L0**, learner/instructor/admin) — KPIs
    de progression + détection "à risque d'abandon" (last_activity
    > 30j).
  - `create_course_draft` (**L1**, instructor/admin) — création
    d'un cours brouillon.
  - `enroll_learner` (**L1**, instructor/admin) — inscription à un
    cours publié. Instructor limité à ses propres cours.
  - `publish_course` (**L2**, instructor/admin) — utilise
    `catalog.lifecycle.publish_course` existant (validation +
    CourseLifecycleEvent).
  - `deactivate_user` (**L2**, platform_admin uniquement) — bloque
    la connexion. Protection anti-auto-désactivation.
- **6 endpoints** (`api_ai_tools.py`), tous IsAuthenticated + RBAC
  fine per tool :
  - `GET /ai/tools/` — liste filtrée par rôle
  - `POST /ai/tools/execute/` — auto-exécute L0, crée approval L1/L2
  - `GET /ai/tools/approvals/?status=PENDING`
  - `POST /ai/tools/approvals/:id/confirm/`
  - `POST /ai/tools/approvals/:id/cancel/`
  - `GET /ai/tools/executions/` — historique user

**Frontend**

- Types (`ai-types.ts`) : `AIToolDescriptor`, `AIToolExecution`,
  `AIActionApproval`, `AIToolExecuteResponse`.
- 6 hooks TanStack (`hooks/ai.ts`) : `useAITools`, `useAIToolExecute`,
  `useAIToolApprovals`, `useAIToolApprovalConfirm`,
  `useAIToolApprovalCancel`, `useAIToolExecutions`.
- **`AIToolApprovalModal.tsx`** (~200 lignes) — modal premium :
  bandeau coloré selon le niveau (amber L1, rose L2), summary +
  impact + éléments concernés (JSON pretty-printed) + chips
  permissions, bandeau rouge d'alerte pour L2 (« Action sensible.
  Prenez le temps de vérifier… journalisée avec identité + IP »),
  boutons Confirmer (rouge L2, primary L1) / Annuler.
- **`AIToolsPage.tsx`** (`/ai/tools`, ~350 lignes) — atelier de
  test réservé instructor/admin :
  - Colonne gauche : liste des outils dispo avec icônes de niveau
    (⚡ Auto / 🛡 Simple / ⚠ Renforcée), rôles autorisés en chips.
  - Colonne droite : sélection → formulaire JSON initialisé avec
    les params par défaut + bouton Exécuter + affichage résultat.
  - Historique bas de page : 10 dernières exécutions avec badges
    statut colorés (SUCCESS emerald, FAILED rose, CANCELLED gris…).
- Router : nouvelle route `/ai/tools` (auth required, filtre
  interne instructor/admin).

**Sécurité & garanties**
- **Whitelist stricte** : un tool_key inconnu → refusé, journalisé.
- **RBAC par tool** : `allowed_roles` déclaratif, vérifié par
  `AbstractAITool.user_can_run()`. Les refus sont journalisés
  (`error_type="rbac_denied"`).
- **Confirmation obligatoire L1/L2** : impossible d'exécuter sans
  passer par l'approbation utilisateur.
- **Aucun tool ne fait de SQL brut** : chacun appelle les services
  métier existants (`catalog.lifecycle.publish_course`,
  `Enrollment.get_or_create`…).
- **Protection anti-auto-action** : `deactivate_user` refuse si
  `target.id == user.id`.
- Full journal `AIToolExecution` + `AIAuditLog` (avec IP client)
  pour chaque tentative, y compris les refus RBAC.

**Vérification** : AST backend OK (12 nouveaux fichiers Python),
`tsc --noEmit` 0 erreur.

**Migration** : `python manage.py migrate ai` applique la 0004.

**En pratique** — un admin clique sur `/ai/tools`, sélectionne
"Publier un cours", saisit `{"course_id": 42}`, clique Exécuter →
modal d'approbation renforcée s'ouvre avec impact + éléments
concernés + permissions utilisées → clique Confirmer → le cours
est réellement publié via le service métier, avec un
`CourseLifecycleEvent` journalisé côté `catalog` + un
`AIToolExecution` SUCCESS côté `ai`.

## AI-P3 — IA dans le builder + Recommandations apprenants

Troisième phase du module IA. Deux capacités clés livrées :
- Actions IA sur du texte, réutilisables partout dans l'éditeur.
- Moteur de recommandations personnalisées pour les apprenants avec
  boucle de feedback qui améliore les propositions futures.

**Backend**

- Nouveau modèle `AIRecommendation` (`ai/models.py`) avec 8 catégories
  (`for_you`, `continue`, `strengthen`, `discover`, `popular`,
  `certifying`, `short`, `path`) et 6 types de feedback. Contrainte
  d'unicité `(user, course, category)` pour éviter les doublons +
  index sur `(user, category)`.
- Migration `0003_airecommendation.py` additive-safe + 3 nouveaux
  kinds d'audit (`text_transform`, `reco_generated`, `reco_feedback`).
- **`ai/text_transform.py`** — service pour 18 actions IA sur texte
  (write, continue, improve, correct, reformulate, summarize, expand,
  simplify, professional, to_list, to_table, example, case_study,
  exercise, translate, adapt_beginner/intermediate/advanced). Chaque
  action a son instruction dédiée, prompt système strict, fallback
  déterministe si le LLM échoue.
- **`ai/recommendations.py`** — moteur 100% local (sans LLM) :
  - `_learner_profile()` compile `LearnerKYC.onboarding_profile`
    (topics, niveau, langue) + `Enrollment` (completed/active/dropped)
  - `_score_course()` calcule un match_score (0-100) basé sur niveau,
    langue, matching thème (naïf sur titre/description), popularité
  - `generate_recommendations()` produit 6 recos par catégorie avec
    exclusion des cours déjà refusés/complétés/en cours + persistence
    upsert
  - `submit_feedback()` accepte un retour +1/-1 sur une reco (crée
    l'entrée si absente pour tracer les feedbacks directs)
- **4 endpoints** (`api_ai_p3.py`) :
  - `POST /ai/text-transform/` — gate instructor/admin, journalise
  - `GET /ai/text-transform/actions/` — liste des 18 actions
  - `GET /ai/recommendations/` — recos groupées + course enrichi
    (titre, slug, level, thumbnail_url)
  - `POST /ai/recommendations/feedback/` — feedback avec catégorie
    optionnelle

**Frontend**

- Types (`ai-types.ts`) : `AITextAction`, `AITextTransformResult`,
  `AIRecoCategory`, `AIRecoFeedback`, `AIRecommendationItem`,
  `AIRecommendationsPayload`.
- 4 hooks TanStack (`hooks/ai.ts`) : `useAITextTransformActions`,
  `useTextTransform`, `useAIRecommendations`,
  `useAIRecommendationFeedback` (avec invalidation propre).
- **`AITextTransformMenu.tsx`** (~250 lignes) — menu déroulant groupé
  en 5 catégories (Rédaction, Améliorer, Format, Pédagogie, Adapter),
  sélecteur de langue pour l'action `translate`, modal d'aperçu avec
  texte source + résultat, boutons Insérer/Régénérer/Annuler. Se
  branche sur n'importe quel éditeur qui expose (selectedText,
  onInsert). Compact mode disponible.
- **`AIRecommendationWidget.tsx`** (~230 lignes) — bloc affichable sur
  n'importe quel dashboard : chips catégories dynamiques (uniquement
  les non-vides), grid 2 colonnes de RecoCard avec badge match %,
  badge certifiant, boutons feedback (intéressé / pas intéressé / plus
  tard), disparition douce après feedback négatif ("Retour enregistré").
- **`StudentDashboardPage`** : intègre `AIRecommendationWidget` en tête
  de dashboard (au-dessus des KPI) pour offrir immédiatement des
  recommandations à l'ouverture.

**Sécurité & garanties**
- Text-transform gate instructor OU platform_admin (les apprenants
  n'ont pas accès aux actions génératives sur du contenu).
- Recommandations accessibles à tout utilisateur authentifié
  (usage principal : learner).
- Feedback négatif exclut définitivement le cours des propositions
  futures (via `_refused_course_ids`).
- Aucune fuite inter-org : chaque appel filtre `user=request.user`.
- Journal `AIAuditLog` avec IP client pour chaque appel.

**Vérification** : AST backend OK, `tsc --noEmit` 0 erreur.

**Migration** : `python manage.py migrate ai` applique la 0003
(additive-safe, aucun data touché).

**En pratique**
- Formateur : dans l'éditeur de leçon, sélectionner du texte → cliquer
  "Actions IA" → choisir "Reformuler" / "Adapter au niveau débutant"
  → aperçu du résultat → Insérer remplace la sélection.
- Apprenant : ouvre son dashboard → voit 6 recommandations "Pour
  vous" avec match %, peut cliquer sur les onglets (Populaires,
  Certifiantes, Courtes…), noter chaque reco via 3 boutons feedback.

## AI-P2 — Générateur de cours IA (assistant guidé 6 étapes)

Deuxième phase du module IA. Le formateur peut désormais transformer
une simple instruction en cours complet (sections + leçons + quiz +
certification) validé humainement avant publication.

**Backend** — ajouts à l'app `ai/` :

- **Modèle `AICourseGeneration`** (`ai/models.py`) : singleton par
  session de génération, JSONField pour chaque étape (brief, plan,
  lessons_content, quizzes, certification), machine d'état simple
  (DRAFT → PLAN_READY → CONTENT_READY → QUIZ_READY → FINALIZED).
  Champ `finalized_course_id` pointant vers le `catalog.Course` créé.
- **Migration** `0002_aicoursegeneration.py` additive-safe + 3
  nouveaux `Kind` d'audit (`course_gen_start`, `course_gen_step`,
  `course_gen_finalize`).
- **Service** `ai/course_gen.py` :
  - `generate_plan(gen)` — appel LLM structuré JSON avec fallback
    déterministe `_default_plan()` basé sur le brief (durée →
    nb sections/leçons proportionnel).
  - `generate_lesson_content(gen, s_idx, l_idx)` — contenu HTML
    d'une leçon + key_points + resources.
  - `generate_section_quiz(gen, s_idx)` — 3-5 questions
    équilibrées (SINGLE/MULTIPLE/TRUE_FALSE/TEXT), difficulté variée.
  - `recommend_certification(gen)` — logique métier basée sur durée
    + niveau (PARTICIPATION < 4h, COURSE_CERTIFICATE 4-7h, CERTIFICATE
    ≥ 8h).
  - `finalize_generation(gen)` — transaction atomique qui crée
    `catalog.Course` (status=DRAFT), `CourseSection` par section,
    `Lesson` par leçon avec contenu HTML. Le cours n'est JAMAIS
    publié automatiquement.
- **Helper** `_try_extract_json()` — tolérant : accepte les blocs
  ```json ``` ou du JSON brut au milieu de la prose du LLM.
- **7 endpoints** (`api_ai_course_gen.py`), tous gates par
  `_user_can_generate` (instructor OU platform_admin) :
  - `POST/GET /ai/course-generations/` — création + liste
  - `GET/PATCH/DELETE /ai/course-generations/:id/`
  - `POST .../plan/`, `.../lesson/`, `.../quiz/`,
    `.../certification/`, `.../finalize/`

**Frontend** — nouveau wizard :

- **Types** (`ai-types.ts`) : `AICourseGeneration`, `AICoursePlan`,
  `AICourseSectionMeta`, `AICourseLessonContent`, `AICourseQuizQuestion`,
  `AICourseCertification`, `AICourseGenStatus`.
- **9 hooks TanStack** (`hooks/ai.ts`) : list/detail, create/patch/
  delete, generate plan/lesson/quiz/certification, finalize.
  Invalidation propre des queries entre étapes.
- **Page** `AICourseGeneratorPage.tsx` (~750 lignes) — wizard 6 étapes
  dans `InstructorShell` :
  1. **Brief** — formulaire : sujet + public + niveau + langue +
     durée + certif + instructions libres.
  2. **Plan** — liste éditable des sections (titre modifiable inline,
     suppression, régénération complète).
  3. **Contenu** — génération leçon par leçon OU "Tout générer" en
     boucle, indicateur ✓ Généré par leçon, comptage en temps réel.
  4. **Quiz** — génération par section avec preview des 4 premières
     questions + type/difficulté.
  5. **Certification** — recommandation LLM (badge amber) + 3
     boutons de choix explicite (PARTICIPATION / COURSE_CERTIFICATE /
     CERTIFICATE) persistés via PATCH.
  6. **Validation** — récapitulatif KPI + gros bouton "Créer le cours
     en brouillon". Après finalisation, redirection vers l'éditeur
     `/instructor/courses/:id/edit`.

Progress bar interactive en tête, chaque étape cliquable si
accessible (l'étape 2+ nécessite un genId créé).

**Route** — `/instructor/ai/generate-course?gen=<id>` (query param
`gen` pour reprendre une session après refresh).

**Sécurité & garanties** :
- Rôle instructor OU admin requis (403 sinon).
- Le cours créé à la finalisation est TOUJOURS en `status=DRAFT`.
  Aucune publication automatique — respecte le cahier des charges
  ("aucun contenu IA n'est publié sans validation humaine").
- Le fallback déterministe garantit une génération complète même sans
  clé LLM externe (utilise le stub-dev en dev).
- Journal `AIAuditLog` pour chaque étape (start / step / finalize) +
  IP client.

**Vérification** : AST backend OK, `tsc --noEmit` 0 erreur, route
protégée par `InstructorOnlyRoute`.

**Migration** : `python manage.py migrate ai` applique
`0002_aicoursegeneration.py` (additive-safe, aucune donnée touchée).

## AI-P1 — Fondations du module IA (assistant global + streaming)

Premier jalon du module IA. Cette phase pose les fondations sur
lesquelles s'appuieront le générateur de cours (P2), les
recommandations (P3), l'agent outillé (P4), le RAG (P5) et le centre
admin IA (P6). Objectif atteint : un assistant contextuel accessible
sur toutes les pages, avec streaming SSE et journalisation complète.

**Backend** — nouvelle app `ai/` :

- **Modèles** (`ai/models.py`) : `AIProvider` (config fournisseur —
  OpenAI-compat, Anthropic, Gemini, stub-dev), `AIModel` (couple
  provider+model_name+purpose), `AIConversation` (multi-org via
  `organization_id` nullable), `AIMessage` (rôle user/assistant/
  system/tool + `page_context` JSON + `feedback_score`), `AIUsageRecord`
  (tokens+coût+latency par appel), `AIAuditLog` (journal jamais purgé
  — trace tous les provider_call, création/suppression de
  conversation, feedback…).
- **Migration** `0001_initial.py` additive-safe qui seed le provider
  `stub-dev` + 5 modèles par défaut (un par purpose : chat_fast,
  chat_advanced, analysis, image, embedding). Permet de faire tourner
  l'assistant sans clé API en dev.
- **Provider abstraction** (`ai/providers/`) : `AbstractAIProvider`
  avec méthodes `stream_chat` / `chat`, drivers `StubProvider` (dev
  déterministe qui simule un stream), `OpenAICompatProvider` (compatible
  OpenAI/Azure/Ollama/DeepSeek/Mistral/Together/Groq via
  `/v1/chat/completions` SSE), `AnthropicProvider` (Messages API).
  Router `get_provider_for_purpose()` avec fallback stub garanti.
  Implémentation sans dépendance externe (urllib streaming).
- **Service** `stream_assistant_turn()` (`ai/services.py`) : persiste
  le message user, construit le prompt système avec rôle + contexte de
  page, streame les chunks, persiste la réponse assistante progressive,
  crée `AIUsageRecord` + `AIAuditLog`. Rendement d'un générateur
  d'évènements structurés `{type, ...}` prêt SSE.
- **Endpoints** (`api_ai.py`) : `GET/POST /ai/conversations/`,
  `GET/PATCH/DELETE /ai/conversations/:id/`, `POST /ai/conversations/:id/
  messages/` (SSE streaming via `StreamingHttpResponse`), `POST /ai/
  messages/:id/feedback/` (score ±1), `GET /ai/usage/`, `GET /ai/config/`.
  Tous gates par `user_can_use_assistant` (auth) + `user_can_access_
  conversation` (propriétaire ou platform_admin lecture).
- **RBAC** (`ai/permissions.py`) : matrice minimale P1 — auth requise,
  propriétaire seul modifie/supprime, `platform_admin` peut consulter.
  Le rôle est injecté dans le prompt système (`role_bundle`) pour
  préparer les capacités différenciées par profil (phases suivantes).
- Enregistrement dans `INSTALLED_APPS` (`base.py`).

**Frontend** — module `ai/` :

- **Types** (`ai-types.ts`) : `AIConversation`, `AIMessage`,
  `AIStreamEvent` union (`user_message` | `assistant_start` | `delta`
  | `assistant_done` | `error`).
- **Store Zustand persisté** (`stores/ai.ts`) : `useAIPanel` avec
  `isOpen`, `isFullscreen`, `activeConversationId` — remembers reload.
- **Client SSE** (`lib/ai-stream.ts`) : `fetch` streamé + parseur
  ligne à ligne (EventSource ne supportant pas POST body). AbortController
  pour interrompre.
- **Hooks TanStack** (`hooks/ai.ts`) : `useAIConfig`,
  `useAIConversations`, `useAIConversationDetail`,
  `useCreateAIConversation`, `usePatchAIConversation`,
  `useDeleteAIConversation`, `useAIFeedback`, `useAIUsage`.
- **Composants** (`components/ai/`) :
  - `AIMessageRenderer` — parseur Markdown minimal sans dépendance
    (titres, gras/italique, code inline & fences, listes, blockquotes,
    liens) avec escape HTML sûr.
  - `AIAssistantPanel` — side panel 420px ou fullscreen 4-inset,
    sidebar conversations en mode fullscreen (recherche + suppression),
    zone messages avec bulles user/assistant colorées, feedback ±1,
    bouton "Copier", stop pendant streaming.
  - `AIFloatingButton` — bouton flottant bottom-right premium, se
    cache quand le panel est ouvert.
  - `AIAssistant` — root component qui compose FloatingButton + Panel.
- **RootLayout** (`components/RootLayout.tsx`) : nouveau layout parent
  qui rend `<Outlet />` + `<AIAssistant />` — permet à `useLocation()`
  d'être disponible dans l'assistant. Le router (`router/index.tsx`)
  a été restructuré pour envelopper toutes les routes existantes dans
  cette route parent.

**Contexte de page** — à chaque message, le front envoie
`{route, search}` dans `page_context`. Le backend l'injecte dans le
prompt système (`page_hint`) pour que l'assistant sache où
l'utilisateur se trouve. Prêt à être enrichi (Phase 2+) avec
`entity_type`/`entity_id` selon la page (cours en édition, apprenant
consulté, KPI affiché…).

**Journalisation** — chaque tour d'assistant produit un
`AIUsageRecord` (tokens + latency + coût) et un `AIAuditLog`
(`kind=provider_call` + IP). Les conversations créées/supprimées
génèrent également un audit dédié.

**Streaming SSE** — la réponse assistant apparaît chunk par chunk
(effet "machine à écrire"). Le stub-dev simule 30ms de latence entre
chaque morceau pour valider le pipeline en dev.

**Vérification** : AST backend 15 fichiers OK, `tsc --noEmit` 0
erreur, aucune régression sur le router (route parent avec
`errorElement` conservé).

**Prochaines phases** :
- Phase 2 — Assistant de génération de cours 6 étapes (`AICourseGeneration`)
- Phase 3 — IA dans le builder + recommandations apprenants
- Phase 4 — Agent outillé (tool calls whitelist + 3 niveaux de confirmation)
- Phase 5 — RAG (`AIKnowledgeSpace/Document/Chunk` + pgvector) + web search
- Phase 6 — Centre admin IA (providers/quotas/audit) + versioning + images

## R47 — Création d'utilisateurs depuis le back-office admin

Jusqu'ici, la page `/admin/users` permettait de lister, filtrer,
désactiver, modifier un utilisateur — mais pas d'en créer un nouveau
depuis l'interface. Un admin qui voulait onboarder un formateur
devait passer par un shell Django (`createsuperuser` puis ORM manuel
pour le profil).

**Backend** — `POST /api/admin/users/` (`api_admin.py`) :
- Nouveau serializer `AdminUserCreateSerializer` avec 4 rôles
  (`LEARNER`, `INSTRUCTOR`, `ADMIN`, `STAFF`) et champs conditionnels
  (`instructor_headline`/`bio`/`payout_percent` pour formateur,
  `learner_job_title` pour apprenant).
- Mot de passe optionnel : si vide, `_generate_temp_password()` produit
  un mot de passe cryptographiquement solide (14 chars, mixte
  minuscule/majuscule/chiffre), renvoyé une seule fois dans la réponse.
- Transaction atomique : la création du User + le profil relié
  (`InstructorProfile` avec `is_verified=True` puisque créé par un
  admin, ou `LearnerProfile`) sont commit ensemble ou rollback ensemble.
- Rôles ADMIN/STAFF → `is_staff=True` automatique. ADMIN → également
  `platform_role=PLATFORM_ADMIN`.
- Réponse 201 avec `AdminUserDetailSerializer` + `created_role` +
  `temporary_password` (uniquement si généré côté serveur).
- Le sérialiseur détail est rendu défensif (`_active_memberships_cache`
  optionnel) pour ne pas crasher sur un user fraîchement créé.

**Frontend** — nouveaux hook + composant :
- `useCreateAdminUser()` dans `hooks/admin.ts` avec invalidation
  automatique de `admin-users`, `admin-overview`, `admin-instructors`.
- `CreateUserModal.tsx` (~350 lignes) : sélecteur de rôle en cards
  colorées, champs communs (email, nom, téléphone, mot de passe
  optionnel), section conditionnelle par rôle, écran de succès avec
  affichage du mot de passe temporaire + bouton "Copier" (uniquement
  si généré côté serveur, jamais ré-affiché ensuite), bouton "Créer un
  autre utilisateur" pour onboarder plusieurs personnes d'affilée.
- Bouton "Créer un utilisateur" ajouté en tête de `AdminUsersPage`
  (défaut INSTRUCTOR, ajustable dans le modal).

Fichiers : `best_epargne/apis/api_admin.py` (POST + serializer +
helper temp password), `frontend/src/hooks/admin.ts` (useCreateAdminUser),
`frontend/src/components/admin/CreateUserModal.tsx` (nouveau),
`frontend/src/pages/admin/AdminUsersPage.tsx` (bouton + wiring modal).

## R46 — Paramètres plateforme persistés + versionnés

Fin des paramètres "cosmétiques" : la page Paramètres devient pleinement
éditable, persistée en base et journalisée.

**Backend** — nouvelle app `core` équipée de modèles :
- `PlatformSettings` (singleton pk=1, `JSONField` avec 6 sections
  canonicalement définies : identity, auth, emails, storage, limits,
  maintenance). Compteur `version` incrémenté à chaque écriture,
  `updated_at` + `updated_by`. Méthodes helper `load()`, `merged_data()`
  (fusion défauts × data pour absorber les nouvelles clés sans
  migration), `apply_patch(patch, actor, note)` qui journalise et
  incrémente atomiquement.
- `PlatformSettingsHistory` — journal immuable before/after/actor/note
  avec méthode `diff_flat()` retournant la liste plate
  `[{section, key, old, new}]`.
- Migration `core/migrations/0001_initial.py` additive-safe qui crée
  les deux tables + seed le singleton via `RunPython` idempotent
  (défauts en français).

**Endpoints** — `best_epargne/apis/api_admin_platform_settings.py` :
- `GET /api/admin/platform-settings/` → `{version, updated_at, updated_by, data, defaults}`
- `PATCH /api/admin/platform-settings/` → applique un patch partiel
  `{section: {key: value}}` (whitelist stricte des clés déjà présentes
  dans les défauts), journalise, retourne le nouveau payload + `diff`
- `GET /api/admin/platform-settings/history/?limit=N` → 20 derniers
  changements avec diff détaillé

Toutes les vues gatent sur `is_platform_admin` (403 sinon).

**Frontend** — nouveaux hooks TanStack (`usePlatformSettings`,
`useUpdatePlatformSettings`, `usePlatformSettingsHistory`) et
composant réutilisable `SettingsSectionForm.tsx` :
- Rend automatiquement chaque champ à partir de son type (`boolean` →
  toggle, `number` → input number, `string` → input/textarea,
  `string[]` → TagsInput chips).
- Détection du dirty state, patch minimal envoyé (seulement les clés
  modifiées), bouton "Enregistrer la section" par tab, "Annuler",
  "Réinitialiser aux valeurs par défaut", flash "Enregistré ✓".

**AdminSettingsPage** entièrement refondu : 8 onglets — les 6 sections
persistées + un onglet "Runtime (.env)" qui garde l'ancien snapshot
`/admin/config/` (visibilité env/settings.py) + un onglet "Historique"
qui liste les versions avec diffs colorés (rouge → vert).

Fichiers : `core/models.py` (nouveau), `core/migrations/0001_initial.py`
(nouveau), `best_epargne/apis/api_admin_platform_settings.py` (nouveau),
`best_epargne/apis/api_urls.py` (2 routes), `frontend/src/hooks/admin.ts`
(hooks R46), `frontend/src/components/admin/SettingsSectionForm.tsx`
(nouveau), `frontend/src/pages/admin/AdminSettingsPage.tsx` (refonte).

**Migration** : `python manage.py migrate core` crée les 2 tables +
seed la ligne singleton. Aucune donnée existante impactée.

## R45 — Cockpit administrateur consolidé

Publié : le dashboard admin devient un vrai cockpit orienté action. Le
travail R28-R44 sur les 14 modules est maintenant relié en un seul
écran d'entrée.

**Backend** — nouvel endpoint `GET /api/admin/overview/` (`api_admin_overview.py`)
qui agrège en 1 appel :
- **Alertes actionnables** : `payouts_pending`, `payouts_validated`,
  `reviews_hidden`, `courses_draft`, `orders_pending`, `orders_failed`
- **KPI snapshot** : users total/active/new_7d, courses total/published,
  enrollments total/active, revenue du mois vs total, payouts net pending
- **Activité récente** : 10 derniers `CourseLifecycleEvent` avec
  enrichissement course_title + actor_email
- **Top 5 formateurs** : classés par nombre d'inscriptions agrégées

**Frontend** — nouveau composant `AdminOverviewSection.tsx` (~450 lignes)
inséré au-dessus du dashboard existant :
- **Bannière alertes** : chaque alerte cliquable envoie vers la vue
  filtrée correspondante (ex: payouts VALIDATED → `/admin/payouts?status=VALIDATED`)
- **5 SnapshotCards** : users, cours, inscriptions, revenus mois, payouts pending
- **Grille de 17 raccourcis** vers TOUS les modules admin avec icônes colorées par tone
- **Feed activité récente** avec badges `StatusBadge` par action + `timeAgo()`
- **Top 5 formateurs** avec avatars initiales + liens vers /admin/users/:id

**Composant `AdminDashboardPage`** — `<AdminOverviewSection />` inséré
juste après le `PageHeader`, au-dessus des KPI period-based existants
(R5). Aucune régression sur le reste.

Fichiers : `best_epargne/apis/api_admin_overview.py` (nouveau),
`frontend/src/components/admin/AdminOverviewSection.tsx` (nouveau),
`frontend/src/pages/AdminDashboardPage.tsx` (import + insertion).

## R44 — Paramètres avancés (view enrichie)

Publié : quatorzième et dernier placeholder débloqué. Layout onglets
premium au-dessus de `GET /api/admin/config/` existant (R7).

**Page `AdminSettingsPage`** — 6 onglets thématiques :
- **Identité** : nom, environnement (badge success/warning), timezone, langue
- **Auth & sécurité** : JWT / CORS / email reset (FeatureFlag), debug flag, JWT access lifetime
- **Emails** : documentation SMTP + snippet des variables d'env attendues
- **Stockage** : media_backend (nom court + FQN), variables MinIO/S3
- **Limites & quotas** : JWT lifetime, page sizes max
- **Maintenance** : commandes Docker (restart, migrate) + lien Django admin

Bannière contexte explicite : « Lecture seule — modification via .env /
settings.py (recharge container) ». Roadmap R46 : modèle
`PlatformSettings` versionné avec endpoint PATCH admin (édition SMTP /
identité / storage sans redéploiement).

Fichiers : `frontend/src/pages/admin/AdminSettingsPage.tsx` (nouveau, 400 lignes).

## État roadmap R28+ : ✅ 14/14 modules admin opérationnels

**TOUS les placeholders débloqués** — le back-office est complet côté
frontend. Aucune donnée mockée. Chaque module tape des vrais modèles
Django, avec les guards `is_platform_admin` sur les endpoints.

**Roadmap R45+** documentée pour les évolutions non essentielles :
- Rapports asynchrones Celery + Excel/PDF + planification email
- `PlatformSettings` versionné + PATCH SMTP/identité/storage sans redémarrage
- Modèle `Ticket` dédié pour remplacer le MVP Support (proxy Notifications)
- Batch mensuel automatique Payouts (Celery Beat)
- Intégration provider paiement (Wave / Orange Money) pour PAID auto
- Matrice permissions visuelle par module × action pour Groups Django

---

## Ancienne section — état roadmap au fil des livraisons

**Débloqués (R30-R42)** — Formateurs, Organisations, Modération avis,
Quiz plateforme, Contenu pédagogique, Audit lifecycle cours,
Inscriptions, Paiements, Marketing/Coupons, Rôles & permissions,
Support (MVP), Commissions, Reversements.

**Placeholders restants** :
- Rapports asynchrones (ReportJob + Celery pipeline + storage export)
- Paramètres avancés (PlatformSettings versionné + PATCH SMTP/storage)
  → snapshot lecture-seule sur `/admin/config` déjà en place R7

Roadmap R43+ : batch mensuel automatique Celery Beat pour générer les
Payouts pending, intégration provider paiement (Wave / Orange Money),
model Ticket dédié avec threads pour remplacer le MVP support.

**Débloqués (R30-R41)** — Formateurs, Organisations, Modération avis,
Quiz plateforme, Contenu pédagogique, Audit lifecycle cours,
Inscriptions, Paiements, Marketing/Coupons, Rôles & permissions,
Support (MVP notifications), Commissions.

**Placeholders restants** (nécessitent modèles DB nouveaux + workflow) :
- Reversements (Payout + PayoutBatch + provider paiement)
- Rapports (ReportJob async + Celery pipeline + storage export)
- Paramètres avancés (PlatformSettings versionné + PATCH email/SMTP/storage)
  → snapshot lecture-seule R7 déjà en place sur `/admin/config`

---

## Compatibilité rétroactive

- Toutes les migrations DB de la phase R sont **additives** (nouveaux champs nullable, nouvelles tables). Aucun rollback destructif nécessaire.
- Les endpoints hérités `/api/apis/instructor/courses-private/` restent en place le temps de la transition SPA (strangler-fig).
- Les templates Django legacy cohabitent avec la SPA React. La bascule finale attend la validation prod post-R8.

## Prochaine étape suggérée (hors périmètre)

- **R9** — Upload thumbnail cours (flow MinIO présigné), audit log admin, ouverture publique du SPA, déprécation des templates Django.

---

## SECURITE-05 + SECURITE-06 — Vérification e-mail et workflow d'approbation formateur

Livré : 41 fichiers touchés (23 backend + 15 frontend + 3 tests dossier),
~2 200 LOC nettes, 6 endpoints backend nouveaux, 4 pages frontend
nouvelles, ~65 cas pytest ajoutés.

### Résumé fonctionnel

**Vérification e-mail obligatoire** (SECURITE-05) — chaque inscription
publique reçoit désormais un lien de vérification. Tant que l'e-mail
n'est pas vérifié, l'utilisateur reste bloqué au niveau des permissions
DRF sur toute action métier (création cours, Best-AI, media library,
etc.). Les codes d'erreur normalisés (`EMAIL_NOT_VERIFIED`,
`ACCOUNT_SUSPENDED`, `INSTRUCTOR_NOT_APPROVED`, `ROLE_FORBIDDEN`,
`PERMISSION_DENIED`) permettent au frontend de rediriger
automatiquement vers l'écran approprié via un handler d'exceptions DRF
centralisé + un interceptor axios.

**Workflow d'approbation formateur** (SECURITE-06) — un compte
formateur nouvellement créé arrive en `is_verified=False`. Un admin
plateforme le valide (ou refuse) via `/admin/instructors`. Le
formateur voit son statut basculer automatiquement en ≤ 30 s grâce à
un poll `/me` sur la page d'attente. Un banner de bienvenue s'affiche
une seule fois au premier accès à l'espace instructor après
approbation. Toutes les décisions sont journalisées dans `AIAuditLog`
et consultables via `/admin/audit/security` (avec export CSV pour
audit RGPD).

### Backend — modèles + endpoints

**Migrations** :
- `compte/0007_user_email_verification_fields.py` — 4 nouveaux champs
  sur `User` : `is_email_verified` (indexé), `email_verification_token`,
  `email_verification_sent_at`, `email_verified_at`.

**Endpoints nouveaux** :
- `POST /api/auth/verify-email/` — Confirme un token (idempotent)
- `POST /api/auth/verify-email/resend/` — Renvoie un mail (cooldown 60 s)
- `POST /api/admin/instructors/{id}/approve/` — Valide un formateur
- `POST /api/admin/instructors/{id}/reject/` — Refuse avec raison
- `GET  /api/admin/instructors/pending-count/` — Compteur badge nav
- `GET  /api/admin/instructors/history/` — 50 dernières décisions
- `POST /api/admin/users/{id}/verify-email/` — Force verify (support)
- `GET  /api/admin/audit/security/` — Journal unifié filtrable
- `GET  /api/admin/audit/security/export/` — Export CSV (max 10 000 lignes)

**Endpoints enrichis** :
- `POST /api/auth/register/` — Whitelist stricte `account_type ∈
  {learner, instructor, org_admin}` (rejet `admin`/`platform_admin`/
  `super_admin` en 400). Création atomique du profil métier
  (LearnerProfile / InstructorProfile / Organization+Membership).
  Envoi automatique du mail de vérification.
- `GET  /api/auth/me/` — Nouveaux champs `email_verified`,
  `approval_status`, `profile.type`, `onboarding_completed`.
- `PATCH /api/admin/users/{id}/` — Journalise `USER_SUSPENDED`,
  `USER_REACTIVATED`, `USER_ROLE_CHANGED` dans `AIAuditLog`.

**Permissions DRF durcies** :
- `BaseActivePermission.is_valid_user` intègre la vérif e-mail avec
  bypass pour `is_platform_admin`. Par ricochet, `IsInstructor` et
  `IsLearner` refusent tous les users non vérifiés (~50 vues protégées
  sans modification individuelle).
- `ai.permissions.user_can_use_assistant` refuse également les users
  non vérifiés — protège toute la stack Best-AI (chat, tools, KB,
  text-transform, image gen).

**Handler exceptions DRF** :
- `compte.drf_exception_handler.enriched_exception_handler` — enrichit
  les 401/403 avec un `code` stable en inspectant `request.user`
  (`NOT_AUTHENTICATED`, `ACCOUNT_SUSPENDED`, `EMAIL_NOT_VERIFIED`,
  `PERMISSION_DENIED`).

**Management command** :
- `python manage.py audit_user_profiles [--apply]
  [--create-missing-profiles] [--json]` — détecte et répare 5 types
  d'incohérences (user sans profil métier, staff sans admin role,
  admin role sans staff, profils orphelins Instructor/Learner).

### Frontend — pages + composants

**Pages nouvelles** :
- `/verify-email` — auto-vérif via `?uid&token`, bouton renvoyer avec
  cooldown visuel, message de bienvenue si arrivée post-signup
- `/instructor-pending` — poll `/me` toutes les 30 s, redirection auto
  vers `/instructor` dès approbation, bouton "Vérifier maintenant"
- `/account-suspended` — écran de suspension + purge session locale
- `/admin/audit/security` — journal filtrable + 6 KPI cards + export CSV

**Composants existants enrichis** :
- `DashboardResolver` — redirige selon `email_verified` +
  `approval_status` + `is_active` (au lieu du fallback `/learn`
  hardcodé)
- `ProtectedRoute` — bloque les non-vérifiés (bypass via
  `requireVerifiedEmail={false}` pour les routes exemptées)
- Nouveaux guards `VerifiedEmailRoute`, `RoleRoute` (exportés pour
  usage futur)
- `AdminShell` — badge orange sur "Formateurs" quand `pending_count >
  0` (rafraîchi toutes les 60 s), nouvelle entrée nav "Audit sécurité"
- `AdminDashboardPage` — carte cliquable "N formateurs en attente" en
  haut du cockpit
- `AdminInstructorsPage` — colonne Actions (Approuver/Retirer), drawer
  historique, filtre `?verified=false` auto-appliqué depuis les query
  params URL
- `InstructorShell` — banner émeraude "Compte formateur validé" une
  seule fois par user (persistance localStorage)
- `LoginPage` — affichage cohérent des codes d'erreur backend, CTA
  "Ouvrir la page de vérification e-mail" quand `EMAIL_NOT_VERIFIED`
- `RegisterPage` — transmet `account_type` + `organization_name` au
  backend, redirige explicitement vers `/verify-email` avec state
  `justRegistered=true`
- `stores/auth.ts` — `errorCode` exposé pour piloter l'UX
- `lib/api.ts` — interceptor axios redirige sur 403 avec code
- `lib/types.ts` — `User` étendu avec `email_verified`,
  `approval_status`, `profile: UserProfile`, `onboarding_completed`

### Tests

~65 cas pytest répartis en 8 fichiers :
- `test_register_security.py` — whitelist rôle, extra fields ignorés,
  création atomique, envoi token
- `test_verify_email_endpoints.py` — verify + resend, expiration,
  cooldown, idempotence
- `test_permissions_email_verified.py` — bypass admin, refus
  non-vérifié sur Instructor/Learner
- `test_admin_instructor_approval.py` — approve/reject/history,
  filtres, agrégations
- `test_admin_force_verify_email.py` — support technique
- `test_admin_user_audit.py` — journalisation suspend/reactivate/
  role_change
- `test_admin_audit_security.py` — endpoint unifié, filtres, fenêtre
- `test_admin_audit_security_export.py` — CSV headers, colonnes,
  contenu

### Journalisation `AIAuditLog` — nouveaux kinds

Toutes les actions admin sensibles laissent une trace horodatée
consultable via l'endpoint et l'UI d'audit :

| Kind                     | Déclencheur                                     |
|--------------------------|-------------------------------------------------|
| `INSTRUCTOR_APPROVED`    | Approbation formateur par admin                 |
| `INSTRUCTOR_REJECTED`    | Rejet formateur (avec raison optionnelle)       |
| `EMAIL_FORCE_VERIFIED`   | Vérif e-mail forcée par support technique       |
| `USER_SUSPENDED`         | `is_active` bascule True → False sur PATCH      |
| `USER_REACTIVATED`       | `is_active` bascule False → True sur PATCH      |
| `USER_ROLE_CHANGED`      | `platform_role` change sur PATCH                |

### Post-déploiement — actions requises

```bash
# 1. Migration DB
docker compose exec bestweb python manage.py migrate compte

# 2. Audit + réparation des comptes existants
docker compose exec bestweb python manage.py audit_user_profiles
docker compose exec bestweb python manage.py audit_user_profiles \
    --apply --create-missing-profiles

# 3. Smoke test
docker compose exec bestweb pytest \
    tests/test_register_security.py \
    tests/test_verify_email_endpoints.py \
    tests/test_permissions_email_verified.py \
    tests/test_admin_instructor_approval.py \
    tests/test_admin_force_verify_email.py \
    tests/test_admin_user_audit.py \
    tests/test_admin_audit_security.py \
    tests/test_admin_audit_security_export.py \
    -v
```

**Effet immédiat en prod** : les utilisateurs déjà inscrits arrivent
avec `is_email_verified=False` (défaut du champ) — l'admin peut soit
les débloquer un par un via `POST /admin/users/{id}/verify-email/`,
soit exécuter un dry-run puis appliquer une migration SQL du type
`UPDATE compte_user SET is_email_verified = TRUE WHERE date_joined <
'{cutoff_date}'` selon la politique choisie (grandfather ou reset).

### Périmètre non couvert (backlog)

- Templates HTML des e-mails d'approbation/refus (actuellement texte
  brut envoyé par `_send_status_email`)
- Onboarding métier différencié post-vérification (steps guidés
  learner / instructor / org_admin)
- E2E Playwright complet du workflow inscription → vérif → attente →
  approbation → création cours
- Notifications in-app pour les événements de sécurité côté admin
  (au-delà du badge sidebar)
- Rate limiting spécifique sur `POST /api/auth/verify-email/` (pour
  l'instant utilise le scope `reset_password` — pertinent mais partagé)
