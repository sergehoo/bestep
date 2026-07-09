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

---

## Compatibilité rétroactive

- Toutes les migrations DB de la phase R sont **additives** (nouveaux champs nullable, nouvelles tables). Aucun rollback destructif nécessaire.
- Les endpoints hérités `/api/apis/instructor/courses-private/` restent en place le temps de la transition SPA (strangler-fig).
- Les templates Django legacy cohabitent avec la SPA React. La bascule finale attend la validation prod post-R8.

## Prochaine étape suggérée (hors périmètre)

- **R9** — Upload thumbnail cours (flow MinIO présigné), audit log admin, ouverture publique du SPA, déprécation des templates Django.
