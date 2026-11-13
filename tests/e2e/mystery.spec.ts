import { expect, test } from '@playwright/test';
import level001 from '../../src/content/levels/pack-04/001.json' with { type: 'json' };
import world1 from '../../src/content/levels/pack-01/index.json' with { type: 'json' };
import world2 from '../../src/content/levels/pack-02/index.json' with { type: 'json' };
import world3 from '../../src/content/levels/pack-03/index.json' with { type: 'json' };
import { completedSave, seedSave, tapAll } from './support';

// Welt 4 Level 001: v1 (blau) blockiert das verdeckte Mystery-Fahrzeug v2 (gruen); nach v1 ist v2 frei.
// Kuerzeste Loesung: v1 bis v6 in Reihenfolge.
const ROUTE = '/#/level/04/001';
const BLOCKER = 'v1';
const MYSTERY = 'v2';
const WIN_ORDER = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6'];

test('Mystery (Welt 4 Level 1): Intro, "?"-Fahrzeug ohne Farbe, Aufdecken nach dem Blocker', async ({
  page,
}) => {
  // Die Annahmen ueber das Level stehen fest, damit eine Neugenerierung hier auffaellt.
  const mysteries = level001.vehicles.filter((v) => 'mystery' in v && v.mystery);
  expect(mysteries.map((v) => [v.id, v.color])).toEqual([[MYSTERY, 'green']]);

  await seedSave(
    page,
    completedSave({ '01': world1.levels, '02': world2.levels, '03': world3.levels }),
  );
  await page.goto(ROUTE);
  const intro = page.getByTestId('intro-dialog');
  await expect(intro).toHaveAttribute('data-mechanic', 'mystery');
  await expect(intro).toContainText('Mystery-Autos');
  await expect(intro).toContainText('sobald ihr Weg nach draußen frei ist');
  await page.getByTestId('intro-start').click();

  const mystery = page.getByTestId(`vehicle-${MYSTERY}`);
  const blocker = page.getByTestId(`vehicle-${BLOCKER}`);
  await expect(mystery).toHaveAttribute('data-hidden', 'true');
  await expect(mystery).toHaveAttribute('aria-label', /^Fahrzeug mit unbekannter Farbe/);
  await expect(blocker).not.toHaveAttribute('data-hidden', 'true');
  // Die verdeckte Farbe steht nirgends im DOM der Fahrzeuge.
  const board = await page
    .locator('[data-vehicle]')
    .evaluateAll((els) => els.map((el) => el.outerHTML).join(''));
  expect(board).not.toMatch(/grün|green/i);

  // Verdeckt ist nie antippbar: blockiert, Ansage ohne Farbe.
  await mystery.click();
  await expect(page.getByTestId('live')).toHaveText('Fahrzeug mit unbekannter Farbe ist blockiert');

  // Blocker weg: das Mystery-Fahrzeug zeigt seine Farbe.
  await blocker.click();
  await expect(mystery).not.toHaveAttribute('data-hidden', 'true');
  await expect(mystery).toHaveAttribute('aria-label', /^Grünes Fahrzeug/);
  await expect(page.getByTestId('live')).toContainText('Aufgedeckt: Grünes Fahrzeug');

  // Undo verdeckt nichts erneut.
  await page.getByTestId('powerup-undo').click();
  await expect(blocker).toBeVisible();
  await expect(mystery).not.toHaveAttribute('data-hidden', 'true');
  await expect(mystery).toHaveAttribute('aria-label', /^Grünes Fahrzeug/);

  await tapAll(page, WIN_ORDER);
  await expect(page.getByTestId('win-dialog')).toBeVisible();
});
