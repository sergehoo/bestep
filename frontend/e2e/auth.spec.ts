/**
 * auth.spec.ts — Flow auth complet (R8.2).
 *
 * Nécessite un backend Django lancé sur PLAYWRIGHT_API_URL.
 * Si le backend n'est pas dispo, le test est skippé.
 */
import { test, expect, seedAuth, createUser } from './fixtures';

const API_URL =
  process.env.PLAYWRIGHT_API_URL ||
  process.env.VITE_API_URL ||
  'http://localhost:8000';

test.describe('Auth — flow JWT', () => {
  test.beforeAll(async ({ request }) => {
    // Skip la suite si le backend n'est pas joignable
    try {
      const res = await request.get(`${API_URL}/api/public/categories/`, {
        timeout: 3000,
      });
      if (!res.ok()) test.skip();
    } catch {
      test.skip();
    }
  });

  test('register + redirection dashboard', async ({ page }) => {
    const { user } = await createUser();

    await page.goto('/login');
    await page.getByLabel(/email/i).fill(user.email);
    await page.getByLabel(/mot de passe/i).fill(user.password);
    await page.getByRole('button', { name: /se connecter|connexion/i }).click();

    // Attend le dashboard learner (défaut post-login)
    await expect(page).toHaveURL(/\/dashboard(\/|$)/, { timeout: 10_000 });
  });

  test('user hydraté via seedAuth accède au dashboard directement', async ({
    page,
  }) => {
    const { user, tokens, payload } = await createUser();
    await seedAuth(page, tokens, payload.user);

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard(\/|$)/);
    // Le prénom apparaît quelque part
    await expect(page.getByText(user.full_name.split(' ')[0], { exact: false }))
      .toBeVisible({ timeout: 5_000 });
  });

  test('user non connecté → redirect /login sur /dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });
});
