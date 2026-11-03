import { expect, test } from '@playwright/test';

test('Import: Ersetzen ueberschreibt den Fortschritt', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('hold-switch').click();
  await expect(page.getByTestId('hold-switch')).toHaveAttribute('aria-checked', 'true');
  const save = {
    version: 1,
    levels: { '01/001': { stars: 3, bestMoves: 5, completed: true } },
  };
  await page.getByTestId('settings').click();
  await page.getByTestId('import-input').setInputFiles({
    name: 'save.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(save)),
  });
  await expect(page.getByTestId('import-warning')).toBeVisible();
  await page.getByTestId('import-replace').click();
  await expect(page.getByTestId('settings-message')).toBeVisible();
  await page.getByTestId('settings-close').click();
  await expect(page.getByTestId('tile-1-1')).toHaveAttribute('data-state', 'done');
  await expect(page.getByTestId('tile-1-2')).toBeEnabled();
  await expect(page.getByTestId('hold-switch')).toHaveAttribute('aria-checked', 'false');
});
