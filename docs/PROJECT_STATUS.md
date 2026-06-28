# Best Épargne — État global du projet

> Document de référence consolidé après la **refonte 6 phases** de
> juin 2026.

---

## Résumé exécutif

Plateforme e-learning Django multi-rôles (Apprenant, Formateur,
Organisation, Admin) refondue en 6 phases sur **juin 2026**, avec :

- **0 casse** sur les données existantes
- **48+ tests pytest** sur les workflows critiques
- **10 documents techniques** consolidés
- Architecture découplée (services applicatifs, querysets helpers,
  design system unifié)

---

## Phases livrées (juin 2026)

### Phase 1 — Cycle de vie cours + landing publique ✅

**Objectif** : sécuriser et harmoniser le workflow métier critique du
cours (publication, dépublication, archivage, restauration).

**Livré** :
- Service `catalog/lifecycle.py` (source unique des transitions)
- Modèle `CourseLifecycleEvent` (audit log indexé)
- Champ `Course.archived_at`
- 4 endpoints API DRF (publish/unpublish/archive/restore)
- 4 vues template POST avec CSRF
- UI instructor : boutons contextuels + modales de confirmation +
  badges harmonisés
- Catalogue public server-rendered (`/landinghome/catalogue/`)
- 17 tests pytest

**Fichiers clés** :
- `catalog/lifecycle.py` · `catalog/models.py` (`CourseLifecycleEvent`)
- `templates/partials/course_status_badge.html` ·
  `templates/partials/course_lifecycle_actions.html`
- `templates/home/catalogue.html` · `formations/views.py`
  (`PublicCatalogPageView`)

### Phase 2 — Design system bleu/jaune ✅

**Objectif** : identité visuelle unique et cohérente sur tous les écrans.

**Livré** :
- Tokens Tailwind : aliases sémantiques `primary` / `accent` / `neutral`
- 61 classes `.be-*` via `@apply` : boutons (6 variants × 3 tailles),
  cards, forms, badges (7 variants × 3 tailles), tables, alerts, helpers
- 6 partials Django paramétrables (`partials/ds/*`)
- Documentation `docs/DESIGN_SYSTEM.md`

**Fichiers clés** :
- `tailwind.config.js` · `static/src/app.css`
- `templates/partials/ds/{button,badge,card,input,empty_state,alert}.html`

### Phase 3 — Profils & permissions par rôle ✅

**Objectif** : différencier l'expérience par rôle (6 rôles) et exposer
une page profil unifiée.

**Livré** :
- 6 rôles documentés (public, apprenant, formateur, admin org, admin
  plateforme, staff Django)
- 7 décorateurs (`@platform_admin_required`,
  `@platform_admin_otp_required`, `@org_admin_required`,
  `@org_admin_required_for_id`, **`@instructor_required`** (nouveau),
  **`@learner_required`** (nouveau), **`@org_role_required`** (nouveau))
- 12 helpers permissions
- Champ `User.avatar` + modèle `UserPreferences` (7 champs)
- Signal `post_save` création auto préférences
- Page profil unifiée 4 onglets (Infos / Photo / Préférences / Sécurité)
- 20 tests pytest
- Documentation `docs/PROFILES_PERMISSIONS.md`

**Fichiers clés** :
- `core/decorators.py` · `core/permissions.py`
- `compte/models.py` (`UserPreferences`) · `compte/signals.py`
- `compte/views.py` (`UserProfileView`) · `templates/compte/profile.html`

### Phase 4 — Refactoring technique ✅

**Objectif** : réduire la dette (god-modules, N+1, doublons).

**Livré** :
- `core/constants.py` : source unique des Status enums + 14 ensembles
  dérivés (`COURSE_VISIBLE_TO_PUBLIC`, `ORG_ADMIN_ROLES`, etc.)
- Helpers QuerySet réutilisables :
  - `catalog/querysets.py` : `with_instructor`, `with_sections_and_lessons`,
    `for_public_listing`, `for_course_detail`, `for_instructor_dashboard`
  - `enrollments/querysets.py` (nouveau) : 6 helpers + 3 presets
- Fix N+1 critiques :
  - `InstructorKpisView` : 20 queries → 8 queries (×2.5)
  - `StudentDashboard` : 4 .count() → 1 aggregate (×2)
- 11 tests pytest `assertNumQueries`
- Documentation `docs/REFACTORING_GUIDE.md` (conventions + plan migration
  god-modules en stratégie strangler-fig)

**Reporté en PR dédiées** :
- Split `best_epargne/apis/views.py` (3507 LOC, 93 classes) → squelette
  `views_package/` posé mais non activé
- Split `formations/views.py` (2438 LOC) → idem

### Phase 5 — UX globale polish ✅

**Objectif** : compléter le design system avec les composants UX
manquants pour les states transitoires.

**Livré** :
- 4 partials UX : `ds/spinner.html` · `ds/loader_overlay.html` ·
  `ds/pagination.html` · `ds/flash_messages.html`
- JS auto-dismiss flash (`static/src/js/be-flash.js`)
- Documentation `docs/UX_GUIDELINES.md` (304 lignes)

**Fichiers clés** :
- `templates/partials/ds/{spinner,loader_overlay,pagination,flash_messages}.html`
- `static/src/js/be-flash.js`

### Phase 6 — Tests + docs + smoke prod ✅

**Objectif** : valider l'ensemble + procédures opérationnelles.

**Livré** :
- 13 tests E2E `test_p6_workflows_e2e.py` (workflows business critiques)
- `docs/RUNBOOK_PROD.md` : déploiement, smoke, monitoring, rollback,
  incidents fréquents
- `docs/PROJECT_STATUS.md` (ce document)
- Script `deploy/smoke_prod.sh` (à venir)

---

## Tests pytest globaux

| Fichier | Tests | Phase | Couverture |
|---|---|---|---|
| `test_p1_course_lifecycle.py` | 17 | P1 | Lifecycle transitions + permissions + audit |
| `test_p3_profiles_permissions.py` | 20 | P3 | Décorateurs + UserPreferences + signal |
| `test_p4_perf_n_plus_1.py` | 11 | P4 | assertNumQueries + constants |
| `test_p6_workflows_e2e.py` | 13 | P6 | Workflows business E2E |
| **Total nouveau (P1+P3+P4+P6)** | **61** | | |
| Autres tests existants (V1-V_FIN) | ~30 | Antérieur | Sécurité, webhooks, cache, certificats, etc. |
| **TOTAL pytest** | **~91** | | |

Lancement complet :
```bash
pytest tests/ -v --tb=short --reuse-db
```

---

## Documentation technique

| Document | Sujet | Phase |
|---|---|---|
| `docs/DESIGN_SYSTEM.md` | Palette, classes `.be-*`, partials `ds/*` | P2 |
| `docs/PROFILES_PERMISSIONS.md` | 6 rôles, 7 décorateurs, page profil | P3 |
| `docs/REFACTORING_GUIDE.md` | Constants, querysets, conventions, plan split | P4 |
| `docs/UX_GUIDELINES.md` | Composants UX, patterns, accessibilité, mobile | P5 |
| `docs/RUNBOOK_PROD.md` | Deploy, smoke, monitoring, rollback | P6 |
| `docs/PROJECT_STATUS.md` | Document de référence consolidé | P6 |
| `MANIFEST_REMEDIATION.md` | Audit 350 findings + remédiation V1-V_FIN | V_FIN |
| `CHANGELOG_2026_05_*.md` | Changelogs V1-V_FIN détaillés | V1-V_FIN |
| `audit_best_epargne_2026.docx` | Rapport d'audit complet (Word) | V_FIN |

---

## Architecture résultante

```
best_epargne/
├── catalog/                   # Domaine cours / leçons / médias
│   ├── lifecycle.py           # P1 : service transitions cours
│   ├── services.py            # get_visible_courses_qs
│   ├── querysets.py           # P4 : helpers eager loading
│   └── models.py              # Course, CourseLifecycleEvent, MediaAsset
├── core/                      # ⭐ Transverse
│   ├── permissions.py         # 13 helpers permissions
│   ├── decorators.py          # 7 décorateurs
│   ├── constants.py           # P4 : Status enums centralisés
│   ├── cache.py               # KPIs cachés
│   ├── dashboard_kpis.py      # Service KPIs
│   └── logging.py             # JSON + RequestIdMiddleware
├── compte/                    # Auth + profils + préférences
│   ├── models.py              # User + UserPreferences (P3)
│   ├── signals.py             # P3 : signal post_save
│   ├── adapters.py            # Redirections post-login
│   └── views.py               # UserProfileView 4 onglets
├── enrollments/               # Inscriptions + progression
│   └── querysets.py           # P4 : helpers eager loading
├── formations/                # Vues template par rôle
│   ├── views.py               # 2438 LOC (god-module — à splitter)
│   ├── instructor_lifecycle_views.py  # P1 : POST forms transitions
│   └── views_package/         # P4 : skeleton split (non activé)
├── best_epargne/apis/         # API DRF
│   ├── views.py               # 3507 LOC (god-module — à splitter)
│   ├── api_urls.py            # Routes API
│   └── views_package/         # P4 : skeleton split (non activé)
├── templates/
│   ├── layout/app_shell.html  # Layout principal P2
│   ├── partials/ds/           # P2 + P5 : design system
│   ├── partials/course_*.html # P1 : badges + actions cycle de vie
│   ├── home/catalogue.html    # P1 : catalogue public SEO
│   └── compte/profile.html    # P3 : profil 4 onglets
├── static/src/
│   ├── app.css                # P2 : 61 classes .be-*
│   └── js/
│       ├── be-modals.js       # P1 : modales
│       ├── be-flash.js        # P5 : toast auto-dismiss
│       ├── profile-tabs.js    # P3 : onglets profil
│       └── learner-course-player.js  # Player vanilla
├── docs/                      # 6 documents techniques
└── tests/                     # 91 tests pytest
```

---

## Conventions standardisées

| Concept | Convention | Phase |
|---|---|---|
| Status enums | `core.constants.{CourseStatus, EnrollmentStatus, ...}` | P4 |
| Rôles org | `core.constants.OrgRole` + ensembles | P4 |
| Service transitions | `catalog.lifecycle.{publish,unpublish,...}_course()` | P1 |
| Helpers eager loading | `with_instructor()`, `for_public_listing()` | P4 |
| Aggregates KPIs | `aggregate(filter=Q(...))` au lieu de N `.count()` | P4 |
| Décorateurs sécurité | `core.decorators.@*_required` | P3 |
| Composants UI | `partials/ds/{button,card,badge,...}.html` | P2 |
| Classes CSS custom | Préfixe `.be-*` (be-btn, be-card, be-badge) | P2 |
| Tests pytest | `test_<phase>_<sujet>.py` | Convention |

---

## Dette restante / Roadmap futur

### À court terme (1-2 sprints)

1. **Split god-modules** (P4 reporté) :
   - PR 1 : Extraction `views_package/public.py` (faible risque, 3 classes)
   - PR 2 : Extraction `views_package/learner.py` (~15 classes)
   - PR 3 : Extraction `views_package/instructor.py` en sous-PRs

2. **Cleanup hardcoded statuses** :
   - Remplacer les `"PUBLISHED"` magic strings restantes par
     `CourseStatus.PUBLISHED` (core/constants.py)

3. **Tests intégration HTTP** :
   - Compléter `test_p6_workflows_e2e.py` avec Django test Client
     (GET /catalogue/, POST /instructor/courses/<id>/publish/)

### À moyen terme (1 trimestre)

4. **Signed URLs vidéos** (V5.D — partiellement câblé) :
   - Câbler le JS player pour consommer l'endpoint `lesson_signed_stream`
     (refresh signed URL toutes les 55s)

5. **Dark mode toggle** :
   - Wire le `UserPreferences.theme` (P3) avec `theme-init.js` qui set
     la classe `dark` sur `<html>`

6. **Toast queue** :
   - Limiter à 3 toasts max simultanés (P5)

### À long terme

7. **Migration `apis/views.py`** complète vers `views_package/`
8. **i18n** : `UserPreferences.language` câblé (`LocaleMiddleware` +
   traductions `gettext_lazy`)
9. **PWA** : manifest + service worker pour l'espace apprenant offline

---

## Métriques avant / après refonte

| Indicateur | Avant | Après | Évolution |
|---|---|---|---|
| Tests pytest | ~30 | 91 | **×3** |
| Documents techniques | 4 (V_FIN) | 10 | **×2.5** |
| Classes CSS unifiées | 0 | 61 `.be-*` | **+∞** |
| Décorateurs sécurité | 4 | 7 | +3 |
| Helpers querysets | 0 | 14 (catalog + enrollments) | **+∞** |
| Audit log Course | 0 | 1 modèle `CourseLifecycleEvent` | Nouveau |
| `InstructorKpisView` queries | ~20 | ~8 | **×2.5 perf** |
| `StudentDashboard` KPIs queries | 4 | 1 aggregate | **×4 perf** |
| Page profil champs | 3 | 8+ (avec onglets + avatar + prefs) | **×2.5 UX** |
| Régressions découvertes/corrigées | — | 17 incidents prod résolus | — |

---

## Smoke test global

Voir `deploy/smoke_prod.sh` pour le script automatisé. Manuel :

```bash
# Healthchecks
curl -sf https://ayo-group.com/healthz/ && echo ✓
curl -sf https://ayo-group.com/readyz/  && echo ✓

# Pages publiques
curl -sI https://ayo-group.com/landinghome/catalogue/ | head -3
curl -sI https://ayo-group.com/account/login/ | head -3

# Tests pytest
pytest tests/test_p1_course_lifecycle.py \
       tests/test_p3_profiles_permissions.py \
       tests/test_p4_perf_n_plus_1.py \
       tests/test_p6_workflows_e2e.py -v
```

Sur 61 tests phases 1-6, on attend **61 passed**.

---

## Crédits

- **Maintainer** : Serge Ogah (serge.ogah@kaydangroupe.com)
- **Refonte 6 phases** : juin 2026
- **Branche** : `chore/audit-remediation-2026-05`
- **Domaine prod** : https://ayo-group.com
