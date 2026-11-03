import { expect, test } from '@playwright/test';
import { LOSE_ORDER, WIN_ORDER, tapAll } from './support';

test.beforeEach(async ({ page }) => {
  await page.goto('/#/level/01/007');
  await expect(page.getByTestId('vehicle-v1')).toBeVisible();
});

test('Spielfeld zeigt Header, Fahrgaeste, Halteplaetze und Hilfen', async ({ page }) => {
  await expect(page.getByText('Welt 1 · Werkstatt')).toBeVisible();
  await expect(page.getByText('Halteplätze 0 / 5 belegt')).toBeVisible();
  await expect(page.getByText('28 warten')).toBeVisible();
  await expect(page.getByRole('button', { name: /Mischen/ })).toBeVisible();
  await expect(page.locator('.board-host canvas')).toBeVisible();
});

test('blockiertes Fahrzeug bleibt stehen und zaehlt nicht', async ({ page }) => {
  await page.getByTestId('vehicle-v4').click();
  await expect(page.locator('.moves-chip')).toContainText('0');
  await expect(page.getByTestId('vehicle-v4')).toBeVisible();
});

test('Level 007 gewinnen zeigt den Sieg-Dialog', async ({ page }) => {
  await tapAll(page, WIN_ORDER);
  const dialog = page.getByTestId('win-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Geschafft!')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Weiter' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Nochmal' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Ähnliches Level' })).toBeVisible();

  // Der Generator laeuft im Worker und braucht etwas Zeit (Zeitlimit 10 s, danach Variante).
  await dialog.getByRole('button', { name: 'Ähnliches Level' }).click();
  await expect(page.getByTestId('win-dialog')).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByTestId('vehicle-v1')).toBeVisible();
  await expect(page.getByText('Ähnlich zu Level 7')).toBeVisible();
});

test('Verlieren zeigt den Niederlage-Dialog, Zurueck macht weiter', async ({ page }) => {
  await tapAll(page, LOSE_ORDER);
  const dialog = page.getByTestId('lose-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Kein Platz mehr')).toBeVisible();
  await dialog.getByRole('button', { name: 'Zurück' }).click();
  await expect(page.getByTestId('lose-dialog')).toHaveCount(0);
});

test('Tastatur: Pfeile fokussieren Fahrzeuge, Enter tippt, U macht rueckgaengig', async ({
  page,
}) => {
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.vehicle-btn:focus')).toHaveCount(1);
  await page.getByTestId('vehicle-v1').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('vehicle-v1')).toHaveCount(0);
  await page.keyboard.press('u');
  await expect(page.getByTestId('vehicle-v1')).toBeVisible();
  await page.keyboard.press('r');
  await expect(page.getByTestId('vehicle-v1')).toBeVisible();
});
