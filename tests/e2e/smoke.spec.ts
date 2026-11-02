import { expect, test } from '@playwright/test';

test('Seite laedt und Titel enthaelt ParKing', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/ParKing/);
  await expect(page.getByRole('heading', { name: 'ParKing' })).toBeVisible();
});

test('Deep Link auf Level 7 zeigt das Spielfeld', async ({ page }) => {
  await page.goto('/#/level/01/007');
  await expect(page.getByRole('heading', { name: 'Level 7' })).toBeVisible();
});
