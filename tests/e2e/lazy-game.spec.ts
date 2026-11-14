import { expect, test } from '@playwright/test';

// Das Spielfeld (game-screen samt PixiJS) ist ein eigener Chunk, der erst beim Levelstart geladen wird.
const GAME_CHUNK = /\/assets\/game-screen-[^/]+\.js$/;

test('Levelauswahl laedt ohne Spielfeld-Chunk; der Levelstart laedt ihn nach', async ({ page }) => {
  const loaded: string[] = [];
  page.on('request', (r) => {
    if (GAME_CHUNK.test(new URL(r.url()).pathname)) loaded.push(r.url());
  });
  // Vorladen im Leerlauf unterbinden, damit erst der Klick den Chunk anfordert.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'requestIdleCallback', { value: () => 0 });
  });
  await page.goto('/');
  await expect(page.getByTestId('level-select')).toBeVisible();
  expect(loaded).toEqual([]);
  await page.getByTestId('tile-1-1').click();
  await expect(page.getByRole('heading', { name: 'Level 1' })).toBeVisible();
  expect(loaded).toHaveLength(1);
});

test('Spielfeld-Chunk nicht ladbar: Meldung, Zum Menue und Erneut versuchen', async ({ page }) => {
  await page.route(GAME_CHUNK, (route) => route.abort('internetdisconnected'));
  await page.goto('/');
  await page.getByTestId('tile-1-1').click();
  const error = page.getByTestId('chunk-error');
  await expect(error).toBeVisible();
  await expect(error.getByRole('alert')).toHaveText(
    'Das Spielfeld konnte nicht geladen werden. Bist du offline?',
  );
  await expect(error.getByTestId('retry')).toBeFocused();

  await error.getByRole('button', { name: 'Zum Menü' }).click();
  await expect(page.getByTestId('level-select')).toBeVisible();

  await page.getByTestId('tile-1-1').click();
  await expect(page.getByTestId('chunk-error')).toBeVisible();
  // Wieder online: Erneut versuchen laedt die Seite neu und startet das Level aus dem Hash.
  await page.unroute(GAME_CHUNK);
  await page.getByTestId('retry').click();
  await expect(page).toHaveURL(/#\/level\/01\/001$/);
  await expect(page.getByRole('heading', { name: 'Level 1' })).toBeVisible();
  await expect(page.getByTestId('chunk-error')).toHaveCount(0);
});

test('Langsamer Spielfeld-Chunk: kurze Ladeanzeige, danach startet das Level', async ({ page }) => {
  await page.route(GAME_CHUNK, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await route.continue();
  });
  await page.goto('/#/level/01/001');
  const loading = page.getByTestId('chunk-loading');
  await expect(loading).toHaveAttribute('role', 'status');
  await expect(loading).toHaveText('Level wird erstellt …');
  await expect(page.getByRole('heading', { name: 'Level 1' })).toBeVisible();
  await expect(loading).toHaveCount(0);
});
