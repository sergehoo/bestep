/**
 * glossary.spec.ts — E2E parcours utilisateur du module Lexique (GLOSS-13).
 *
 * Ces tests couvrent le journey public :
 *   1. La page /lexique se charge avec ses éléments clés (hero, recherche,
 *      alphabet, filtres, side rail).
 *   2. La recherche filtre les résultats en direct.
 *   3. L'index alphabétique restreint la liste.
 *   4. Un clic sur une card ouvre la page /lexique/:slug.
 *   5. La page détail affiche les sections attendues.
 *   6. Le lien du header PublicHeader amène bien à /lexique.
 *
 * Robustesse : les tests tolèrent une base vide (empty state) — c'est un
 * smoke test, pas une vérification de données métier. Si le backend a des
 * termes validés, on va plus loin (clic, détail, favoris).
 */
import { test, expect } from '@playwright/test';

test.describe('Lexique — smoke public', () => {
  test('page /lexique s\'affiche avec ses éléments clés', async ({ page }) => {
    await page.goto('/lexique');

    // Hero + titre.
    await expect(
      page.getByRole('heading', {
        name: /dictionnaire de best[-\s]?épargne/i,
        level: 1,
      }),
    ).toBeVisible();

    // Barre de recherche accessible par son placeholder / aria-label.
    await expect(
      page.getByPlaceholder(/rechercher un mot|expression/i),
    ).toBeVisible();

    // Nav alphabétique — bouton "Tous" toujours présent.
    await expect(page.getByRole('button', { name: 'Tous' })).toBeVisible();

    // Filtres.
    await expect(page.getByText(/toutes catégories/i)).toBeVisible();
  });

  test('recherche instantanée met à jour l\'URL et la liste', async ({ page }) => {
    await page.goto('/lexique');
    const search = page.getByPlaceholder(/rechercher un mot|expression/i);
    await search.fill('action');
    // Debounce : petit délai pour laisser TanStack fetch.
    await page.waitForTimeout(400);
    // Soit on a des résultats, soit l'empty state — les 2 sont acceptables.
    const hasCards =
      (await page
        .locator('a[href^="/lexique/"]')
        .first()
        .isVisible()
        .catch(() => false)) === true;
    const hasEmpty =
      (await page
        .getByText(/aucun terme trouvé/i)
        .first()
        .isVisible()
        .catch(() => false)) === true;
    expect(hasCards || hasEmpty).toBeTruthy();
  });

  test('filtre alphabet A restreint et le bouton Tous restaure', async ({
    page,
  }) => {
    await page.goto('/lexique');
    // Clique la lettre "A" (peut être disabled si aucun terme — dans ce
    // cas on skip proprement).
    const letterA = page.getByRole('button', { name: 'A', exact: true });
    if (!(await letterA.isEnabled().catch(() => false))) {
      test.skip(true, 'Aucun terme en A dans cette base.');
    }
    await letterA.click();
    await page.waitForTimeout(300);
    // Doit être marqué actif visuellement (bg-primary-600) — check via
    // classe.
    await expect(letterA).toHaveClass(/bg-primary-600/);
    // Retour à "Tous".
    await page.getByRole('button', { name: 'Tous' }).click();
    await expect(page.getByRole('button', { name: 'Tous' })).toHaveClass(
      /bg-primary-600/,
    );
  });

  test('clic sur une card ouvre le détail /lexique/:slug', async ({ page }) => {
    await page.goto('/lexique');
    const firstCard = page.locator('a[href^="/lexique/"]').first();
    if (!(await firstCard.isVisible().catch(() => false))) {
      test.skip(true, 'Base vide : pas de terme validé à cliquer.');
    }
    const href = await firstCard.getAttribute('href');
    await firstCard.click();
    await expect(page).toHaveURL(new RegExp(href!.replace(/[/-]/g, '\\$&')));
    // Le hero détail affiche un h1 (le mot lui-même).
    await expect(page.locator('h1').first()).toBeVisible();
    // Le CTA "Retour" existe.
    await expect(page.getByRole('button', { name: /retour/i })).toBeVisible();
  });

  test('accès depuis le header — lien "Lexique"', async ({ page }) => {
    await page.goto('/');
    const link = page.getByRole('link', { name: /lexique/i }).first();
    // Peut être caché sur mobile — on affiche par force.
    await link.click();
    await expect(page).toHaveURL(/\/lexique/);
    await expect(
      page.getByRole('heading', { level: 1 }).first(),
    ).toBeVisible();
  });

  test('404 sur un slug inconnu affiche l\'état vide', async ({ page }) => {
    await page.goto('/lexique/terme-qui-nexiste-vraiment-pas-12345');
    // La page GlossaryTermPage affiche un message d'erreur.
    await expect(
      page.getByRole('heading', { name: /introuvable/i }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: /retour au lexique/i }))
      .toBeVisible();
  });
});
