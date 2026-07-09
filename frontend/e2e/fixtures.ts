/**
 * fixtures.ts — Fixtures Playwright (R8.2).
 *
 * Fournit :
 *  - une factory pour créer un user à la volée (email random)
 *  - un helper login qui pose les tokens JWT dans localStorage
 *
 * L'API backend est appelée directement pour créer le user (register
 * public) et éviter les couplages fragiles avec l'UI d'onboarding.
 */
import { test as base, expect, request as playwrightRequest } from '@playwright/test';

export interface TestUser {
  email: string;
  password: string;
  full_name: string;
}

const API_URL =
  process.env.PLAYWRIGHT_API_URL ||
  process.env.VITE_API_URL ||
  'http://localhost:8000';

/**
 * Crée un user via l'API /api/auth/register/. Renvoie l'utilisateur
 * ET les tokens (déjà émis par le backend au register).
 */
export async function createUser(overrides: Partial<TestUser> = {}) {
  const email =
    overrides.email ||
    `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@bestepargne.test`;
  const password = overrides.password || 'Password123!';
  const full_name = overrides.full_name || 'Playwright E2E';

  const ctx = await playwrightRequest.newContext({ baseURL: API_URL });
  const res = await ctx.post('/api/auth/register/', {
    data: { email, password, full_name },
  });
  if (!res.ok()) {
    throw new Error(`register failed: ${res.status()} ${await res.text()}`);
  }
  const body = await res.json();
  await ctx.dispose();
  return {
    user: { email, password, full_name } as TestUser,
    tokens: {
      access: body.access as string,
      refresh: body.refresh as string,
    },
    payload: body,
  };
}

/**
 * Fixture d'auth : injecte les tokens dans localStorage pour éviter le
 * flow login UI. Utilisable comme `test.use({ storageState: ... })`
 * mais on préfère l'ajouter dans un beforeEach explicite.
 */
export const test = base.extend<{
  createFreshUser: (overrides?: Partial<TestUser>) => Promise<{
    user: TestUser;
    tokens: { access: string; refresh: string };
  }>;
}>({
  createFreshUser: async ({}, use) => {
    await use(createUser);
  },
});

export { expect };

export async function seedAuth(
  page: import('@playwright/test').Page,
  tokens: { access: string; refresh: string },
  user: unknown,
) {
  // Le store Zustand persiste sur la clé 'be-auth' (voir stores/auth.ts).
  await page.addInitScript(
    ({ tokens, user }) => {
      const state = {
        state: {
          access: tokens.access,
          refresh: tokens.refresh,
          user,
        },
        version: 0,
      };
      localStorage.setItem('be-auth', JSON.stringify(state));
    },
    { tokens, user },
  );
}
