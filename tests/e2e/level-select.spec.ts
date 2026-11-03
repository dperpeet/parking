import { expect, test } from '@playwright/test';
import { win007 } from './support';

test('Start ist die Levelauswahl: Level 1 offen, die uebrigen gesperrt', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('level-select')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'ParKing' })).toBeVisible();
  await expect(page.getByText('Welt 1 · Werkstatt')).toBeVisible();
  await expect(page.getByTestId('world-stars-1')).toHaveText('0 / 90 Sterne');
  await expect(page.getByTestId('card-daily')).toBeVisible();
  await expect(page.getByTestId('card-endless')).toBeVisible();
  await expect(page.getByTestId('tile-1-1')).toBeEnabled();
  await expect(page.getByTestId('tile-1-1')).toHaveAttribute('data-state', 'open');
  await expect(page.getByTestId('tile-1-2')).toBeDisabled();
  await expect(page.getByTestId('tile-1-30')).toBeDisabled();
  await expect(page.getByTestId('tile-1-7')).toBeDisabled();
});

test('Level 1 laesst sich oeffnen und der Zurueck-Pfeil fuehrt zur Auswahl', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('tile-1-1').click();
  await expect(page).toHaveURL(/#\/level\/01\/001$/);
  await expect(page.getByRole('heading', { name: 'Level 1' })).toBeVisible();
  await page.getByTestId('back').click();
  await expect(page.getByTestId('level-select')).toBeVisible();
  await expect(page).toHaveURL(/#\/$/);
});

test('Level 7 gewinnen: Sterne, Freischaltung von Level 8, Fortschritt bleibt nach Reload', async ({
  page,
}) => {
  await win007(page);
  await page.getByTestId('dlg-menu').click();
  await expect(page.getByTestId('level-select')).toBeVisible();
  await expect(page.getByTestId('tile-1-7')).toHaveAttribute('data-state', 'done');
  await expect(page.getByTestId('tile-1-7')).toHaveAccessibleName('Level 7, 3 von 3 Sternen');
  await expect(page.getByTestId('tile-1-8')).toBeEnabled();
  await expect(page.getByTestId('tile-1-9')).toBeDisabled();
  await expect(page.getByTestId('world-stars-1')).toHaveText('3 / 90 Sterne');

  await page.reload();
  await expect(page.getByTestId('tile-1-7')).toHaveAttribute('data-state', 'done');
  await expect(page.getByTestId('tile-1-8')).toBeEnabled();
  await expect(page.getByTestId('world-stars-1')).toHaveText('3 / 90 Sterne');
});

test('Stufe halten bleibt nach Reload erhalten', async ({ page }) => {
  await page.goto('/');
  const sw = page.getByTestId('hold-switch');
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('stage-1')).toHaveCount(0);
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('stage-1')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('stage-2')).toBeDisabled();
  await expect(page.getByText('Endlos & „Ähnliches Level“ bleiben auf Stufe 1.')).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('hold-switch')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('stage-1')).toHaveAttribute('aria-pressed', 'true');
});

test('Dialog-Overlay dunkelt das ganze Fenster ab', async ({ page }) => {
  await win007(page);
  const box = await page.locator('.overlay').boundingBox();
  const vp = page.viewportSize();
  expect(box).not.toBeNull();
  expect(Math.round(box!.width)).toBe(vp!.width);
  expect(Math.round(box!.height)).toBe(vp!.height);
});
