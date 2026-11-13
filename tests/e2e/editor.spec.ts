import { expect, test } from '@playwright/test';

test('Editor: Level bauen, pruefen, testen, speichern und wieder oeffnen', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('card-editor').click();
  await expect(page).toHaveURL(/#\/editor$/);
  await expect(page.getByTestId('editor-grid')).toBeVisible();
  await page.getByTestId('tool-place').click();
  await page.getByTestId('type-s').click();
  await page.getByTestId('color-orange').click();
  await page.getByTestId('dir-E').click();
  await page.getByTestId('cell-2-1').click();
  await page.getByTestId('color-blue').click();
  await page.getByTestId('dir-S').click();
  await page.getByTestId('cell-4-4').click();
  await expect(page.getByTestId('editor-status')).toContainText('Lösbar', { timeout: 15_000 });
  await page.getByTestId('editor-title').fill('Mein <b>Level</b>');

  await page.getByTestId('test').click();
  await expect(page).toHaveURL(/#\/play\?l=1\./);
  await expect(page.getByRole('heading', { name: 'Mein <b>Level</b>' })).toBeVisible();
  await page.getByTestId('vehicle-v1').click();
  await page.getByTestId('vehicle-v2').click();
  await expect(page.getByTestId('win-dialog')).toBeVisible();
  await page.getByTestId('dlg-again').click();
  await page.getByTestId('back').click();
  await expect(page).toHaveURL(/#\/editor\?l=1\./);
  await expect(page.getByTestId('editor-grid')).toBeVisible();

  await page.getByTestId('save').click();
  await page.getByTestId('editor-back').click();
  await expect(page.getByTestId('custom-list')).toContainText('Mein <b>Level</b>');
  await page.reload();
  await expect(page.getByTestId('custom-c1')).toBeVisible();
  await page.getByTestId('custom-play-c1').click();
  await expect(page.getByTestId('vehicle-v2')).toBeVisible();
});

/** classic mit Override special.mysteryVehicles; v1 (blau, verdeckt) wird von v2 blockiert. */
const MYSTERY_CODE =
  '1.PYsxCoNAFETvMvUUaoLF9jlBII1sYZaPWbImsl8DInv3fEEsBmYe8zZkOITUq8YAYoDrWrae-FnrGjbE3bhanmkReHYXXonbAYcs8oE34W3CMc8vJoMVK9asbX3hNugkIfZpr-Oqs-T1Ia8YkijcnBcphRh3zZc_';

test('Editor: Mystery-Fahrzeug markieren, Hinweis ohne Ruleset-Flag', async ({ page }) => {
  await page.goto(`/#/editor?l=${MYSTERY_CODE}`);
  await expect(page.getByTestId('editor-status')).toContainText('Lösbar', { timeout: 15_000 });
  const head = page.getByTestId('cell-2-2');
  await expect(head).toHaveClass(/ed-mystery/);
  await expect(head).toHaveAttribute('aria-label', /Mystery/);
  await head.click();
  const toggle = page.getByTestId('mystery');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  await expect(page.getByTestId('mystery')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('cell-2-2')).not.toHaveClass(/ed-mystery/);
  await page.getByTestId('mystery').click();
  await expect(page.getByTestId('cell-2-2')).toHaveClass(/ed-mystery/);

  await page.getByTestId('ruleset-select').selectOption('world2');
  await expect(page.getByTestId('editor-status')).toContainText('keine Mystery-Fahrzeuge');
  await expect(page.getByTestId('test')).toBeDisabled();
  await page.getByTestId('mystery').click();
  await expect(page.getByTestId('editor-status')).toContainText('Lösbar', { timeout: 15_000 });
  // Ohne Flag und ohne Markierung gibt es keinen Schalter mehr.
  await expect(page.getByTestId('mystery')).toHaveCount(0);
});
