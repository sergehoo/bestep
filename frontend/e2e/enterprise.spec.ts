import { expect, test } from '@playwright/test';

const DOMAINS = [
  'Banque de détail',
  'Banque et opérations',
  'Finance d’entreprise et analyse financière',
  'Gestion des risques et gouvernance',
  'Gestion d’actifs',
  'Investissement et gestion de fonds',
  'Marchés des capitaux et banque d’investissement',
  'Réglementation et conformité',
];

test.describe('Offre entreprise — contenu formation', () => {
  test('reprend les contenus de formation et retire l’ancienne tarification', async ({
    page,
  }) => {
    await page.goto('/entreprise');

    await expect(
      page.getByRole('heading', {
        level: 1,
        name: /formation en banque,\s*investissement et finance/i,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Nos domaines de formation' }),
    ).toBeVisible();

    for (const domain of DOMAINS) {
      await expect(page.getByRole('heading', { name: domain })).toBeAttached();
    }

    await expect(
      page.getByRole('heading', { name: 'Pourquoi nous faire confiance ?' }),
    ).toBeAttached();
    await expect(
      page.getByRole('heading', { name: 'Tout savoir sur nos formations' }),
    ).toBeAttached();
    await expect(page.getByText('Un plan pour chaque taille d’équipe')).toHaveCount(0);
    await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
  });

  test('le CTA ouvre toujours le formulaire public complet', async ({ page }) => {
    await page.goto('/entreprise');
    await page.getByRole('button', { name: 'Demander des informations' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole('heading', { name: 'Réserver une démonstration' }),
    ).toBeVisible();
    await expect(dialog.getByText('ENTREPRISE OU ORGANISATION*')).toBeVisible();
    await expect(dialog.getByText('E-MAIL PROFESSIONNEL*')).toBeVisible();
    await expect(
      dialog.getByText('NOMBRE D’EMPLOYÉS BÉNÉFICIAIRES*'),
    ).toBeVisible();
    await expect(dialog.getByText('PÉRIODE SOUHAITÉE *')).toBeVisible();
  });

  test('reste lisible sans débordement sur mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/entreprise');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Demander des informations' }),
    ).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(hasHorizontalOverflow).toBeFalsy();
  });
});
