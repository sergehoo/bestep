# R28 — Espace admin : livraison + roadmap R29+

Ce document liste précisément **ce qui est fonctionnel maintenant**, **ce qui est en placeholder** et **quels endpoints backend restent à livrer** avant que chaque module soit branché à des données réelles.

Aucune donnée mockée n'a été introduite. Les modules qui n'ont pas de backend correspondant affichent une `AdminPlaceholderPage` documentée, avec un fallback vers l'admin Django pour les tâches opérationnelles critiques.

## 1. Livré et fonctionnel (R28)

| Module | Route | Endpoint backend |
|---|---|---|
| Cockpit administrateur | `/dashboard/admin` | `GET /api/dashboard/admin/?period=30d` |
| Utilisateurs | `/admin/users`, `/admin/users/:id` | `GET/PATCH /api/admin/users/...` |
| Cours (supervision) | `/admin/courses` | `GET /api/public/courses/` |
| Configuration (snapshot) | `/admin/config` | `GET /api/admin/config/` |
| Journal système (lifecycle cours) | `/admin/audit` | **NOUVEAU** `GET /api/admin/audit/course-lifecycle/` |
| Inscriptions (supervision) | `/admin/enrollments` | **NOUVEAU** `GET /api/admin/enrollments/` |
| Modèles de certificat | `/instructor/certificate-templates` | R20 existant |

**Composants réutilisables** (`components/admin/primitives.tsx`) :
`StatCard`, `StatusBadge`, `PageHeader`, `EmptyState`, `ErrorState`, `PermissionGuard`, `ConfirmDialog`, `ExportMenu`, `DataTable`.

**Nav admin** enrichie en 6 sections groupées (`Vue d'ensemble`, `Communauté`, `Catalogue`, `Certifications`, `Finance`, `Plateforme`) avec badge `WIP` sur les modules en attente de backend.

## 2. Placeholders honnêtes (backend requis R29+)

Chaque route ci-dessous affiche une `AdminPlaceholderPage` avec :
- Bannière statut (module en cours de livraison)
- Liste des features prévues (bullet points concrets)
- Liste des endpoints backend à créer
- Lien fallback vers l'admin Django

| Module | Route | Endpoints backend à créer | Modèles DB à créer |
|---|---|---|---|
| Formateurs | `/admin/instructors` | `GET /api/admin/instructors/`, `POST /instructors/<id>/validate/`, `POST /suspend/` | — (utilise `compte.User` existant) |
| Organisations | `/admin/organizations` | `GET/POST /api/admin/organizations/`, `PATCH /<id>/` | — (`organizations.Organization` existant) |
| Rôles & permissions | `/admin/roles` | `GET/POST /api/admin/roles/`, `GET/PATCH /<id>/permissions/` | **`AdminRole`, `Permission`** |
| Contenu pédagogique | `/admin/content` | `GET /api/admin/content/lessons/`, `/media/`, `/media/quota/` | — |
| Quiz plateforme | `/admin/quiz` | `GET /api/admin/quizzes/`, `/stats/` | — (`assessments.Quiz` existant) |
| Paiements | `/admin/payments` | `GET /api/admin/payments/`, `POST /<id>/refund/`, `GET /exports/` | — (`commerce.Order` existant) |
| Commissions | `/admin/commissions` | `GET/POST /api/admin/commissions/rules/`, `POST /simulate/` | **`CommissionRule`** |
| Reversements | `/admin/payouts` | `GET /api/admin/payouts/`, `POST /<id>/validate/`, `/pay/` | **`Payout`, `PayoutBatch`** |
| Marketing | `/admin/marketing` | CRUD complet | **`Coupon`, `Campaign`, `Segment`** |
| Modération | `/admin/moderation` | `GET /api/admin/moderation/reports/`, `POST /<id>/action/` | **`Report`, `AutoModRule`** |
| Support | `/admin/support` | `GET /api/admin/tickets/`, `POST /<id>/reply/` | **`Ticket`, `TicketMessage`** |
| Rapports | `/admin/reports` | `GET /templates/`, `POST /generate/` (async), `GET /<id>/status/` | **`ReportJob`** |
| Paramètres avancés | `/admin/settings` | `GET/PATCH /api/admin/settings/`, `POST /test-email/` | **`PlatformSettings`** (versionné) |

## 3. Priorités roadmap R29+ (backend)

Ordre suggéré (impact business × complexité) :

### Priorité 1 — Backend « argent »
- **R29** — Modèles `Payout` + `CommissionRule` + endpoints admin correspondants. Débloque les vues `/admin/payments`, `/admin/commissions`, `/admin/payouts` (vitales pour le business).
- Migration DB avec seed d'une règle de commission globale par défaut.
- Tests pytest sur le calcul (brut → commission → taxes → net).

### Priorité 2 — Communauté
- **R30** — Endpoint `/api/admin/instructors/` (filtre par role instructor) + workflow validation. Débloque `/admin/instructors`.
- **R31** — `/api/admin/organizations/` CRUD + import CSV collaborateurs. Débloque `/admin/organizations`.

### Priorité 3 — Confiance & modération
- **R32** — Modèle `Report` + endpoints modération + règles auto anti-spam. Débloque `/admin/moderation`.
- **R33** — Modèle `Ticket` + endpoints support + notifications. Débloque `/admin/support`.

### Priorité 4 — Insights
- **R34** — Rapports exportables asynchrones (Celery + storage MinIO). Débloque `/admin/reports`.
- **R35** — Marketing (Coupon, Campaign, Segment). Débloque `/admin/marketing`.

### Priorité 5 — Gouvernance
- **R36** — RBAC complet (`AdminRole`, `Permission` custom) + middleware. Débloque `/admin/roles`.
- **R37** — `PlatformSettings` versionné + interface `/admin/settings` complète.

## 4. Endpoints backend nouveaux livrés R28

Deux endpoints ajoutés :

### `GET /api/admin/audit/course-lifecycle/`

Fichier : `best_epargne/apis/api_admin_audit.py`.

Filtres query : `action`, `course_id`, `actor_id`, `since` (ISO date).
Pagination : 30 par page (override `?page_size=100` max).
Retour :
```json
{
  "count": 245,
  "next": "/api/admin/audit/course-lifecycle/?page=2",
  "results": [
    { "id": 1, "course_id": 7, "course_title": "…", "actor_id": 3,
      "actor_name": "Serge Ogah", "actor_email": "…", "action": "PUBLISHED",
      "action_label": "Publié", "from_status": "DRAFT", "to_status": "PUBLISHED",
      "note": "", "created_at": "2026-07-09T14:34:00Z" }
  ]
}
```

Réservé aux `is_platform_admin`. Renvoie 403 sinon.

### `GET /api/admin/enrollments/`

Fichier : `best_epargne/apis/api_admin_enrollments.py`.

Filtres query : `status` (ACTIVE|COMPLETED|CANCELED), `course_id`, `user_id`, `q` (email user).
Pagination : 30 par page.
Enrichit chaque enrollment avec `user_full_name`, `course_slug`, `course_title` pour éviter des N+1 côté front.

Réservé aux `is_platform_admin`. Renvoie 403 sinon.

## 5. Vérification qualité

- Typecheck TS : 0 erreur sur l'ensemble du projet.
- AST Python : 0 erreur sur les nouveaux endpoints.
- Aucune donnée mockée : chaque placeholder est explicite sur son statut.
- Toutes les routes admin sont derrière `AdminOnlyRoute` (route guard + backend guard `is_platform_admin`).
- Composants réutilisables : `DataTable`, `StatCard`, `StatusBadge`, `EmptyState`, `ErrorState`, `PermissionGuard`, `ConfirmDialog`, `ExportMenu` — pas de duplication.

## 6. Smoke test manuel

```bash
# Backend : migration (aucune nouvelle DDL, endpoints uniquement)
DJANGO_SETTINGS_MODULE=best_epargne.settings.dev python manage.py runserver

# 1. Se connecter avec un user is_platform_admin
# 2. Aller sur /dashboard/admin → cockpit OK
# 3. Aller sur /admin/audit → doit afficher le journal (au moins 1 entrée si un cours a été publié)
# 4. Aller sur /admin/enrollments → doit afficher les inscriptions
# 5. Aller sur /admin/payments (placeholder) → doit afficher la bannière WIP + liste features + endpoint Django
# 6. Navigation sidebar : toutes les entrées WIP sont clairement badgées
```
