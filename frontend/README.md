# Best Épargne — Frontend React (R3+)

Application SPA React consommant l'API Django Best Épargne.
Stack : **Vite + TypeScript + Tailwind + Zustand + TanStack Query + Axios + React Router**.

---

## Quickstart

```bash
cd frontend

# 1. Installer les dépendances
npm install

# 2. Configurer l'env local
cp .env.example .env.local
# Éditer VITE_API_URL pour pointer vers votre backend :
#   Dev local  : VITE_API_URL=http://localhost:8000
#   Prod       : VITE_API_URL=https://ayo-group.com

# 3. Lancer le dev server (port 5173)
npm run dev

# 4. Build production
npm run build

# 5. Preview du build
npm run preview

# 6. Lint + typecheck
npm run lint
npm run typecheck
```

---

## Structure

```
frontend/
├── index.html                   # Point d'entrée HTML
├── src/
│   ├── main.tsx                 # Bootstrap React + providers
│   ├── index.css                # Tailwind directives
│   ├── vite-env.d.ts            # Types env vars
│   ├── App.tsx                  # (optionnel)
│   ├── router/
│   │   └── index.tsx            # React Router + ProtectedRoute
│   ├── stores/
│   │   └── auth.ts              # Zustand : auth state persisté
│   ├── hooks/
│   │   └── queries.ts           # Hooks TanStack Query typés
│   ├── lib/
│   │   ├── api.ts               # Axios + interceptors JWT refresh
│   │   ├── types.ts             # Types partagés (miroir API)
│   │   └── utils.ts             # cn, formatPrice, formatDuration
│   ├── components/
│   │   ├── ui/                  # Button, Card, Badge, Input, Spinner
│   │   └── layout/              # PublicHeader
│   └── pages/
│       ├── HomePage.tsx         # Landing publique
│       ├── CatalogPage.tsx      # Catalogue avec filtres
│       ├── CourseDetailPage.tsx # Fiche cours
│       ├── LoginPage.tsx
│       ├── RegisterPage.tsx
│       ├── DashboardPage.tsx    # Dashboard par rôle (student/instructor/admin)
│       └── NotFoundPage.tsx
├── tailwind.config.ts           # Palette bleu/jaune Best Épargne
├── vite.config.ts               # Vite + proxy /api → backend
├── tsconfig.json
└── package.json
```

---

## Design system

Cohérent avec le backend Django (P2) :
- **Bleu primaire** : `primary-600` (`#0C87D6`)
- **Jaune accent** : `accent-500` (`#F7A600`)
- **Neutre** : `neutral-*` (gris ink)

Composants disponibles :
- `<Button variant="primary|secondary|outline|ghost|danger|success" size="xs|sm|md|lg" />`
- `<Card>` / `<CardHeader>` / `<CardBody>` / `<CardFooter>`
- `<Badge variant="primary|accent|success|warning|danger|info|neutral" size="xs|sm|md|lg" />`
- `<Input label="..." error="..." required />`
- `<Spinner size="xs|sm|md|lg|xl" />`

---

## Authentication (JWT R1)

Le store `useAuthStore` gère les tokens (access 15min, refresh 7j) :

```tsx
import { useAuthStore, useIsAuthenticated } from '@/stores/auth';

function MyComponent() {
  const login = useAuthStore((s) => s.login);
  const user = useAuthStore((s) => s.user);
  const isAuthed = useIsAuthenticated();

  await login({ email, password });
}
```

Le client Axios (`lib/api.ts`) :
- Injecte automatiquement `Authorization: Bearer <token>` sur chaque requête
- Refresh automatique sur 401 (avec race-safe : 1 seul refresh en vol)
- Redirect `/login?next=` sur échec du refresh

---

## Data fetching (TanStack Query)

```tsx
import { usePublicCourses, useStudentDashboard } from '@/hooks/queries';

function CatalogList() {
  const { data, isLoading, error } = usePublicCourses({
    category: 'finance',
    sort: 'popular',
    page: 1,
  });
  // ...
}
```

Cache 30s par défaut, `placeholderData` pour transitions douces.

---

## Roadmap frontend (Phases R4-R8)

| Phase | Contenu |
|---|---|
| ✅ R3 | Bootstrap complet (config + auth + UI + 4 pages) |
| R4 | Pages publiques enrichies (fiche cours détaillée + preview lessons + reviews) |
| R5 | Dashboards par rôle complets (charts Recharts, listes détaillées, filtres) |
| R6 | Gestion cours (instructor) : CRUD cours + modules + lessons + workflow publish |
| R7 | Admin : gestion users, permissions, config globale |
| R8 | Tests E2E Playwright + PWA (service worker) + deploy CI/CD |

---

## Deploy

### Build production

```bash
npm run build
# → dist/ contient les assets minifiés + sourcemaps
```

### Serve depuis Django (option intégrée)

Copier `dist/` dans `/staticfiles/frontend/` et configurer une route
Django catch-all qui sert `index.html`.

### Serve depuis Nginx (recommandé)

```nginx
server {
  listen 443 ssl;
  server_name app.ayo-group.com;

  root /var/www/bestepargne-front/dist;
  index index.html;

  # SPA fallback : toutes les routes non-file → index.html
  location / {
    try_files $uri $uri/ /index.html;
  }

  # API proxy vers Django
  location /api/ {
    proxy_pass http://django-backend:8000/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Voir `docs/FRONTEND_SETUP.md` (à venir R8) pour le deploy CI/CD complet.

---

## Variables d'environnement

Voir `.env.example` pour la liste. En prod, `VITE_API_URL` doit pointer
vers le domaine du backend Django (CORS_ALLOWED_ORIGINS mis à jour côté
Django avec le domaine du frontend).
