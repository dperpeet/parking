import { expect, test } from '@playwright/test';
import { seedSave } from './support';

test('Tageslevel und Endlos werden generiert und starten', async ({ page }) => {
  // Stufe und Mechanik des Tageslevels haengen vom Datum ab; Intro-Karten wuerden die Navigation verdecken.
  await seedSave(
    page,
    JSON.stringify({ seenIntros: ['bollards', 'keys', 'honk', 'mystery', 'oneWay'] }),
  );
  await page.goto('/');
  await page.getByTestId('card-daily').click();
  await expect(page).toHaveURL(/#\/daily$/);
  await expect(page.locator('.vehicle-btn').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Tageslevel', { exact: true })).toBeVisible();
  await page.getByTestId('back').click();
  await page.getByTestId('card-endless').click();
  await expect(page.locator('.vehicle-btn').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/^Endlos · Stufe 1$/)).toBeVisible();
});

test('Tageslevel mit Pflicht-Hupe zeigt beim ersten Mal die Hupen-Karte', async ({ page }) => {
  // 7. November 2026 (Samstag, Stufe 5): Der Datums-Seed waehlt die Variante Pflicht-Hupe.
  await page.clock.setFixedTime(new Date(2026, 10, 7, 12));
  await seedSave(page, JSON.stringify({ seenIntros: ['bollards', 'keys'] }));
  await page.goto('/#/daily');
  const intro = page.getByTestId('intro-dialog');
  await expect(intro).toHaveAttribute('data-mechanic', 'honk', { timeout: 20_000 });
  await page.getByTestId('intro-start').click();
  await expect(intro).toHaveCount(0);
  await expect(page.locator('.vehicle-btn').first()).toBeVisible();
});
