/**
 * playwright.config.ts — Configuration Playwright pour Best Épargne (R8.1).
 *
 * Design :
 *  - baseURL : `PLAYWRIGHT_BASE_URL` (défaut http://localhost:5173).
 *  - Sur CI : 2 retries, workers=1 (déterminisme), HTML report.
 *  - En local : trace on-first-retry, video off (rapide).
 *  - webServer : lance `npm run dev` automatiquement en local si le port
 *    est libre, désactivé sur CI (le pipeline lance backend + frontend
 *    en amont).
 */
import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: !isCI,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI
    ? [['html', { open: 'never' }], ['github']]
    : [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: isCI ? 'retain-on-failure' : 'off',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Ajouter Firefox / Safari mobile plus tard si besoin.
  ],
  webServer: isCI
    ? undefined
    : {
        command: 'npm run dev',
        url: baseURL,
        reuseExistingServer: true,
        timeout: 30_000,
      },
});
