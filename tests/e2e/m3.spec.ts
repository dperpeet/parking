import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// Level 007 ist als einziges Level fest (Inhalt unveraendert); alle anderen Level duerfen neu generiert werden.
const WIN_ORDER = ['v1', 'v2', 'v3', 'v4', 'v5', 'v8', 'v7', 'v9', 'v10', 'v11', 'v6'];

async function tapAll(page: Page, ids: string[]): Promise<void> {
  for (const id of ids) await page.getByTestId(`vehicle-${id}`).click();
}

async function win007(page: Page): Promise<void> {
  await page.goto('/#/level/01/007');
  await expect(page.getByTestId('vehicle-v1')).toBeVisible();
  await tapAll(page, WIN_ORDER);
  await expect(page.getByTestId('win-dialog')).toBeVisible();
}

test('Start ist die Levelauswahl: Level 1 offen, die uebrigen gesperrt', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('level-select')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'ParKing' })).toBeVisible();
  await expect(page.getByText('Welt 1 · Werkstatt')).toBeVisible();
  await expect(page.getByTestId('world-stars')).toHaveText('0 / 90 Sterne');
  await expect(page.getByTestId('card-daily')).toBeVisible();
  await expect(page.getByTestId('card-endless')).toBeVisible();
  await expect(page.getByTestId('tile-1')).toBeEnabled();
  await expect(page.getByTestId('tile-1')).toHaveAttribute('data-state', 'open');
  await expect(page.getByTestId('tile-2')).toBeDisabled();
  await expect(page.getByTestId('tile-30')).toBeDisabled();
  await expect(page.getByTestId('tile-7')).toBeDisabled();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/select-screen.png' });
});

test('Level 1 laesst sich oeffnen und der Zurueck-Pfeil fuehrt zur Auswahl', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('tile-1').click();
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
  await expect(page.getByTestId('tile-7')).toHaveAttribute('data-state', 'done');
  await expect(page.getByTestId('tile-7')).toHaveAccessibleName('Level 7, 3 von 3 Sternen');
  await expect(page.getByTestId('tile-8')).toBeEnabled();
  await expect(page.getByTestId('tile-9')).toBeDisabled();
  await expect(page.getByTestId('world-stars')).toHaveText('3 / 90 Sterne');

  await page.reload();
  await expect(page.getByTestId('tile-7')).toHaveAttribute('data-state', 'done');
  await expect(page.getByTestId('tile-8')).toBeEnabled();
  await expect(page.getByTestId('world-stars')).toHaveText('3 / 90 Sterne');
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

test('Tipp markiert ein Fahrzeug und wird angesagt', async ({ page }, info) => {
  await page.goto('/#/level/01/007');
  await expect(page.getByTestId('vehicle-v1')).toBeVisible();
  await expect(page.getByTestId('hint')).toContainText('Tipp');
  await page.getByTestId('hint').click();
  await expect(page.getByTestId('live')).toHaveText(/^Tipp: das .+ Fahrzeug$/, { timeout: 15_000 });
  await expect(page.locator('.vehicle-btn[data-hint]')).toHaveCount(1);
  await expect(page.getByTestId('hint').locator('.badge')).toHaveText('2');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `test-results/hint-${info.project.name}.png` });
  // Nach ca. 2 s verschwindet die Markierung wieder.
  await expect(page.locator('.vehicle-btn[data-hint]')).toHaveCount(0, { timeout: 5_000 });
});

test('Mit Tipp gewonnen zaehlt hoechstens 2 Sterne', async ({ page }) => {
  await page.goto('/#/level/01/007');
  await expect(page.getByTestId('vehicle-v1')).toBeVisible();
  await page.getByTestId('hint').click();
  await expect(page.locator('.vehicle-btn[data-hint]')).toHaveCount(1, { timeout: 15_000 });
  await tapAll(page, WIN_ORDER);
  await expect(page.getByTestId('win-dialog')).toBeVisible();
  await expect(page.getByRole('img', { name: '2 von 3 Sternen' })).toBeVisible();
});

test('Einstellungen: Sprache auf Englisch stellen aendert Beschriftungen und bleibt erhalten', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByText('Tageslevel')).toBeVisible();
  await page.getByTestId('settings').click();
  await expect(page.getByTestId('settings-dialog')).toBeVisible();
  await page.getByTestId('lang-en').click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await page.getByTestId('settings-close').click();
  await expect(page.getByText('Daily level')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  await page.reload();
  await expect(page.getByText('Daily level')).toBeVisible();
});

test('Einstellungen: Zuruecksetzen fragt nach und loescht den Fortschritt', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('hold-switch').click();
  await expect(page.getByTestId('hold-switch')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('settings').click();
  await page.getByTestId('reset').click();
  await page.getByTestId('reset-cancel').click();
  await expect(page.getByTestId('reset')).toBeVisible();
  await page.getByTestId('reset').click();
  await page.getByTestId('reset-confirm').click();
  await page.getByTestId('settings-close').click();
  await expect(page.getByTestId('hold-switch')).toHaveAttribute('aria-checked', 'false');
});

test('Tageslevel und Endlos werden generiert und starten', async ({ page }) => {
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

test('Dialog-Overlay dunkelt das ganze Fenster ab', async ({ page }) => {
  await win007(page);
  const box = await page.locator('.overlay').boundingBox();
  const vp = page.viewportSize();
  expect(box).not.toBeNull();
  expect(Math.round(box!.width)).toBe(vp!.width);
  expect(Math.round(box!.height)).toBe(vp!.height);
});
