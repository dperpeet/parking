import { expect, test } from '@playwright/test';
import { tapAll } from './support';

// Fixture tests/e2e/fixtures/levels/pack-e2e/mystery.json (nur in E2E-Builds per Route erreichbar):
// a (blau) blockiert m1 (gruen) und m2 (pink), m1 blockiert m3 (orange). Alle Mystery-Fahrzeuge starten verdeckt.
const ROUTE = '/#/level/e2e/mystery';

test('Mystery: Intro-Karte, "?"-Fahrzeuge ohne Farbe, Aufdecken nach dem Blocker', async ({
  page,
}) => {
  await page.goto(ROUTE);
  const intro = page.getByTestId('intro-dialog');
  await expect(intro).toHaveAttribute('data-mechanic', 'mystery');
  await expect(intro).toContainText('Mystery-Autos');
  await expect(intro).toContainText('sobald ihr Weg nach draußen frei ist');
  await page.getByTestId('intro-start').click();

  const m1 = page.getByTestId('vehicle-m1');
  const m3 = page.getByTestId('vehicle-m3');
  await expect(m1).toHaveAttribute('data-hidden', 'true');
  await expect(m1).toHaveAttribute('aria-label', /^Fahrzeug mit unbekannter Farbe/);
  await expect(page.getByTestId('vehicle-a')).not.toHaveAttribute('data-hidden', 'true');
  // Die verdeckten Farben stehen nirgends im DOM.
  const board = await page
    .locator('[data-vehicle]')
    .evaluateAll((els) => els.map((el) => el.outerHTML).join(''));
  expect(board).not.toMatch(/grün|pink|orange/i);

  // Verdeckt ist nie antippbar: blockiert, Ansage ohne Farbe.
  await m1.click();
  await expect(page.getByTestId('live')).toHaveText('Fahrzeug mit unbekannter Farbe ist blockiert');

  // Blocker weg: m1 und m2 zeigen ihre Farbe, m3 bleibt verdeckt.
  await page.getByTestId('vehicle-a').click();
  await expect(m1).not.toHaveAttribute('data-hidden', 'true');
  await expect(m1).toHaveAttribute('aria-label', /^Grünes Fahrzeug/);
  await expect(page.getByTestId('vehicle-m2')).toHaveAttribute('aria-label', /^Pinkes Fahrzeug/);
  await expect(m3).toHaveAttribute('data-hidden', 'true');
  await expect(page.getByTestId('live')).toContainText('Aufgedeckt: Grünes Fahrzeug');

  // Undo verdeckt nichts erneut.
  await page.getByTestId('powerup-undo').click();
  await expect(page.getByTestId('vehicle-a')).toBeVisible();
  await expect(m1).toHaveAttribute('aria-label', /^Grünes Fahrzeug/);

  await tapAll(page, ['a', 'm1']);
  await expect(m3).not.toHaveAttribute('data-hidden', 'true');
  await tapAll(page, ['m2', 'm3']);
  await expect(page.getByTestId('win-dialog')).toBeVisible();
});
