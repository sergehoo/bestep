# API Contract Best Épargne — Référence frontend React

> Phase R2 de la refonte React. Contract API exhaustif pour brancher
> le SPA React (Vite + TanStack Query + Axios).
> Toutes les URL sont relatives à `https://ayo-group.com` en prod.
> Doc OpenAPI complète : `/api/docs/` (Swagger UI).

---

## 1. Authentication

Toutes les requêtes authentifiées envoient :

```
Authorization: Bearer <access_token>
```

Voir R1 (`docs/PROFILES_PERMISSIONS.md`) pour les JWT.

### Endpoints auth

| Méthode | URL | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register/` | 🌐 | Inscription |
| POST | `/api/auth/login/` | 🌐 | Login → tokens + user |
| POST | `/api/auth/refresh/` | 🌐 | Renouvelle access |
| POST | `/api/auth/logout/` | 🔒 | Blacklist refresh |
| GET | `/api/auth/me/` | 🔒 | Profil + prefs + roles |
| PATCH | `/api/auth/me/` | 🔒 | Update full_name/phone |
| POST | `/api/auth/password/change/` | 🔒 | Change mot de passe |
| POST | `/api/auth/password/reset/` | 🌐 | Demande reset (enum-safe) |
| POST | `/api/auth/password/reset/confirm/` | 🌐 | Confirme reset avec token |

Légende : 🌐 = public, 🔒 = requiert JWT

### Réponse login/register

```json
{
  "access": "eyJhbGciOiJIUzI1NiIs...",
  "refresh": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 42,
    "email": "alice@example.com",
    "full_name": "Alice Dupont",
    "phone": "",
    "avatar_url": null,
    "roles": ["learner", "instructor"],
    "is_platform_admin": false,
    "preferences": {
      "theme": "system",
      "language": "fr",
      "notifications_email": true,
      "notifications_marketing": false,
      "notifications_course_reminders": true,
      "public_profile": false
    },
    "created_at": "2026-06-28T14:32:00Z",
    "last_login": "2026-06-28T14:32:00Z"
  }
}
```

---

## 2. Public API (catalogue anonyme)

Tous ces endpoints sont accessibles **sans authentification**.

### GET /api/public/courses/ — Liste catalogue

**Query params** :
- `q` : recherche fulltext (title + subtitle)
- `category` : slug de catégorie
- `course_type` : `CERTIFIANTE` | `PROFESSIONNELLE` | `ACADEMIQUE`
- `pricing` : `FREE` | `PAID` | `HYBRID`
- `sort` : `recent` (défaut) | `popular` | `price_asc` | `price_desc`
- `page` : numéro (défaut 1)
- `page_size` : items/page (défaut 12, max 48)

**Réponse** :
```json
{
  "count": 42,
  "next": "https://ayo-group.com/api/public/courses/?page=2",
  "previous": null,
  "results": [
    {
      "id": 1,
      "title": "Investir en bourse",
      "slug": "investir-en-bourse",
      "subtitle": "De zéro à investisseur",
      "thumbnail_url": "https://.../thumb.jpg",
      "category": { "id": 3, "name": "Finance", "slug": "finance" },
      "instructor": {
        "id": 7,
        "full_name": "Alice Dupont",
        "avatar_url": "https://.../avatar.jpg"
      },
      "course_type": "CERTIFIANTE",
      "pricing_type": "PAID",
      "price": "45000.00",
      "currency": "XOF",
      "published_at": "2026-01-15T09:00:00Z",
      "enrolled_count": 234,
      "rating_avg": "4.75",
      "rating_count": 42
    }
  ]
}
```

### GET /api/public/courses/{slug}/ — Détail cours

**Réponse** : mêmes champs que le listing + `description`, `preview_video_url`, `sections`, `sections_count`, `lessons_count`, `total_duration_sec`.

Le tableau `sections` contient :
```json
[
  {
    "id": 12,
    "title": "Module 1 — Les fondamentaux",
    "order": 1,
    "lessons": [
      {
        "id": 45,
        "title": "Qu'est-ce que l'épargne ?",
        "order": 1,
        "lesson_type": "VIDEO",
        "is_preview": true,
        "duration_sec": 320
      }
    ]
  }
]
```

### GET /api/public/courses/{slug}/lessons/{id}/preview/

Retourne le contenu d'une leçon **si et seulement si** `is_preview=True`. Sinon 403.

Utile pour "essayez avant de payer".

### GET /api/public/categories/

Liste des catégories qui ont ≥ 1 cours PUBLISHED. Pour hydrater les filtres du catalogue React.

```json
[
  { "id": 3, "name": "Finance", "slug": "finance" },
  { "id": 5, "name": "Investissement", "slug": "investissement" }
]
```

### GET /api/public/courses/&lt;slug&gt;/reviews/ 🌐  *(R4)*

Liste paginée des avis publics d'un cours PUBLISHED.

**Query params** :

| Param | Type | Valeur par défaut | Description |
|---|---|---|---|
| `ordering` | string | `recent` | `recent`, `rating_high`, `rating_low` |
| `page` | int | `1` | Numéro de page |
| `page_size` | int | `10` (max 20) | Éléments par page |

**Réponse (paginated)** :

```json
{
  "count": 42,
  "next": "https://.../?page=2",
  "previous": null,
  "results": [
    {
      "id": 17,
      "rating": 5,
      "comment": "Excellent cours, très clair.",
      "user_name": "Alice Dupont",
      "created_at": "2026-06-12T10:15:00Z"
    }
  ]
}
```

- `user_name` : prénom+nom si dispo, sinon partie locale de l'email, sinon "Apprenant".
- Aucune donnée sensible (email/id user) exposée.

### GET /api/public/courses/&lt;slug&gt;/reviews/summary/ 🌐  *(R4)*

Agrégat des avis : moyenne, total et distribution 1–5 étoiles.

```json
{
  "average": 4.7,
  "count": 89,
  "distribution": { "1": 1, "2": 2, "3": 5, "4": 20, "5": 61 }
}
```

Utilisé pour :
- Le widget "4.7 ★ (89 avis)" dans le hero du cours.
- La barre de distribution graphique dans l'onglet "Avis".

### GET /api/public/courses/&lt;slug&gt;/related/ 🌐  *(R4)*

Cours similaires (même catégorie), excluant le cours courant.

- Retourne au max **6** cours.
- Ordre : `-enrolled_count, -published_at`.
- Fallback : cours les plus populaires si aucune catégorie ou aucun match.

Réponse : tableau de `PublicCourseListItem` (même schéma que `/api/public/courses/`).

---

## 3. Dashboards par rôle

Tous les endpoints dashboards acceptent **depuis R5** un query param optionnel :

| Param | Valeurs | Défaut | Effet |
|---|---|---|---|
| `period` | `7d` \| `30d` \| `90d` | `30d` | Ajoute un champ `series` avec des points/jour sur la période, gaps remplis à 0. |

Chaque série est de la forme :

```json
[
  { "date": "2026-06-10", "value": 42 },
  { "date": "2026-06-11", "value": 0 }
]
```

### GET /api/dashboard/student/ 🔒

**Rôle** : tout utilisateur authentifié.

```json
{
  "kpis": {
    "in_progress": 3,
    "completed": 7,
    "certificates": 5,
    "total_hours": 42.5
  },
  "continue_enrollment": {
    "id": 12,
    "status": "ACTIVE",
    "enrolled_at": "2026-06-01T10:00:00Z",
    "progress_percent": 65,
    "course": {
      "id": 42,
      "slug": "investir-en-bourse",
      "title": "Investir en bourse",
      "thumbnail_url": "https://.../thumb.jpg"
    },
    "current_lesson_id": 156
  },
  "recent_enrollments": [ /* même format × 5 */ ],
  "series": {
    "period": "30d",
    "activity_minutes_per_day": [
      { "date": "2026-06-10", "value": 42.5 },
      { "date": "2026-06-11", "value": 0 }
    ]
  }
}
```

### GET /api/dashboard/instructor/ 🔒 (instructor bypass admin)

```json
{
  "kpis": {
    "total_courses": 12,
    "published_courses": 8,
    "draft_courses": 2,
    "review_courses": 1,
    "archived_courses": 1,
    "total_enrollments": 456,
    "avg_rating": 4.63,
    "rating_count": 89
  },
  "recent_courses": [
    {
      "id": 1,
      "slug": "investir-en-bourse",
      "title": "Investir en bourse",
      "status": "PUBLISHED",
      "pricing_type": "PAID",
      "price": "45000.00",
      "currency": "XOF",
      "thumbnail_url": "https://.../thumb.jpg",
      "enrolled_count": 234,
      "rating_avg": 4.75,
      "rating_count": 42,
      "created_at": "2026-01-01T10:00:00Z",
      "updated_at": "2026-06-15T14:00:00Z"
    }
  ],
  "top_courses": [
    { "id": 1, "slug": "investir-en-bourse", "title": "Investir en bourse", "enrolled_count": 87 }
  ],
  "series": {
    "period": "30d",
    "enrollments_per_day": [ { "date": "2026-06-10", "value": 5 } ],
    "revenue_per_day":    [ { "date": "2026-06-10", "value": 125000.0 } ]
  }
}
```

- `top_courses` : max 5, triés par inscriptions **sur la période** (fallback : cours du formateur les plus récents si aucune inscription).
- `revenue_per_day` : cumulé quotidien des `Payment.amount` en statut `PAID`.

### GET /api/dashboard/admin/ 🔒 (platform admin only)

```json
{
  "kpis": {
    "users_total": 5432,
    "users_active": 4521,
    "courses_total": 89,
    "courses_published": 67,
    "courses_draft": 15,
    "courses_archived": 7,
    "enrollments_total": 12456,
    "enrollments_active": 8765,
    "enrollments_completed": 3691,
    "revenue_total": 45678900.00,
    "payments_count": 3241
  },
  "top_courses": [
    {
      "id": 1,
      "title": "Investir en bourse",
      "slug": "investir-en-bourse",
      "enrolled_count": 512,
      "instructor_name": "Alice Dupont"
    }
  ],
  "series": {
    "period": "30d",
    "new_users_per_day":    [ { "date": "2026-06-10", "value": 12 } ],
    "enrollments_per_day":  [ { "date": "2026-06-10", "value": 45 } ],
    "revenue_per_day":      [ { "date": "2026-06-10", "value": 675000.0 } ]
  },
  "generated_at": "2026-06-28T14:32:00Z"
}
```

---

## 3bis. Admin plateforme (R7)

Tous les endpoints exigent `platform_role=PLATFORM_ADMIN` (ou superuser).
Retournent `403` sinon.

### GET /api/admin/users/ 🔒 admin

Query params : `q`, `role` (`admin|instructor|learner|all`),
`is_active` (`true|false`), `page`, `page_size` (max 100).

```json
{
  "count": 5432,
  "next": "…", "previous": null,
  "results": [
    {
      "id": 42,
      "email": "alice@example.com",
      "full_name": "Alice Dupont",
      "phone": "",
      "is_active": true,
      "platform_role": "USER",
      "is_platform_admin": false,
      "is_instructor": true,
      "is_learner": false,
      "has_organization": true,
      "date_joined": "2026-01-14T09:12:00Z",
      "last_login": "2026-07-08T18:04:00Z"
    }
  ]
}
```

### GET /api/admin/users/&lt;id&gt;/ 🔒 admin

Comme la liste + `memberships[]`, `enrollments_count`, `courses_created_count`.

### PATCH /api/admin/users/&lt;id&gt;/ 🔒 admin

Champs modifiables (whitelist) :

```json
{
  "is_active": true,
  "platform_role": "USER" | "PLATFORM_ADMIN",
  "full_name": "…",
  "phone": "…"
}
```

**Anti-lockout** : `400` si l'admin tente de désactiver ou rétrograder
son propre compte.

### POST /api/admin/users/&lt;id&gt;/reset-password/ 🔒 admin

Renvoie `{ detail, token, expires_at }`. Le token permet de terminer
le reset via `/api/auth/password/reset/confirm/`.

### GET /api/admin/config/ 🔒 admin

Snapshot lecture-seule : app (env/debug/timezone/langue), features
(jwt/cors/email_reset/media_backend), limits, counts users.

---

## 4. Gestion cours (Instructor)

Endpoints existants réutilisés (namespace `/api/apis/courses/` du ViewSet DRF) + endpoints lifecycle (P1) :

| Méthode | URL | Description |
|---|---|---|
| GET | `/api/apis/courses/` | Liste mes cours (instructor) |
| POST | `/api/apis/courses/` | Créer un cours |
| GET | `/api/apis/courses/{id}/` | Détail cours |
| PATCH | `/api/apis/courses/{id}/` | Update cours |
| DELETE | `/api/apis/courses/{id}/` | Delete (refusé si Enrollment) |
| POST | `/api/instructor/courses/{id}/publish/` | DRAFT → PUBLISHED |
| POST | `/api/instructor/courses/{id}/unpublish/` | PUBLISHED → DRAFT |
| POST | `/api/instructor/courses/{id}/archive/` | any → ARCHIVED |
| POST | `/api/instructor/courses/{id}/restore/` | ARCHIVED → DRAFT |

Sections + Lessons :

| Méthode | URL |
|---|---|
| GET/POST | `/api/instructor/courses/{course_id}/sections/` |
| GET/POST | `/api/instructor/courses/{course_id}/sections/{id}/lessons/` |

---

## 5. Enrollments (Apprenant)

| Méthode | URL | Description |
|---|---|---|
| GET | `/api/apis/enrollments/` | Mes inscriptions |
| POST | `/api/apis/enrollments/` | S'inscrire (body: `{ course_id }`) |
| GET | `/api/apis/enrollments/{id}/` | Détail inscription |
| POST | `/api/apis/lesson-progress/` | Update progression leçon (body: `{ lesson_id, progress_percent, is_completed }`) |

Sécurité : uniquement `user=request.user` (audit P1.A).

---

## 6. Codes HTTP

| Code | Signification | Exemple |
|---|---|---|
| 200 | Success | GET /me/ |
| 201 | Created | POST /register/ |
| 205 | Reset Content | POST /logout/ |
| 400 | Validation error | Email déjà pris |
| 401 | Unauthenticated | JWT expiré / manquant |
| 403 | Forbidden | Rôle insuffisant |
| 404 | Not Found | Cours slug inconnu |
| 405 | Method Not Allowed | POST sur endpoint GET-only |
| 429 | Throttle | Trop de tentatives login |
| 500 | Server Error | Bug backend (à monitorer) |

### Format erreur DRF standard

```json
{
  "detail": "Authentification requise."
}
```

Ou pour les validations :

```json
{
  "email": ["Ce champ est obligatoire."],
  "password": ["Le mot de passe est trop court."]
}
```

---

## 7. Pagination

DRF `PageNumberPagination` sur tous les listings :

```json
{
  "count": 42,
  "next": "?page=3",
  "previous": "?page=1",
  "results": [ ... ]
}
```

Query params : `?page=2&page_size=20` (max défini par endpoint).

---

## 8. Client React recommandé

### Axios instance avec interceptors JWT

```typescript
// src/lib/api.ts
import axios from 'axios';
import { useAuthStore } from '@/stores/auth';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'https://ayo-group.com/api',
  headers: { 'Content-Type': 'application/json' },
});

// Interceptor request : ajoute JWT
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().access;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Interceptor response : refresh auto sur 401
let refreshing: Promise<string> | null = null;

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      if (!refreshing) {
        refreshing = useAuthStore.getState().refresh();
      }
      try {
        const access = await refreshing;
        original.headers.Authorization = `Bearer ${access}`;
        return api(original);
      } catch (e) {
        useAuthStore.getState().logout();
        window.location.href = '/login';
      } finally {
        refreshing = null;
      }
    }
    return Promise.reject(error);
  },
);

export default api;
```

### Stores Zustand (auth)

```typescript
// src/stores/auth.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '@/lib/api';

type User = {
  id: number;
  email: string;
  full_name: string;
  avatar_url: string | null;
  roles: string[];
  is_platform_admin: boolean;
  preferences: Record<string, any>;
};

type AuthState = {
  access: string | null;
  refresh: string | null;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<string>;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      access: null,
      refresh: null,
      user: null,
      login: async (email, password) => {
        const { data } = await api.post('/auth/login/', { email, password });
        set({ access: data.access, refresh: data.refresh, user: data.user });
      },
      logout: async () => {
        try {
          await api.post('/auth/logout/', { refresh: get().refresh });
        } catch (_) { /* ignore */ }
        set({ access: null, refresh: null, user: null });
      },
      refresh: async () => {
        const { data } = await api.post('/auth/refresh/', { refresh: get().refresh });
        set({ access: data.access, refresh: data.refresh });
        return data.access;
      },
    }),
    { name: 'be-auth' },
  ),
);
```

### Hooks TanStack Query pour /public/

```typescript
// src/hooks/usePublicCourses.ts
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

type Filters = {
  q?: string;
  category?: string;
  course_type?: string;
  pricing?: string;
  sort?: string;
  page?: number;
};

export function usePublicCourses(filters: Filters = {}) {
  return useQuery({
    queryKey: ['public-courses', filters],
    queryFn: async () => {
      const { data } = await api.get('/public/courses/', { params: filters });
      return data;
    },
    staleTime: 60_000,
  });
}

export function usePublicCourseDetail(slug: string) {
  return useQuery({
    queryKey: ['public-course', slug],
    queryFn: async () => {
      const { data } = await api.get(`/public/courses/${slug}/`);
      return data;
    },
    enabled: !!slug,
  });
}
```

---

## 9. Environment variables React

`.env.example` frontend :

```
VITE_API_URL=https://ayo-group.com/api
VITE_APP_NAME=Best Épargne
VITE_ENV=production
VITE_SENTRY_DSN=  # optionnel
```

---

## 10. À la production

- **CORS** : ajouter le domaine frontend dans `DJANGO_CORS_ALLOWED_ORIGINS`
  (env var backend)
- **JWT signing** : distinct de `SECRET_KEY` en prod via `JWT_SIGNING_KEY`
- **Doc live** : `/api/docs/` (Swagger UI, essaies interactifs)
