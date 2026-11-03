import { expect, test } from '@playwright/test';
import { WIN_ORDER, tapAll } from './support';
import { encodeLevel } from '../../src/app/share';
import { Level } from '../../src/schema';
import level007 from '../../src/content/levels/pack-01/007.json' with { type: 'json' };

function code007(unchecked = false): string {
  const res = encodeLevel(Level.parse(level007), { unchecked, title: 'Testlevel' });
  if (!res.ok) throw new Error(res.error);
  return res.code;
}

test('Geteiltes Level per Link spielen, zaehlt nicht zum Fortschritt', async ({ page }) => {
  await page.goto(`/#/play?l=${code007()}`);
  await expect(page.getByRole('heading', { name: 'Testlevel' })).toBeVisible();
  await tapAll(page, WIN_ORDER);
  await expect(page.getByTestId('win-dialog')).toBeVisible();
  await expect(page.getByTestId('dlg-again')).toBeVisible();
  await expect(page.getByTestId('dlg-similar')).toHaveCount(0);
  await expect(page.getByTestId('dlg-next')).toHaveText('Zum Menü');
  await page.getByTestId('dlg-next').click();
  await expect(page.getByTestId('level-select')).toBeVisible();
  await expect(page.getByTestId('tile-1-7')).toBeDisabled();
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
