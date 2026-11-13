import { expect, test } from '@playwright/test';
import level001 from '../../src/content/levels/pack-05/001.json' with { type: 'json' };
import world1 from '../../src/content/levels/pack-01/index.json' with { type: 'json' };
import world2 from '../../src/content/levels/pack-02/index.json' with { type: 'json' };
import world3 from '../../src/content/levels/pack-03/index.json' with { type: 'json' };
import world4 from '../../src/content/levels/pack-04/index.json' with { type: 'json' };
import { completedSave, seedSave, tapAll } from './support';

// Welt 5 Level 001: ein Pfeil (Reihe 3, Spalte 5, nach links). v2 faehrt nach unten auf den Pfeil, biegt ab
// und muss durch Reihe 3, die v1 anfangs versperrt. Kuerzeste Loesung: v1 bis v6 in Reihenfolge.
const ROUTE = '/#/level/05/001';
const BLOCKER = 'v1';
const TURNING = 'v2';
const WIN_ORDER = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6'];

test('Einbahn (Welt 5 Level 1): Intro, Pfeil fuer Screenreader, abbiegendes Auto faehrt nach dem Blocker', async ({
  page,
}) => {
  // Die Annahmen ueber das Level stehen fest, damit eine Neugenerierung hier auffaellt.
  expect(level001.grid.cells).toEqual([{ x: 4, y: 2, type: 'oneWay', dir: 'W' }]);
  expect(level001.vehicles.find((v) => v.id === TURNING)).toMatchObject({ pos: [4, 1], dir: 'S' });
  expect(level001.vehicles.find((v) => v.id === BLOCKER)).toMatchObject({ pos: [0, 2], dir: 'W' });

  await seedSave(
    page,
    completedSave({
      '01': world1.levels,
      '02': world2.levels,
      '03': world3.levels,
      '04': world4.levels,
    }),
  );
  await page.goto(ROUTE);
  const intro = page.getByTestId('intro-dialog');
  await expect(intro).toHaveAttribute('data-mechanic', 'oneWay');
  await expect(intro).toContainText('Abbiegepfeile');
  await expect(intro).toContainText('Gegen den Pfeil geht es nicht weiter');
  await page.getByTestId('intro-start').click();
  await expect(intro).toHaveCount(0);

  // Das Spielfeld beschreibt seinen Pfeil.
  const note = page.getByTestId('arrow-note');
  await expect(note).toHaveText('Abbiegepfeile: Reihe 3, Spalte 5: Einbahn nach links');
  await expect(page.locator('.board-wrap')).toHaveAttribute('aria-describedby', 'board-arrows');

  // Vor dem Blocker steckt das abbiegende Auto fest.
  const turning = page.getByTestId(`vehicle-${TURNING}`);
  await turning.click();
  await expect(page.getByTestId('live')).toContainText('ist blockiert');
  await expect(turning).toBeVisible();

  // Blocker weg: das Auto biegt ab, faehrt hinaus und steht in der Halteschlange.
  const filled = page.locator('.slot-queue .slot-filled');
  await page.getByTestId(`vehicle-${BLOCKER}`).click();
  await expect(filled).toHaveCount(1);
  await turning.click();
  await expect(turning).toHaveCount(0);
  await expect(filled).toHaveCount(2);
  await expect(page.getByTestId('live')).toContainText('Halteposition 2');

  await tapAll(page, WIN_ORDER.slice(2));
  const win = page.getByTestId('win-dialog');
  await expect(win).toBeVisible();
  await expect(win.locator('.star-on')).toHaveCount(3);
});
