import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

const SAVE_KEY = 'parking.save.v1';

/** Gewinnfolge fuer Level 007: eine handgebaute Fixture mit bekannter Loesung. */
export const WIN_ORDER = ['v1', 'v2', 'v3', 'v4', 'v5', 'v8', 'v7', 'v9', 'v10', 'v11', 'v6'];

/** Zugfolge, die auf Level 007 zur Niederlage fuehrt. */
export const LOSE_ORDER = ['v11', 'v8', 'v7', 'v6', 'v3'];

export async function tapAll(page: Page, ids: string[]): Promise<void> {
  for (const id of ids) await page.getByTestId(`vehicle-${id}`).click();
}

/** Oeffnet Level 007 und spielt die Gewinnfolge bis zum Sieg-Dialog. */
export async function win007(page: Page): Promise<void> {
  await page.goto('/#/level/01/007');
  await expect(page.getByTestId('vehicle-v1')).toBeVisible();
  await tapAll(page, WIN_ORDER);
  await expect(page.getByTestId('win-dialog')).toBeVisible();
}

/** Schreibt den Spielstand nur beim ersten Laden, damit spaetere Aenderungen (gesehene Intros) bleiben. */
export async function seedSave(page: Page, save: string): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      if (!window.localStorage.getItem(key as string)) {
        window.localStorage.setItem(key as string, value as string);
      }
    },
    [SAVE_KEY, save],
  );
}

/** Spielstand, in dem alle Level der angegebenen Packs (Route-Segment -> Level-IDs) geschafft sind. */
export function completedSave(packs: Record<string, readonly string[]>): string {
  const levels: Record<string, { stars: number; bestMoves: number; completed: boolean }> = {};
  for (const [pack, ids] of Object.entries(packs)) {
    for (const id of ids) levels[`${pack}/${id}`] = { stars: 3, bestMoves: 20, completed: true };
  }
  return JSON.stringify({ version: 1, levels });
}
