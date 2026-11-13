import { defineConfig, devices } from '@playwright/test';

// Lokal kann ein vorinstalliertes Chromium genutzt werden: PW_CHROMIUM_PATH=/opt/pw-browsers/chromium
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;
const launchOptions = executablePath ? { executablePath } : {};
const PORT = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://localhost:${PORT}`, trace: 'on-first-retry', locale: 'de-DE' },
  webServer: {
    command: `pnpm build && pnpm preview --port ${PORT} --strictPort`,
    // Test-Level aus tests/e2e/fixtures (z. B. Mystery-Fahrzeuge) per Route erreichbar machen.
    env: { VITE_E2E_FIXTURES: '1' },
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'mobile',
      // deviceScaleFactor 1: Headless-Chromium rendert WebGL ohne GPU in Software; die Kosten pro Frame
      // wachsen mit der Pixelzahl (Pixel 7: DPR 2,625). Bei voller DPR braucht jeder Frame ~150 ms und das
      // Tempo der Tests haengt am Frame-Durchsatz. Die Spiellogik ist von der DPR unabhaengig.
      use: {
        ...devices['Pixel 7'],
        deviceScaleFactor: 1,
        defaultBrowserType: 'chromium',
        launchOptions,
      },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], launchOptions },
    },
  ],
});
