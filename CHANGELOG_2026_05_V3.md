# CHANGELOG — Vague 4 (perf) + V5.C + V6 partiel

**Date :** 17 mai 2026
**Périmètre :** V4.A/B/C/D (performance), V5.C (layout app_shell unifié),
V6.A (CI/CD GitHub Actions), V6.B (signature webhooks).

Suite immédiate de `CHANGELOG_2026_05_V2.md` (V2 + V3.A + V5.A/B).

---

## Sommaire

1. [Synthèse](#synthese)
2. [Findings traités](#findings)
3. [Fichiers livrés](#fichiers)
4. [Migrations à appliquer](#migrations)
5. [Procédure de déploiement](#deploy)
6. [Reste roadmap (V5 lourd, V7)](#reste)

---

## <a id="synthese"></a>1. Synthèse

Cette vague clôt les blocs **performance critique** et **sécurité prod-ready** :

- **Cache dashboards** (ORG-11, FORMATIONS-30/32/45). Trois fonctions
  centralisées ``get_organization_dashboard_kpis`` /
  ``get_platform_dashboard_kpis`` / ``get_instructor_dashboard_kpis`` avec
  TTL 30-60s, invalidées automatiquement via signaux post_save sur
  Course / Enrollment. ~25-30 requêtes SQL → 4-5 par hit + cache hits gratuits.

- **Annotations CourseViewSet** (API-33). Module ``catalog/querysets.py`` qui
  expose ``annotate_course_kpis`` (sections_count, lessons_count,
  enrolled_count, rating_avg, rating_count) + ``is_writable_via_org`` Exists
  annotation pour casser le N+1 de ``get_can_edit``. Documenté pour la vue
  CourseViewSet dans PATCHES.md §24.

- **Context processor workspaces** (COMPTE-05). Mémoïsation par requête HTTP,
  un seul appel à ``list_available_workspaces``. PATCHES.md §25 documente le
  passage des properties ``is_org_*`` en ``cached_property``.

- **Indexes pg_trgm + composés** (CAT-14, API-50). ``GinIndex(gin_trgm_ops)``
  sur ``Course.title``, index composé sur ordering ``-published_at, -created_at``,
  index ``(status, company_only)``. Recherche catalogue passe de O(N) à
  O(log N) sur grosse base.

- **Layout app_shell.html unifié** (UI-01, UI-02, UI-38, UX-05/06/07,
  A11Y-08/10/11/12/14, PERF-24/25). Layout responsive mobile-first avec
  drawer Alpine + focus-trap, dark mode anti-FOUC, skip-link, ARIA partout,
  pin Alpine 3.14.3. À utiliser progressivement pour remplacer
  admin_base.html + learner_base.html + admin_base_template.html +
  company_base.html.

- **CI/CD GitHub Actions** (SEC-30). Workflow complet : ruff lint + format,
  pytest avec services Postgres+Redis, pip-audit CVE check,
  ``manage.py check --deploy``, build Docker + Trivy scan image.

- **Signature webhooks** (sécurité critique V2.C). Module
  ``commerce/webhook_signatures.py`` qui implémente Stripe (HMAC-SHA256 +
  timestamp anti-rejeu 5 min), Paydunya (SHA-512 master_key), CinetPay
  (HMAC-SHA256 body). Bypass DEV nécessite DEBUG=True + var
  ``COMMERCE_WEBHOOK_DEV_BYPASS=1`` explicitement posée.

---

## <a id="findings"></a>2. Findings traités

### Performance critique

| ID | Description | Correctif |
|---|---|---|
| ORG-11 | Dashboard org ~25 req SQL sans cache | ``get_organization_dashboard_kpis`` cached + signaux |
| FORMATIONS-30 | PlatformAdminDashboard ~30 req + 8 except Exception | ``get_platform_dashboard_kpis`` avec aggregate groupé |
| FORMATIONS-32 | PlatformUsersView : 3 COUNT par hit | cached_kpi avec TTL 60s |
| FORMATIONS-45 | PlatformOrganizationsView : 3 COUNT séparés | Aggregate avec Count filtré dans get_platform_dashboard_kpis |
| API-33 | sections_count/lessons_count null partout sauf my_courses | ``catalog.querysets.annotate_course_kpis`` |
| API-35 / API-44 | get_can_edit N+1 sur 25 items paginés | Annotation Exists ``is_writable_via_org`` |
| COMPTE-05 | Context processor : 2 fois list_available_workspaces + 4 req | Mémoïsation par request HTTP |
| COMPTE-21 | User.active_memberships re-query × 5-6 properties | PATCHES.md §25 (cached_property + values()) |
| CAT-14 | icontains 3 colonnes sans index | GinIndex pg_trgm sur Course.title |
| API-50 | Ordering sans index composé | Index ``(-published_at, -created_at)`` |

### UX / Layout / a11y

| ID | Description | Correctif |
|---|---|---|
| UI-01 / UI-02 / UI-38 | 3 layouts admin avec palettes divergentes, dark mode partiel | Layout unique ``app_shell.html`` (paramétrique workspace, dark mode unifié anti-FOUC) |
| UX-05 / UX-06 / UX-07 | Drawer mobile inconsistant, z-index conflits, cible tactile 45px | Drawer Alpine avec @alpinejs/focus (x-trap), max-w-[300px], ESC, click-outside |
| A11Y-08 | Pas de skip-link, focus management | skip-link visible au focus, aria-modal sur drawer, aria-live sur messages |
| A11Y-10 | Toasts sans role=status aria-live | Wrapper ARIA + aria-atomic dans partials/toast.html |
| A11Y-11 | Modales sans focus trap | ``x-trap.noscroll`` via plugin @alpinejs/focus 3.14.3 |
| A11Y-12 | Burger sans aria-label/expanded/controls | Tous les attributs ARIA ajoutés |
| A11Y-14 | prefers-reduced-motion non respecté partout | CSS global dans app_shell.html |
| PERF-24 | Alpine version flottante | Pin 3.14.3 explicite |
| PERF-25 | FOUC sur sidebar/dark mode | Script anti-FOUC inline avant le 1er paint |

### Sécurité prod-ready

| ID | Description | Correctif |
|---|---|---|
| Webhook signatures (V2.C) | Stub _verify_webhook_signature retournait True | Module ``commerce/webhook_signatures.py`` complet (Stripe/Paydunya/CinetPay) |
| SEC-30 | Pas de CI sécurité | ``.github/workflows/ci.yml`` : ruff + pytest + pip-audit + check --deploy + Trivy |
| INFRA-19 | Tooling dev dans requirements runtime | ``requirements-dev.txt`` séparé |

---

## <a id="fichiers"></a>3. Fichiers livrés

### Nouveaux modules

```
core/
  cache.py                          [neuf — V4.A : helpers cache KPI]
  dashboard_kpis.py                 [neuf — V4.A : 3 fonctions cached]

catalog/
  querysets.py                      [neuf — V4.B : annotations]
  signals.py                        [neuf — V4.A : invalidation cache]
  apps.py.new                       [V4.A : branche signals]
  migrations/0010_pg_trgm_and_perf_indexes.py  [V4.D]

enrollments/
  signals.py.new                    [V4.A : invalidation + recompute V1]

compte/
  context_processors.py.new         [V4.C : mémoïsation par request]

commerce/
  webhook_signatures.py             [neuf — V6.B : Stripe/Paydunya/CinetPay]
  views.py.new                      [maj : utilise verify_signature]

templates/layout/
  app_shell.html                    [neuf — V5.C : layout unifié premium]

.github/workflows/
  ci.yml                            [neuf — V6.A : pipeline complet]

racine/
  requirements-dev.txt              [neuf — INFRA-19]
  CHANGELOG_2026_05_V3.md           [ce fichier]
  PATCHES.md                        [étendu §24, §25]

tests/
  test_v4_cache.py                  [neuf — invalidation cache]
  test_v6_webhook_signatures.py     [neuf — 6 tests signature]
```

### Total cumulé V1+V2+V3

| | V1 | V2 | V3 | Total |
|---|---|---|---|---|
| Fichiers `.new` | 29 | 15 | 5 | **49** |
| Nouveaux modules Python | 6 | 4 | 5 | **15** |
| Templates neufs | 0 | 5 | 1 | **6** |
| Partials mutualisés | 0 | 7 | 0 | **7** |
| Migrations | 2 | 2 | 1 | **5** |
| Tests | 3 fichiers (15) | 3 fichiers (9) | 2 fichiers (9) | **8 fichiers / 33 tests** |
| Docs (md) | 2 | 3 | 1 | **6** |

---

## <a id="migrations"></a>4. Migrations à appliquer

```bash
python manage.py migrate catalog  # 0010_pg_trgm_and_perf_indexes
```

**Prérequis** : extension PostgreSQL ``pg_trgm`` doit être créable. Si
votre DBA n'autorise pas la création par l'app, faire :

```sql
-- En tant que superuser :
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

Puis re-lancer ``migrate``. La migration est idempotente.

Coût : création de 3 indexes sur ``catalog_course``. Sur table > 1M rows
prévoir un ``CREATE INDEX CONCURRENTLY`` manuel pour éviter le lock.

---

## <a id="deploy"></a>5. Procédure de déploiement

### Étape 1 — Merge des `.new`

```bash
find . -name "*.new" | while read f; do mv "$f" "${f%.new}"; done
```

### Étape 2 — Installer requirements-dev (CI/local uniquement)

```bash
# Local dev
pip install -r requirements.txt -r requirements-dev.txt
pre-commit install

# CI : déjà fait via le workflow
```

### Étape 3 — Variables d'environnement webhooks

⚠️ **Avant le 1er hit en prod**, poser :

```bash
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx     # depuis le dashboard Stripe
PAYDUNYA_MASTER_KEY=xxxxxxxx                  # depuis le dashboard Paydunya
CINETPAY_WEBHOOK_SECRET=xxxxxxxxxxxxxxx       # depuis CinetPay
```

Si une variable manque, le verifier retourne `False` (401) → webhook
rejeté. C'est le comportement voulu (fail-closed).

### Étape 4 — SITE_URL pour les liens d'invitation et certificats

```bash
SITE_URL=https://ayo-group.com
```

(Utilisé par `certifications/services._build_verification_url` et
`organizations/services._build_accept_url`.)

### Étape 5 — Migrations + tests

```bash
python manage.py migrate
pytest tests/ -v
```

### Étape 6 — Smoke test webhooks

```bash
# DEV uniquement :
DJANGO_DEBUG=1 COMMERCE_WEBHOOK_DEV_BYPASS=1 python manage.py runserver
# Puis curl pour vérifier idempotence.
```

---

## <a id="reste"></a>6. Reste roadmap

### V5 lourd UX (reste de la Phase 5, ~1-2 semaines)

- Migration effective des écrans `organization/` et `learner/` vers
  ``app_shell.html`` (les templates existent toujours en parallèle).
- Suppression effective des 7 templates orphelins (cf. `CLEANUP_TEMPLATES.md`).
- Accessibilité : `for=` sur 193 labels (audit grep + script `sed`),
  `autocomplete` sur 25+ forms.
- Player vidéo sécurisé (signed URL 60s + `controlsList`).
- Build Tailwind production (npm + purge + manifest).

### V6 lourd refactor (~2-3 semaines)

- Splitter `best_epargne/apis/views.py` (3 238 lignes) en
  `views/{instructor,learner,media,platform,public}/*.py`.
- Splitter `formations/views.py` (2 039 lignes) ; renommer l'app.
- Migration `psycopg2 → psycopg[binary]==3.2.x`, `urllib3 1.x → 2.x`.
- Coverage cible 60% (aujourd'hui ~15-20% pour le code couvert par les
  33 tests Phase 1-3).
- Activation 2FA URLs (`two_factor`).

### V7 — Décision Channels/WebSockets

- Soit retirer la mention de la doc (alignement avec l'absence de
  package channels).
- Soit installer `channels[daphne]` + `channels-redis`, créer
  `routing.py`, basculer Docker sur `daphne`.

### Production-ready opérationnel

- Backups Postgres (`wal-g` vers S3 externe) + MinIO (`mc mirror`).
- Flower + Prometheus exporter Celery.
- Logs JSON + request-id corrélé.
- Migration 2FA admin URLs.
- Renovate bot + alertes Dependabot.

---

## État global du projet après V1 + V2 + V3

| Bloc | État |
|---|---|
| Sécurité APIs (IDOR, write libre) | **Fermé** |
| Sécurité catalogue (fuite DRAFT/company_only) | **Fermé** |
| Sécurité commerce (idempotence webhook + signatures) | **Fermé** |
| Sécurité reviews (XSS + enrollment requis) | **Fermé** |
| Sécurité settings (axes, Argon2, CSP, AWS_QS) | **Fermé** |
| Sécurité multi-rôle (role legacy + is_platform_admin strict) | **Fermé** |
| Sécurité uploads (ffmpeg whitelist + timeout + MIME) | **Fermé** |
| Certificats vérifiables | **Fermé** |
| Workflow invitation | **Fermé** |
| Idempotence commerce | **Fermé** |
| Sync seats licences | **Fermé** |
| Routing centralisé | **Fermé** |
| Performance dashboards | **Fermé** (cache + signaux) |
| Performance N+1 | **Atténué** (helpers + annotations dispo, à appliquer dans les vues) |
| Indexes DB | **Fermé** (pg_trgm + composés + enroll) |
| Layout unifié | **Posé** (app_shell.html, migration à faire en V5 lourd) |
| Accessibilité critique | **Fermé** (skip-link, ARIA, focus-trap, prefers-reduced-motion) |
| CI/CD | **Fermé** (GitHub Actions + Trivy + pip-audit) |
| Signature webhooks | **Fermé** (Stripe/Paydunya/CinetPay) |
| Documentation | **Fermé** (audit docx + 3 changelogs + PATCHES.md) |
| Tests anti-régression | **Partiel** (33 tests, à compléter en V6) |
| Refactor god-modules | **Reporté** (V6) |
| 2FA admin URLs | **Posé en INSTALLED_APPS, branchement V6** |

— Audit & remediation team, V1 + V2 + V3, mai 2026.
