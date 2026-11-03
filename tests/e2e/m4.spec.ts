import { expect, test } from '@playwright/test';
import { encodeLevel } from '../../src/app/share';
import { Level } from '../../src/schema';
import level007 from '../../src/content/levels/pack-01/007.json' with { type: 'json' };

// Gleiche Gewinnfolge wie in m3.spec.ts; geteilte Level bekommen die IDs v1..vn in Array-Reihenfolge.
const WIN_ORDER = ['v1', 'v2', 'v3', 'v4', 'v5', 'v8', 'v7', 'v9', 'v10', 'v11', 'v6'];

function code007(unchecked = false): string {
  const res = encodeLevel(Level.parse(level007), { unchecked, title: 'Testlevel' });
  if (!res.ok) throw new Error(res.error);
  return res.code;
}

test('Geteiltes Level per Link spielen, zaehlt nicht zum Fortschritt', async ({ page }) => {
  await page.goto(`/#/play?l=${code007()}`);
  await expect(page.getByRole('heading', { name: 'Testlevel' })).toBeVisible();
  for (const id of WIN_ORDER) await page.getByTestId(`vehicle-${id}`).click();
  await expect(page.getByTestId('win-dialog')).toBeVisible();
  await expect(page.getByTestId('dlg-again')).toBeVisible();
  await expect(page.getByTestId('dlg-similar')).toHaveCount(0);
  await expect(page.getByTestId('dlg-next')).toHaveText('Zum Menü');
  await page.getByTestId('dlg-next').click();
  await expect(page.getByTestId('level-select')).toBeVisible();
  await expect(page.getByTestId('tile-7')).toBeDisabled();
});

test('Kaputter Share-Link zeigt eine Meldung statt abzustuerzen', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const code of ['1.AAAA', '9.abc', code007().slice(0, 40), '<x>']) {
    await page.goto(`/#/play?l=${code}`);
    await expect(page.getByTestId('share-error')).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('Ungepruefter Share-Link wird mit Hinweis gespielt', async ({ page }) => {
  await page.goto(`/#/play?l=${code007(true)}`);
  await expect(page.getByTestId('vehicle-v1')).toBeVisible();
  await expect(page.locator('.toast')).toBeVisible();
});

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
  await expect(page.getByTestId('tile-1')).toHaveAttribute('data-state', 'done');
  await expect(page.getByTestId('tile-2')).toBeEnabled();
  await expect(page.getByTestId('hold-switch')).toHaveAttribute('aria-checked', 'false');
});

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
