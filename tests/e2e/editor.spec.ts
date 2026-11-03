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
