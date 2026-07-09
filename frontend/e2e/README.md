# E2E tests — Best Épargne (R8.2)

Suite Playwright pour valider les flows critiques.

## Prérequis

- Backend Django lancé sur `http://localhost:8000` (ou variable
  `PLAYWRIGHT_API_URL`).
- Frontend Vite lancé automatiquement par `playwright.config.ts`
  (`webServer` en dev, à démarrer manuellement en CI).

## Commandes

```bash
# 1. Installer les navigateurs (première fois)
npm run e2e:install

# 2. Lancer la suite complète en headless
npm run e2e

# 3. Mode UI interactif (dev)
npm run e2e:ui

# 4. Un seul test
npx playwright test e2e/smoke.spec.ts

# 5. Report HTML (après une exec)
npx playwright show-report
```

## Structure

- `smoke.spec.ts` — smoke tests publics (ne dépendent pas du backend
  auth). Doit toujours passer, y compris sans DB peuplée.
- `auth.spec.ts` — flow JWT (register/login/protected route). Utilise
  les fixtures pour créer un user à la volée via l'API backend.
- `fixtures.ts` — factory `createUser()` + helper `seedAuth()` pour
  injecter les tokens dans le localStorage (skip le login UI).

## Variables d'environnement

| Nom | Défaut | Description |
|---|---|---|
| `PLAYWRIGHT_BASE_URL` | `http://localhost:5173` | Frontend à tester |
| `PLAYWRIGHT_API_URL` | `http://localhost:8000` | Backend pour les fixtures |
| `CI` | — | Active retries, HTML report, workers=1 |

## Bonnes pratiques

1. **Tests indépendants** — chaque test crée son propre user
   (`createUser()`), pas de fixtures partagées mutables.
2. **Sélecteurs robustes** — préférer `getByRole` + `getByLabel`
   (accessible), fallback `getByText`. Éviter `page.locator('.class')`.
3. **Backend absent** — tests d'auth skippés automatiquement (voir
   `beforeAll` dans `auth.spec.ts`).
4. **Nettoyage** — les users de test ont un email suffixé
   `@bestepargne.test` : cron de purge à ajouter côté backend.
