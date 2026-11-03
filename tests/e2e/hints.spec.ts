import { expect, test } from '@playwright/test';
import { WIN_ORDER, tapAll } from './support';

test('Tipp markiert ein Fahrzeug und wird angesagt', async ({ page }) => {
  await page.goto('/#/level/01/007');
  await expect(page.getByTestId('vehicle-v1')).toBeVisible();
  await expect(page.getByTestId('hint')).toContainText('Tipp');
  await page.getByTestId('hint').click();
  await expect(page.getByTestId('live')).toHaveText(/^Tipp: das .+ Fahrzeug$/, { timeout: 15_000 });
  await expect(page.locator('.vehicle-btn[data-hint]')).toHaveCount(1);
  await expect(page.getByTestId('hint').locator('.badge')).toHaveText('2');
  // Nach ca. 2 s verschwindet die Markierung wieder.
  await expect(page.locator('.vehicle-btn[data-hint]')).toHaveCount(0, { timeout: 5_000 });
});

test('Mit Tipp gewonnen zaehlt hoechstens 2 Sterne', async ({ page }) => {
  await page.goto('/#/level/01/007');
  await expect(page.getByTestId('vehicle-v1')).toBeVisible();
  await page.getByTestId('hint').click();
  // Die Markierung ist nur kurz sichtbar; das Badge zeigt dauerhaft, dass der Tipp gezaehlt wurde.
  await expect(page.getByTestId('hint').locator('.badge')).toHaveText('2', { timeout: 15_000 });
  await tapAll(page, WIN_ORDER);
  await expect(page.getByTestId('win-dialog')).toBeVisible();
  await expect(page.getByRole('img', { name: '2 von 3 Sternen' })).toBeVisible();
});
