import { expect, test } from '@playwright/test';
import level005 from '../../src/content/levels/pack-02/005.json' with { type: 'json' };
import world1 from '../../src/content/levels/pack-01/index.json' with { type: 'json' };
import world2 from '../../src/content/levels/pack-02/index.json' with { type: 'json' };
import { seedSave } from './support';

/** Spielstand, in dem alle Level von Welt 1 geschafft sind. */
function worldOneDone(): string {
  const levels: Record<string, { stars: number; bestMoves: number; completed: boolean }> = {};
  for (const id of world1.levels) levels[`01/${id}`] = { stars: 3, bestMoves: 20, completed: true };
  return JSON.stringify({ version: 1, levels });
}

test('Frischer Stand: Welt 2 ist sichtbar, aber gesperrt, mit Hinweis', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('level-select')).toBeVisible();
  const world2 = page.getByTestId('world-2');
  await expect(world2).toBeVisible();
  await expect(world2).toHaveAttribute('data-state', 'locked');
  await expect(world2).toContainText('Welt 2');
  await expect(page.getByTestId('world-hint-2')).toHaveText('Schaffe alle Level von Welt 1');
  await expect(page.getByTestId('tile-2-1')).toHaveCount(0);
  await expect(page.getByTestId('world-stars-2')).toHaveCount(0);
  await expect(page.getByTestId('tile-1-1')).toBeEnabled();
});

test('Alle Level von Welt 1 geschafft: Welt 2 Level 1 offen, Intro-Karte erscheint einmal', async ({
  page,
}) => {
  await seedSave(page, worldOneDone());
  await page.goto('/');
  const world2 = page.getByTestId('world-2');
  await expect(world2).toHaveAttribute('data-state', 'open');
  await expect(page.getByTestId('world-stars-2')).toBeVisible();
  await expect(page.getByTestId('tile-2-1')).toBeEnabled();
  await expect(page.getByTestId('tile-2-1')).toHaveAttribute('data-state', 'open');
  await expect(page.getByTestId('tile-2-2')).toBeDisabled();

  // Erster Start: Intro-Karte vor dem Level.
  await page.getByTestId('tile-2-1').click();
  const intro = page.getByTestId('intro-dialog');
  await expect(intro).toBeVisible();
  await expect(intro).toHaveAttribute('data-mechanic', 'bollards');
  await expect(intro).toContainText('Poller');
  await page.getByTestId('intro-start').click();
  await expect(intro).toHaveCount(0);
  await expect(page.getByTestId('vehicle-v1')).toBeVisible();

  // Zweiter Start: keine Karte mehr.
  await page.goto('/#/');
  await page.getByTestId('tile-2-1').click();
  await expect(page.getByTestId('vehicle-v1')).toBeVisible();
  await expect(page.getByTestId('intro-dialog')).toHaveCount(0);
});

test('Intro ist ueber die Levelauswahl erneut abrufbar', async ({ page }) => {
  await seedSave(page, worldOneDone());
  await page.goto('/');
  await page.getByTestId('intro-bollards').click();
  await expect(page.getByTestId('intro-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('intro-dialog')).toHaveCount(0);
  await expect(page.getByTestId('level-select')).toBeVisible();
});

test('Gesperrtes Fahrzeug ist fuer Screenreader beschriftet', async ({ page }) => {
  // Schloss und Schluessel dynamisch aus dem Level lesen (Level 005 fuehrt die Schluessel ein).
  const lockedVehicle = level005.vehicles.find((v) => 'locked' in v && v.locked);
  if (!lockedVehicle || !('keyId' in lockedVehicle)) throw new Error('005 hat kein Schloss');
  const lockedId = lockedVehicle.id;
  const keyId = lockedVehicle.keyId as string;
  const save = JSON.parse(worldOneDone()) as Record<string, unknown>;
  save.seenIntros = ['bollards', 'keys'];
  await seedSave(page, JSON.stringify(save));
  await page.goto('/#/level/02/005');
  const locked = page.getByTestId(`vehicle-${lockedId}`);
  await expect(locked).toBeVisible();
  await expect(locked).toHaveAccessibleName(/gesperrt/);
  await expect(page.getByTestId(`vehicle-${keyId}`)).toHaveAccessibleName(/Schlüssel/);
  await expect(page.getByTestId('intro-dialog')).toHaveCount(0);
  await locked.click();
  await expect(page.getByTestId('live')).toContainText('gesperrt');
});

/** Spielstand, in dem alle Level von Welt 1 und 2 geschafft sind. */
function worldsOneAndTwoDone(): string {
  const levels: Record<string, { stars: number; bestMoves: number; completed: boolean }> = {};
  for (const id of world1.levels) levels[`01/${id}`] = { stars: 3, bestMoves: 20, completed: true };
  for (const id of world2.levels) levels[`02/${id}`] = { stars: 3, bestMoves: 20, completed: true };
  return JSON.stringify({ version: 1, levels });
}

test('Welt 3 ist nach Welt 1 und 2 offen, Intro-Karte Hupe erscheint vor Level 1', async ({
  page,
}) => {
  await seedSave(page, worldsOneAndTwoDone());
  await page.goto('/');
  await expect(page.getByTestId('world-3')).toHaveAttribute('data-state', 'open');
  await expect(page.getByTestId('tile-3-1')).toBeEnabled();
  await expect(page.getByTestId('tile-3-2')).toBeDisabled();
  await page.getByTestId('tile-3-1').click();
  const intro = page.getByTestId('intro-dialog');
  await expect(intro).toHaveAttribute('data-mechanic', 'honk');
  await page.getByTestId('intro-start').click();
  await expect(page.getByTestId('vehicle-v1')).toBeVisible();
});
