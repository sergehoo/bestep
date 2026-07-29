/**
 * course-detail-public.spec.ts — F3 : accès libre à la fiche cours pour
 * un visiteur anonyme (pattern Udemy).
 *
 * Ces tests garantissent que le bug de redirection automatique vers
 * /login?next=/courses/:slug pour un visiteur non-authentifié ne peut
 * PAS revenir. Cause historique : useLearnerEnrollments() envoyait un
 * GET /learner/enrollments/ qui renvoyait 401, ce qui déclenchait
 * `onAuthFailure()` dans l'intercepteur axios et redirigeait.
 *
 * Précondition : au moins une formation publiée est présente dans la
 * base cible. On sélectionne la première carte du catalogue plutôt que
 * de coder en dur un slug (résilient aux données).
 */
import { test, expect } from '@playwright/test';

test.describe('Fiche cours — visiteur anonyme', () => {
  test('la fiche s\'ouvre sans redirection vers /login', async ({ page }) => {
    await page.goto('/catalogue');
    // Le catalogue est peuplé côté environnement de test. On ne peut pas
    // vérifier la fiche s'il n'y a aucun cours ; dans ce cas, on skip
    // proprement plutôt que de faire échouer sur un fixture manquant.
    const firstCard = page.getByRole('article').first();
    if (!(await firstCard.isVisible().catch(() => false))) {
      test.skip(true, 'Aucun cours en base — impossible de tester la fiche.');
      return;
    }

    // Clic sur le premier cours du catalogue.
    const detailLink = firstCard.getByRole('link').first();
    await detailLink.click();

    // Attend la navigation. On accepte /courses/<slug> uniquement — si
    // on atterrit sur /login, le bug est revenu.
    await page.waitForURL(/\/courses\//, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/courses\/[^/?]+$/);
    await expect(page).not.toHaveURL(/\/login/);

    // Contenu descriptif public visible : titre + section Programme.
    await expect(page.locator('h1').first()).toBeVisible();
    // On vérifie qu'un des sections attendues est affichée (Programme,
    // Formateur ou Avis). Peu importe laquelle — l'important est que
    // le contenu descriptif n'est pas masqué.
    const hasPublicContent = await Promise.any([
      page.getByRole('heading', { name: /programme|programme du cours/i }).isVisible(),
      page.getByRole('heading', { name: /formateur/i }).isVisible(),
      page.getByRole('heading', { name: /avis/i }).isVisible(),
    ]).catch(() => false);
    expect(hasPublicContent).toBeTruthy();
  });

  test('le CTA "S\'inscrire" redirige vers /register (pas /login)', async ({ page }) => {
    await page.goto('/catalogue');
    const firstCard = page.getByRole('article').first();
    if (!(await firstCard.isVisible().catch(() => false))) {
      test.skip(true, 'Aucun cours en base — impossible de tester le CTA.');
      return;
    }
    await firstCard.getByRole('link').first().click();
    await page.waitForURL(/\/courses\//);

    // Le libellé du CTA principal pour un visiteur est "S'inscrire au
    // cours" ou "S'inscrire pour commencer" (cours gratuit).
    const enrollBtn = page
      .getByRole('button', { name: /s['’]inscrire/i })
      .first();
    await expect(enrollBtn).toBeVisible();
    await enrollBtn.click();

    // On DOIT arriver sur /register (pattern Udemy — signup-first).
    // Le paramètre `next` doit pointer sur la fiche cours d'origine.
    await page.waitForURL(/\/register\?next=/);
    await expect(page).toHaveURL(/\/register\?next=%2Fcourses%2F/);
  });

  test('aucune redirection /login lors du chargement de la fiche', async ({ page }) => {
    // Watchdog : capture toutes les redirections vers /login pendant le
    // chargement d'une fiche cours en anonyme. Doit être zéro.
    const loginRedirects: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame() && /\/login/.test(frame.url())) {
        loginRedirects.push(frame.url());
      }
    });

    await page.goto('/catalogue');
    const firstCard = page.getByRole('article').first();
    if (!(await firstCard.isVisible().catch(() => false))) {
      test.skip(true, 'Aucun cours en base — impossible de tester le watchdog.');
      return;
    }
    await firstCard.getByRole('link').first().click();
    await page.waitForURL(/\/courses\//);
    // Laisse le temps aux requêtes différées (useLearnerEnrollments,
    // hooks TanStack, etc.) d'éventuellement rediriger.
    await page.waitForTimeout(1500);

    expect(loginRedirects).toEqual([]);
  });
});
