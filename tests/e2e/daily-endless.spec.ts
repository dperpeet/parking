import { expect, test } from '@playwright/test';
import { seedSave } from './support';

test('Tageslevel und Endlos werden generiert und starten', async ({ page }) => {
  // Die Stufe des Tageslevels haengt vom Wochentag ab; Intro-Karten wuerden die Navigation verdecken.
  await seedSave(page, JSON.stringify({ seenIntros: ['bollards', 'keys', 'honk'] }));
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
