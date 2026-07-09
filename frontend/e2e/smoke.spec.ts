/**
 * smoke.spec.ts — Smoke tests critiques (R8.2).
 *
 * Ces tests sont voulus TRÈS courts et robustes : ils vérifient les
 * flows qui doivent JAMAIS casser en prod (auth + catalogue + détail
 * cours). Si un test échoue ici, on ne merge pas.
 */
import { test, expect } from '@playwright/test';

test.describe('Public — smoke', () => {
  test('landing s\'affiche avec la marque', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('link', { name: /best-épargne/i }),
    ).toBeVisible();
  });

  test('catalogue liste des cours (ou message vide)', async ({ page }) => {
    await page.goto('/catalogue');
    // On accepte 2 issues valides : soit au moins 1 cours affiché,
    // soit le message "Aucun cours" — c'est un smoke test, pas une
    // vérification de contenu métier.
    const hasCourses = await page.getByRole('article').first().isVisible().catch(() => false);
    const hasEmpty = await page.getByText(/aucun cours/i).isVisible().catch(() => false);
    expect(hasCourses || hasEmpty).toBeTruthy();
  });

  test('page login accessible et affiche le form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/mot de passe/i)).toBeVisible();
  });

  test('page register accessible et affiche le form', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByLabel(/email/i)).toBeVisible();
  });

  test('404 sur route inconnue', async ({ page }) => {
    await page.goto('/route-qui-nexiste-pas');
    // La page 404 affiche NotFoundPage
    await expect(page.getByText(/404|introuvable|not found/i)).toBeVisible();
  });
});
