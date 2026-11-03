import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { encodeLevel } from '../../src/app/share';
import { Level } from '../../src/schema';
import world1 from '../../src/content/levels/pack-01/index.json' with { type: 'json' };

const SAVE_KEY = 'parking.save.v1';

/** Geteiltes Level (Ruleset world2): v3 ist gesperrt, sein Schluessel ist v2. IDs werden v1..v5. */
function lockedLevelCode(): string {
  const car = (pos: [number, number], dir: string, type: string, color: string) => ({
    pos,
    dir,
    type,
    color,
  });
  const level = Level.parse({
    schema: 'parking.level/1',
    id: 'e2e-lock',
    title: 'Schloss',
    ruleset: 'world2',
    grid: { width: 5, height: 5, cells: [] },
    vehicles: [
      { id: 'v1', ...car([0, 0], 'W', 's', 'blue') },
      { id: 'v2', ...car([4, 0], 'N', 's', 'orange') },
      { id: 'v3', ...car([2, 2], 'S', 's', 'blue'), locked: true, keyId: 'v2' },
      { id: 'v4', ...car([0, 4], 'W', 'm', 'orange') },
      { id: 'v5', ...car([4, 3], 'E', 's', 'blue') },
    ],
    passengers: ['orange', 'orange', 'blue', 'blue'],
  });
  const res = encodeLevel(level, { unchecked: true, title: 'Schloss' });
  if (!res.ok) throw new Error(res.error);
  return res.code;
}

/** Spielstand, in dem alle Level von Welt 1 geschafft sind. */
function worldOneDone(): string {
  const levels: Record<string, { stars: number; bestMoves: number; completed: boolean }> = {};
  for (const id of world1.levels) levels[`01/${id}`] = { stars: 3, bestMoves: 20, completed: true };
  return JSON.stringify({ version: 1, levels });
}

/** Schreibt den Spielstand nur beim ersten Laden, damit spaetere Aenderungen (gesehene Intros) bleiben. */
async function seedSave(page: Page, save: string): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      if (!window.localStorage.getItem(key as string)) {
        window.localStorage.setItem(key as string, value as string);
      }
    },
    [SAVE_KEY, save],
  );
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
  await page.goto(`/#/play?l=${lockedLevelCode()}`);
  const locked = page.getByTestId('vehicle-v3');
  await expect(locked).toBeVisible();
  await expect(locked).toHaveAccessibleName(/gesperrt/);
  await expect(page.getByTestId('vehicle-v2')).toHaveAccessibleName(/Schlüssel/);
  await expect(page.getByTestId('intro-dialog')).toHaveCount(0);
  await locked.click();
  await expect(page.getByTestId('live')).toContainText('gesperrt');
});
