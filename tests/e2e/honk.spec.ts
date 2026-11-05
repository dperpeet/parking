import { expect, test } from '@playwright/test';
import { tapAll } from './support';

/**
 * Share-Code (Ruleset world2): Blau (v1) schaut nach Osten, das gruene Fahrzeug (v2) steht quer auf
 * seinem Weg (Laenge 2, Kopf unten). Mit der Hupe weicht v2 um eine Zelle nach hinten (Norden) aus, danach kann v1 ausfahren.
 */
const HONK_CODE =
  '1.q1YqUrJSKs8vykkxUtJRSleyijbTMYvVUSoDsqINdYx0lFyB4sVAnJRTmqoUqxNtDBIMhgqmF6Wm5inFAjVkAzVA1MBFdZQKgIIGOgY6hjqGQF4J0CqP0gKgVC0A';

test('Hupe gibt es nur, wenn das Ruleset sie aktiviert', async ({ page }) => {
  await page.goto('/#/level/01/007');
  await expect(page.getByTestId('vehicle-v1')).toBeVisible();
  await expect(page.getByTestId('powerup-honk')).toBeHidden();

  await page.goto(`/#/play?l=${HONK_CODE}`);
  await expect(page.getByTestId('vehicle-v1')).toBeVisible();
  await expect(page.getByTestId('powerup-honk')).toBeVisible();
  await expect(page.getByTestId('powerup-honk').locator('.badge')).toHaveText('1');
});

test('Hupen: Zielmodus, Blocker weicht aus, Fahrzeug faehrt aus', async ({ page }) => {
  await page.goto(`/#/play?l=${HONK_CODE}`);
  const honk = page.getByTestId('powerup-honk');
  await expect(page.getByTestId('vehicle-v1')).toBeVisible();
  const before = await page.getByTestId('vehicle-v2').boundingBox();

  // Direktes Antippen ist blockiert; die Hupe loest das.
  await honk.click();
  await expect(honk).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('honk-hint')).toHaveText('Welches Auto steckt fest? Tippe es an.');
  await page.getByTestId('vehicle-v1').click();
  await expect(page.getByTestId('live')).toHaveText('Das grüne Fahrzeug weicht aus');
  await expect(honk).toHaveAttribute('aria-pressed', 'false');
  await expect(honk).toBeDisabled();
  await expect(honk.locator('.badge')).toHaveText('0');

  // Der DOM-Button des Blockers liegt nun an der neuen Position (eine Zelle weiter oben).
  await expect
    .poll(async () => (await page.getByTestId('vehicle-v2').boundingBox())?.y ?? 0)
    .toBeLessThan((before?.y ?? 0) - 10);

  // Das hupende Fahrzeug kann jetzt ausfahren; danach das gruene, dann ist das Level geschafft.
  await tapAll(page, ['v1', 'v2']);
  await expect(page.getByTestId('win-dialog')).toBeVisible();
});

test('Esc, erneuter Klick und Taste H steuern den Zielmodus', async ({ page }) => {
  await page.goto(`/#/play?l=${HONK_CODE}`);
  const honk = page.getByTestId('powerup-honk');
  await expect(page.getByTestId('vehicle-v1')).toBeVisible();

  await honk.click();
  await expect(honk).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(honk).toHaveAttribute('aria-pressed', 'false');

  await honk.click();
  await honk.click();
  await expect(honk).toHaveAttribute('aria-pressed', 'false');

  await page.keyboard.press('h');
  await expect(honk).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('h');
  await expect(honk).toHaveAttribute('aria-pressed', 'false');
  // Abgebrochen: nichts verbraucht.
  await expect(honk.locator('.badge')).toHaveText('1');
});

test('Hupen ohne Blocker zeigt eine Meldung, der Zielmodus bleibt aktiv', async ({ page }) => {
  await page.goto(`/#/play?l=${HONK_CODE}`);
  const honk = page.getByTestId('powerup-honk');
  await expect(page.getByTestId('vehicle-v2')).toBeVisible();
  await honk.click();
  // Das gruene Fahrzeug hat freie Fahrt: nichts zum Ausweichen.
  await page.getByTestId('vehicle-v2').click();
  await expect(page.getByTestId('live')).toHaveText('Das Auto kann doch fahren!');
  await expect(page.locator('.toast')).toHaveText('Das Auto kann doch fahren!');
  await expect(honk).toHaveAttribute('aria-pressed', 'true');
  await expect(honk.locator('.badge')).toHaveText('1');
  // Abbrechen-Knopf im Banner beendet den Modus.
  await page.getByTestId('honk-cancel').click();
  await expect(honk).toHaveAttribute('aria-pressed', 'false');
});
